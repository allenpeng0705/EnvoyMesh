import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';
import 'package:dart_libp2p/core/interfaces.dart';
import 'package:logging/logging.dart'; // Added for logging

import 'package:dart_libp2p/core/network/conn.dart'; // Conn is directly available
import 'package:dart_libp2p/core/peer/peer_id.dart'; // For PeerId

import '../../../../core/network/stream.dart'; // For P2PStream, StreamStats
import '../../../../core/network/common.dart' show Direction; // For Direction
import '../../../../core/network/rcmgr.dart' show StreamScope; // For StreamScope
import '../../../../core/network/mux.dart' as core_mux; // For MuxedStream
import 'frame.dart'; // Defines YamuxFrame, YamuxFrameType, YamuxFlags
import 'yamux_exceptions.dart'; // Import Yamux exception handling
import 'metrics_observer.dart'; // For YamuxMetricsObserver

// Added logger instance
final _log = Logger('YamuxStream');

/// Represents a queued write operation for backpressure handling
class _QueuedWrite {
  final Uint8List data;
  final Completer<void> completer;
  final DateTime queuedAt;
  
  _QueuedWrite(this.data, this.completer, this.queuedAt);
}

/// Stream states in Yamux
enum YamuxStreamState {
  /// Stream is new and not yet established
  init,
  /// Stream is open and ready for data
  open,
  /// Stream is closing (remote sent FIN, or local read closed)
  closing,
  /// Stream is closed (local close() called and FIN sent, or cleanup after reset/error)
  closed,
  /// Stream has been reset
  reset
}

/// A Yamux stream that implements the P2PStream and MuxedStream interfaces
class YamuxStream implements P2PStream<Uint8List>, core_mux.MuxedStream {
  /// The stream ID
  final int streamId;

  /// The protocol ID associated with this stream
  String streamProtocol;

  /// Stream metadata
  final Map<String, dynamic> metadata;

  /// The current state of the stream
  YamuxStreamState _state = YamuxStreamState.init;

  /// Controller for incoming data (not used directly for P2PStream.read, but could be for other listeners)
  final _incomingController = StreamController<Uint8List>.broadcast();

  /// Window size for flow control (how much data remote is allowed to send us)
  int _localReceiveWindow; // Renamed from _windowSize in constructor for clarity

  /// Window size for flow control (how much data we are allowed to send remote)
  int _remoteReceiveWindow; // This is what _windowSize was tracking for writes

  /// Function to send frames
  final Future<void> Function(YamuxFrame frame) _sendFrame;

  /// The parent connection (YamuxSession)
  final Conn _parentConn; // Added field
  
  /// Metrics observer for reporting stream events
  final YamuxMetricsObserver? _metricsObserver;
  
  /// Remote peer ID for metrics reporting
  final PeerId? _remotePeer;
  
  /// When the stream was opened (for duration calculation)
  DateTime? _openedAt;
  
  /// Total bytes read from this stream
  int _bytesRead = 0;
  
  /// Total bytes written to this stream
  int _bytesWritten = 0;

  /// Bytes consumed from our local receive window since last window update sent to remote
  int _consumedBytesForLocalWindowUpdate = 0;

  /// Minimum bytes to consume before sending window update for our local receive window
  static const _minWindowUpdateBytes = 32 * 1024; // 32KB

  /// Completer for when our send window (_remoteReceiveWindow) is updated by remote
  Completer<void>? _sendWindowUpdateCompleter;

  /// Queue for incoming data
  final _incomingQueue = <Uint8List>[];

  /// Pushes data to the front of the incoming queue, so the next read() returns it.
  /// Used to inject leftover bytes after multistream-select negotiation.
  void pushData(Uint8List data) {
    if (data.isEmpty) return;
    if (_readCompleter != null && !_readCompleter!.isCompleted) {
      _readCompleter!.complete(data);
    } else {
      _incomingQueue.insert(0, data);
    }
  }

  /// Completer for next read operation
  Completer<Uint8List>? _readCompleter;

  /// Flag to indicate if a local FIN has been sent via closeWrite()
  bool _localFinSent = false;

  /// Flag to indicate if a local read has been closed via closeRead()
  bool _localReadClosed = false;

  /// Stream deadline for timeout management (for both read and write)
  DateTime? _deadline;

  /// Read-specific deadline
  DateTime? _readDeadline;

  /// Write-specific deadline (reserved for future write timeout implementation)
  // ignore: unused_field
  DateTime? _writeDeadline;

  final String _logPrefix;

  /// Transport performance monitoring for adaptive backpressure
  final List<Duration> _recentWriteLatencies = [];
  static const int _maxLatencyHistory = 10;
  static const Duration _slowWriteThreshold = Duration(milliseconds: 100);
  static const Duration _verySlowWriteThreshold = Duration(milliseconds: 500);
  
  /// Write queue for backpressure handling
  final Queue<_QueuedWrite> _writeQueue = Queue<_QueuedWrite>();
  bool _isProcessingWrites = false;
  static const int _maxQueuedWrites = 50;

  /// Frame processing queue for handling rapid frame delivery
  final Queue<YamuxFrame> _frameQueue = Queue<YamuxFrame>();
  bool _isProcessingFrames = false;
  static const int _maxQueuedFrames = 100;
  static const int _maxFramesPerBatch = 10;
  static const Duration _frameProcessingDelay = Duration(milliseconds: 2);

  /// Maximum size of a single DATA frame payload
  /// This limits the size of Yamux frames to prevent head-of-line blocking
  /// when encrypted messages are lost or delayed at the transport layer.
  final int _maxFrameSize;

  /// Checks if the stream deadline has been exceeded
  void _checkDeadline() {
    if (_deadline != null && DateTime.now().isAfter(_deadline!)) {
      final timeExceeded = DateTime.now().difference(_deadline!);
      _log.warning('$_logPrefix Stream deadline exceeded by ${timeExceeded.inMilliseconds}ms');
      throw YamuxStreamTimeoutException(
        'Stream deadline exceeded',
        timeout: timeExceeded,
        operation: 'deadline_check',
        streamId: streamId,
      );
    }
  }

  /// Gets the remaining time until deadline, or null if no deadline set
  /// Get the remaining time until the deadline, considering both general and read-specific deadlines
  Duration? _getRemainingDeadlineTime() {
    DateTime? effectiveDeadline = _deadline;
    
    // If read deadline is set, use the earlier of the two deadlines
    if (_readDeadline != null) {
      if (effectiveDeadline == null || _readDeadline!.isBefore(effectiveDeadline)) {
        effectiveDeadline = _readDeadline;
      }
    }
    
    if (effectiveDeadline == null) return null;
    final remaining = effectiveDeadline.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  YamuxStream({
    required int id,
    required String protocol,
    required Map<String, dynamic>? metadata,
    required int initialWindowSize, // This is the initial window for both sides
    required Future<void> Function(YamuxFrame frame) sendFrame,
    required Conn parentConn, // Added parameter
    PeerId? remotePeer, // For metrics reporting (null before security handshake)
    required int maxFrameSize, // Maximum DATA frame payload size
    YamuxMetricsObserver? metricsObserver, // For metrics reporting
    String? logPrefix,
  })  : streamId = id,
        streamProtocol = protocol,
        metadata = metadata ?? {},
        _localReceiveWindow = initialWindowSize,
        _remoteReceiveWindow = initialWindowSize, // Initially, we can send this much
        _sendFrame = sendFrame,
        _parentConn = parentConn, // Initialize field
        _remotePeer = remotePeer,
        _maxFrameSize = maxFrameSize,
        _metricsObserver = metricsObserver,
        _logPrefix = logPrefix ?? "StreamID=$id" {
    _log.fine('$_logPrefix Constructor. Initial local window: $_localReceiveWindow, Initial remote window (our send): $_remoteReceiveWindow, Max frame size: $_maxFrameSize');
  }

  /// Opens the stream (called by session when creating a new stream locally or accepting one)
  Future<void> open() async {
    _log.finer('$_logPrefix open() called. Current state: $_state');
    if (_state != YamuxStreamState.init) {
      _log.warning('$_logPrefix open() called on stream not in init state: $_state');
      throw StateError('Stream is not in init state');
    }
    _state = YamuxStreamState.open;
    _openedAt = DateTime.now();
    _log.fine('$_logPrefix Stream opened. State: $_state. Sending initial window update.');

    // Send initial window update to the remote peer
    final frame = YamuxFrame.windowUpdate(streamId, _localReceiveWindow);
    await _sendFrame(frame);
  }

  /// Opens the stream for an incoming (remote-initiated) stream.
  /// Unlike [open()], this fire-and-forgets the initial window update
  /// so it doesn't block the yamux read loop when the UDX write path
  /// is congestion-stalled.
  Future<void> openIncoming() async {
    _log.finer('$_logPrefix openIncoming() called. Current state: $_state');
    if (_state != YamuxStreamState.init) {
      _log.warning('$_logPrefix openIncoming() called on stream not in init state: $_state');
      throw StateError('Stream is not in init state');
    }
    _state = YamuxStreamState.open;
    _openedAt = DateTime.now();
    _log.fine('$_logPrefix Stream opened (incoming). Sending initial window update (fire-and-forget).');

    // Fire-and-forget: don't block the read loop on the window update send.
    final frame = YamuxFrame.windowUpdate(streamId, _localReceiveWindow);
    _sendFrame(frame).catchError((e) {
      _log.warning('$_logPrefix Error sending initial window update: $e');
    });
  }

  @override
  Future<void> write(List<int> data) async {
    final inputDataLength = data.length;
    _log.fine('$_logPrefix [YAMUX-WRITE-DIAG] YamuxStream.write ENTERED: $inputDataLength bytes, state=$_state, sendWindow=$_remoteReceiveWindow');
    
    // Check deadline before starting write operation
    _checkDeadline();
    
    if (_localFinSent) {
      _log.warning('$_logPrefix YamuxStream.write: Called after closeWrite(). State: $_state.');
      throw StateError('Stream is closed for writing.');
    }

    // Allow writes in both 'open' and 'closing' states
    // 'closing' means remote sent FIN, but we can still write (half-close)
    if (_state != YamuxStreamState.open && _state != YamuxStreamState.closing) {
      _log.warning('$_logPrefix YamuxStream.write: Called on non-open/non-closing stream. State: $_state. Requested: $inputDataLength bytes.');
      throw YamuxStreamStateException(
        'Stream is not open for writing',
        currentState: _state.name,
        requestedOperation: 'write',
        streamId: streamId,
      );
    }

    if (inputDataLength == 0) {
      _log.fine('$_logPrefix YamuxStream.write: Requested to write 0 bytes. No action taken.');
      return;
    }

    // Use adaptive backpressure handling for large writes or slow transports
    if (_shouldUseBackpressureHandling(data)) {
      return await _writeWithBackpressure(data);
    }

    // Use direct write for small writes or fast transports
    return await _writeDirectly(data);
  }

  /// Determines if backpressure handling should be used for this write
  bool _shouldUseBackpressureHandling(List<int> data) {
    // Use backpressure for large writes
    if (data.length > 32 * 1024) return true;
    
    // Use backpressure if transport is showing signs of being slow
    if (_recentWriteLatencies.isNotEmpty) {
      final avgLatency = _recentWriteLatencies.reduce((a, b) => a + b) ~/ _recentWriteLatencies.length;
      if (avgLatency > _slowWriteThreshold) return true;
    }
    
    // Use backpressure if write queue is building up
    if (_writeQueue.length > 5) return true;
    
    return false;
  }

  /// Write with adaptive backpressure handling
  Future<void> _writeWithBackpressure(List<int> data) async {
    final dataToWrite = data is Uint8List ? data : Uint8List.fromList(data);
    final completer = Completer<void>();
    final queuedWrite = _QueuedWrite(dataToWrite, completer, DateTime.now());
    
    // Check queue limits
    if (_writeQueue.length >= _maxQueuedWrites) {
      _log.warning('$_logPrefix Write queue full (${_writeQueue.length}), applying backpressure');
      throw StateError('Write queue full - transport is too slow');
    }
    
    _writeQueue.add(queuedWrite);
    _log.fine('$_logPrefix Queued write of ${data.length} bytes. Queue length: ${_writeQueue.length}');
    
    // Start processing if not already running
    if (!_isProcessingWrites) {
      _processWriteQueue();
    }
    
    return completer.future;
  }

  /// Direct write without queuing (for small/fast writes)
  Future<void> _writeDirectly(List<int> data) async {
    final writeStart = DateTime.now();
    
    try {
      var offset = 0;
      final Uint8List dataToWrite = data is Uint8List ? data : Uint8List.fromList(data);

      // Allow writes in both 'open' and 'closing' states (half-close support)
      while (offset < dataToWrite.length && (_state == YamuxStreamState.open || _state == YamuxStreamState.closing)) {
        if (_remoteReceiveWindow == 0) {
          _log.fine('$_logPrefix Direct write: Send window is 0. Waiting for remote to update. Offset: $offset/${dataToWrite.length}');
          _sendWindowUpdateCompleter ??= Completer<void>();
          await _sendWindowUpdateCompleter!.future;
          _sendWindowUpdateCompleter = null;
        }
        
        if (_state != YamuxStreamState.open && _state != YamuxStreamState.closing) {
          _log.warning('$_logPrefix Direct write: Stream state changed to $_state while waiting for window. Aborting write.');
          break;
        }

        final remaining = dataToWrite.length - offset;
        // Limit chunk size by:
        // 1. _maxFrameSize - prevents large encrypted messages that cause head-of-line blocking
        // 2. _remoteReceiveWindow - respects flow control from the receiver
        // Using smaller frames improves resilience to packet loss and allows better
        // interleaving of control frames (window updates, pings) with data frames.
        int chunkSize = remaining;
        if (chunkSize > _maxFrameSize) chunkSize = _maxFrameSize;
        if (chunkSize > _remoteReceiveWindow) chunkSize = _remoteReceiveWindow;
        
        if (chunkSize == 0) {
          if (remaining > 0) {
            _log.warning('$_logPrefix Direct write: Calculated chunkSize is 0 but $remaining bytes remaining. Breaking loop.');
            break;
          } else {
            break; // All data sent
          }
        }

        final chunk = dataToWrite.sublist(offset, offset + chunkSize);
        final frame = YamuxFrame.createData(streamId, chunk);
        
        await _sendFrame(frame);
        
        _bytesWritten += chunkSize; // Track bytes written
        _remoteReceiveWindow -= chunkSize;
        offset += chunkSize;
      }

      // Record write latency for adaptive behavior
      final writeLatency = DateTime.now().difference(writeStart);
      _recordWriteLatency(writeLatency);
      
      if (offset == dataToWrite.length) {
        _log.fine('$_logPrefix Direct write: Successfully wrote all ${data.length} bytes in ${writeLatency.inMilliseconds}ms');
      } else {
        _log.warning('$_logPrefix Direct write: Partial write - wrote $offset of ${dataToWrite.length} bytes');
      }

    } catch (e, st) {
      _log.severe('$_logPrefix Direct write: Error during write of ${data.length} bytes: $e\n$st');
      if (_state == YamuxStreamState.open || _state == YamuxStreamState.closing) {
        await reset();
      }
      rethrow;
    }
  }

  /// Process the write queue with adaptive pacing
  Future<void> _processWriteQueue() async {
    if (_isProcessingWrites) return;
    _isProcessingWrites = true;
    
    try {
      // Allow processing writes in both 'open' and 'closing' states (half-close support)
      while (_writeQueue.isNotEmpty && (_state == YamuxStreamState.open || _state == YamuxStreamState.closing)) {
        final queuedWrite = _writeQueue.removeFirst();
        final queueTime = DateTime.now().difference(queuedWrite.queuedAt);
        
        _log.fine('$_logPrefix Processing queued write of ${queuedWrite.data.length} bytes (queued for ${queueTime.inMilliseconds}ms)');
        
        try {
          await _writeDirectly(queuedWrite.data);
          queuedWrite.completer.complete();
          
          // Adaptive pacing based on transport performance
          await _adaptivePacing();
          
        } catch (e) {
          queuedWrite.completer.completeError(e);
          _log.warning('$_logPrefix Failed to process queued write: $e');
        }
      }
    } finally {
      _isProcessingWrites = false;
    }
  }

  /// Record write latency for adaptive behavior
  void _recordWriteLatency(Duration latency) {
    _recentWriteLatencies.add(latency);
    if (_recentWriteLatencies.length > _maxLatencyHistory) {
      _recentWriteLatencies.removeAt(0);
    }
  }

  /// Adaptive pacing between writes based on transport performance
  Future<void> _adaptivePacing() async {
    if (_recentWriteLatencies.isEmpty) return;
    
    final avgLatency = _recentWriteLatencies.reduce((a, b) => a + b) ~/ _recentWriteLatencies.length;
    
    if (avgLatency > _verySlowWriteThreshold) {
      // Very slow transport - significant delay
      await Future.delayed(Duration(milliseconds: 50));
      _log.finer('$_logPrefix Applied 50ms pacing for very slow transport (avg: ${avgLatency.inMilliseconds}ms)');
    } else if (avgLatency > _slowWriteThreshold) {
      // Slow transport - moderate delay
      await Future.delayed(Duration(milliseconds: 10));
      _log.finer('$_logPrefix Applied 10ms pacing for slow transport (avg: ${avgLatency.inMilliseconds}ms)');
    } else {
      // Fast transport - minimal delay to yield control
      await Future.delayed(Duration(milliseconds: 1));
    }
  }

  @override
  Future<void> reset() async {
    _log.warning('$_logPrefix [STREAM-RESET-DIAG] reset() called (LOCAL reset, will send RST to remote). Current state: $_state');
    if (_state == YamuxStreamState.closed || _state == YamuxStreamState.reset) {
      _log.finer('$_logPrefix reset() called but stream already closed/reset. State: $_state. Doing nothing.');
      return;
    }
    final previousState = _state;
    _state = YamuxStreamState.reset; // Set state first

    try {
      _log.finer('$_logPrefix Sending RESET frame.');
      final frame = YamuxFrame.reset(streamId);
      await _sendFrame(frame);
    } catch (e) {
      _log.warning('$_logPrefix Error sending RESET frame during reset(): $e. Will proceed with local cleanup.');
    } finally {
      // Notify metrics observer before cleanup
      if (_metricsObserver != null && _remotePeer != null) {
        try {
          _metricsObserver.onStreamReset(
            _remotePeer,
            streamId,
            'Stream reset (previous state: $previousState)',
          );
        } catch (e) {
          _log.warning('$_logPrefix Error notifying metrics observer on reset: $e');
        }
      }
      
      _log.finer('$_logPrefix Cleaning up after reset (was $previousState).');
      await _cleanup();
    }
  }

  @override
  Future<void> close() async {
    _log.fine('$_logPrefix close() called. Current state: $_state');
    if (_state == YamuxStreamState.closed || _state == YamuxStreamState.reset) {
      _log.finer(
          '$_logPrefix close() called but stream already closed/reset. State: $_state. Doing nothing.');
      return;
    }

    final previousState = _state;
    _state = YamuxStreamState.closed; // Immediately transition to closed

    try {
      if (_consumedBytesForLocalWindowUpdate > 0 &&
          previousState == YamuxStreamState.open) {
        _log.finer(
            '$_logPrefix Sending pending WINDOW_UPDATE for $_consumedBytesForLocalWindowUpdate consumed bytes before local FIN.');
        final updateFrame = YamuxFrame.windowUpdate(
            streamId, _consumedBytesForLocalWindowUpdate);
        await _sendFrame(updateFrame);
        _consumedBytesForLocalWindowUpdate = 0;
      }

      _log.finer(
          '$_logPrefix Sending FIN frame (DATA frame with FIN flag) for local close().');
      final frame = YamuxFrame.createData(streamId, Uint8List(0), fin: true);
      await _sendFrame(frame);
    } catch (e) {
      _log.warning(
          '$_logPrefix Error sending FIN frame during close(): $e. Proceeding to forceful cleanup (reset).');
    } finally {
      // Notify metrics observer before cleanup
      if (_metricsObserver != null && _openedAt != null && _remotePeer != null) {
        try {
          final duration = DateTime.now().difference(_openedAt!);
          _metricsObserver.onStreamClosed(
            _remotePeer,
            streamId,
            duration,
            _bytesRead,
            _bytesWritten,
          );
        } catch (e) {
          _log.warning('$_logPrefix Error notifying metrics observer on close: $e');
        }
      }
      
      _log.finer(
          '$_logPrefix close() ensuring cleanup. State before final cleanup: $_state (was $previousState).');
      await _cleanup();
      _log.fine('$_logPrefix close() completed. Final state: $_state');
    }
  }

  @override
  Future<Uint8List> read([int? maxLength]) async {
    return await YamuxExceptionHandler.handleYamuxOperation<Uint8List>(
      () async => await _performRead(maxLength),
      streamId: streamId,
      operationName: 'read',
      currentState: _state.name, // Use .name instead of .toString() to get just "reset" instead of "YamuxStreamState.reset"
      context: {
        'maxLength': maxLength,
        'queueLength': _incomingQueue.length,
        'localReadClosed': _localReadClosed,
      },
    );
  }

  /// Internal read implementation with comprehensive state validation
  Future<Uint8List> _performRead(int? maxLength) async {
    _log.finest('$_logPrefix read(maxLength: $maxLength) called. State: $_state, Queue: ${_incomingQueue.length}');

    // Check deadline before starting read operation
    _checkDeadline();

    // Comprehensive state validation before proceeding
    if (!_isValidStateForRead()) {
      final stateError = _createStateErrorForRead();
      _log.warning('$_logPrefix read() called in invalid state: $_state. ${stateError.message}');
      throw stateError;
    }

    if (_localReadClosed) {
      _log.finer('$_logPrefix read() called after local closeRead. Returning EOF.');
      return Uint8List(0);
    }

    // Return queued data if available
    if (_incomingQueue.isNotEmpty) {
      final data = _incomingQueue.removeAt(0);
      _log.finest('$_logPrefix read() returning ${data.length} bytes from queue.');
      if (maxLength != null && data.length > maxLength) {
        _log.finest('$_logPrefix read() requested maxLength $maxLength, data is ${data.length}. Returning partial and re-queuing ${data.length - maxLength} bytes.');
        _incomingQueue.insert(0, data.sublist(maxLength));
        return data.sublist(0, maxLength);
      }
      return data;
    }

    // Handle special states with empty queue
    if (_state == YamuxStreamState.closing) {
      _log.finer('$_logPrefix read() on remotely closed stream with empty queue. No more data will arrive.');
      
      // FIX: Now that we've consumed all data (queue empty) and received remote FIN (closing state),
      // if we've also sent our FIN (_localFinSent), it's safe to fully cleanup.
      // This ensures cleanup only happens after all data is consumed, not prematurely in closeWrite().
      if (_localFinSent) {
        _log.fine('$_logPrefix Both FINs sent and all data consumed. Now safe to cleanup.');
        await _cleanup();
      }
      
      return Uint8List(0); // Return EOF instead of throwing
    }

    // For open state with empty queue, wait for data with timeout
    if (_state == YamuxStreamState.open) {
      return await _waitForIncomingData(maxLength);
    }

    // Should not reach here due to state validation, but handle gracefully
    _log.warning('$_logPrefix read() reached unexpected code path. State: $_state');
    return Uint8List(0);
  }

  /// Validates if the current state allows read operations
  bool _isValidStateForRead() {
    switch (_state) {
      case YamuxStreamState.open:
      case YamuxStreamState.closing:
        return true;
      case YamuxStreamState.init:
      case YamuxStreamState.closed:
      case YamuxStreamState.reset:
        return false;
    }
  }

  /// Creates appropriate StateError for invalid read state
  StateError _createStateErrorForRead() {
    switch (_state) {
      case YamuxStreamState.init:
        return StateError('Stream is not open (still in init state)');
      case YamuxStreamState.closed:
        return StateError('Stream is closed and no more data available');
      case YamuxStreamState.reset:
        return StateError('Stream is in reset state');
      default:
        return StateError('Stream is in invalid state: $_state');
    }
  }

  /// Waits for incoming data with timeout and proper error handling
  Future<Uint8List> _waitForIncomingData(int? maxLength) async {
    final waitStartTime = DateTime.now();

    
    // Use deadline-aware timeout if deadline is set, otherwise use progressive timeout
    final remainingDeadlineTime = _getRemainingDeadlineTime();
    Duration currentTimeout;
    int attempts = 0;
    int maxAttempts;
    
    if (remainingDeadlineTime != null) {
      // Use deadline-based timeout
      currentTimeout = remainingDeadlineTime;
      maxAttempts = 1; // Don't retry if we have a deadline
    } else if (_deadline == null && _readDeadline == null) {
      // No deadline set - use very long timeout for long-lived connections like relay streams
      // This prevents the progressive 10s→20s→40s timeouts that cause delays on idle relay streams
      currentTimeout = const Duration(minutes: 5);
      maxAttempts = 1; // Single long wait
    } else {
      // Deadline expired but still waiting - use progressive timeout strategy
      currentTimeout = const Duration(seconds: 10);
      maxAttempts = 3;
    }
    
    while (attempts < maxAttempts) {
      final attemptStartTime = DateTime.now();
      attempts++;

      
      try {
        return await YamuxExceptionUtils.withTimeout<Uint8List>(
          () async {

            _readCompleter = Completer<Uint8List>();
            
            try {

              final completerAwaitStart = DateTime.now();
              final data = await _readCompleter!.future;
              final completerAwaitDuration = DateTime.now().difference(completerAwaitStart);
              
              _readCompleter = null;


              // Handle EOF signaled by handleFrame
              if (data.isEmpty && (_state == YamuxStreamState.closing || 
                                   _state == YamuxStreamState.closed || 
                                   _state == YamuxStreamState.reset)) {

                return Uint8List(0); // Signal EOF
              }

              // Handle partial reads
              if (maxLength != null && data.length > maxLength) {
                final chunk = data.sublist(0, maxLength);
                _bytesRead += chunk.length; // Track bytes read
                _incomingQueue.add(data.sublist(maxLength));
                return chunk;
              }
              
              _bytesRead += data.length; // Track bytes read
              return data;
            } catch (e) {
              final completerErrorDuration = DateTime.now().difference(attemptStartTime);
              _readCompleter = null;
              _log.severe('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-COMPLETER-ERROR] Error while waiting for data after ${completerErrorDuration.inMilliseconds}ms: $e. Current state: $_state');

              // Handle all terminal state transitions during read gracefully.
              // When connection closes abruptly, forceReset() sets state to 'reset',
              // or cleanup may set it to 'closed'. Return EOF instead of throwing
              // to allow graceful handling by upper layers.
              if (_state == YamuxStreamState.closing ||
                  _state == YamuxStreamState.closed ||
                  _state == YamuxStreamState.reset) {
                _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-GRACEFUL-EOF] Stream in terminal state $_state, returning EOF');
                return Uint8List(0); // Return EOF instead of throwing
              }

              // For other errors, rethrow with context
              rethrow;
            }
          },
          timeout: currentTimeout,
          streamId: streamId,
          operationName: 'read',
          currentState: _state.name,
        );
      } on YamuxStreamTimeoutException catch (e) {
        final attemptDuration = DateTime.now().difference(attemptStartTime);
        _log.severe('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-TIMEOUT] Timeout on attempt $attempts/$maxAttempts after ${attemptDuration.inMilliseconds}ms: ${e.message}');
        
        // Check if stream is still viable - also check parent connection state
        // for faster failure detection when underlying transport closes
        final parentConnClosed = _parentConn.isClosed;
        if (_state != YamuxStreamState.open || isClosed || parentConnClosed) {
          _log.severe('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-UNVIABLE] Stream no longer viable for retry. State: $_state, Closed: $isClosed, ParentConnClosed: $parentConnClosed');
          throw YamuxStreamStateException(
            'Stream became unavailable during read timeout',
            currentState: _state.name,
            requestedOperation: 'read',
            streamId: streamId,
            originalException: e,
          );
        }
        
        if (attempts >= maxAttempts) {
          final totalDuration = DateTime.now().difference(waitStartTime);
          _log.severe('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-MAX-ATTEMPTS] Max timeout attempts exceeded after ${totalDuration.inMilliseconds}ms total');
          rethrow;
        }
        
        // Exponential backoff for timeout duration
        currentTimeout = Duration(seconds: currentTimeout.inSeconds * 2);
        _log.warning('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-RETRY] Retrying with timeout: ${currentTimeout.inSeconds}s (attempt ${attempts + 1}/$maxAttempts)');
        
        // Brief delay before retry
        await Future.delayed(const Duration(milliseconds: 100));
      }
    }
    
    // Should never reach here
    final totalDuration = DateTime.now().difference(waitStartTime);
    _log.severe('$_logPrefix 🔧 [YAMUX-STREAM-READ-WAIT-FAILED] Read operation failed after $maxAttempts timeout attempts, total duration: ${totalDuration.inMilliseconds}ms');
    throw YamuxStreamTimeoutException(
      'Read operation failed after $maxAttempts timeout attempts',
      timeout: currentTimeout,
      operation: 'read_wait',
      streamId: streamId,
    );
  }

  Future<void> handleFrame(YamuxFrame frame) async {
    final handleStartTime = DateTime.now();

    if (_state == YamuxStreamState.closed || _state == YamuxStreamState.reset) {
      _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-HANDLE-FRAME-SKIP] Stream closed/reset, ignoring frame type ${frame.type}');
      return;
    }

    // Handle RST flag on any frame type
    if (frame.flags & YamuxFlags.rst != 0) {
      _log.warning('$_logPrefix [STREAM-RESET-DIAG] Received REMOTE RST flag on frame type=${frame.type}. Resetting stream from state $_state.');
      _state = YamuxStreamState.reset;
      await _cleanup();
      return;
    }

    // For DATA frames, use optimized queuing to handle rapid delivery
    if (frame.type == YamuxFrameType.dataFrame) {
      return await _handleDataFrameOptimized(frame);
    }

    // Handle other frame types directly (they're less frequent)
    try {
      switch (frame.type) {
        case YamuxFrameType.windowUpdate:
          await _handleWindowUpdateFrame(frame);
          break;

        case YamuxFrameType.ping:
          await _handlePingFrame(frame);
          break;

        default:
          _log.severe('$_logPrefix Received unexpected frame type: ${frame.type}. Resetting stream.');
          await reset(); 
          throw StateError('Unexpected frame type: ${frame.type}');
      }
    } catch (e) {
      _log.severe('$_logPrefix Error in handleFrame(): $e. Current state: $_state');
      if (_state != YamuxStreamState.closed && _state != YamuxStreamState.reset) {
        _log.warning('$_logPrefix Resetting stream due to error in handleFrame.');
        await reset();
      }
      rethrow;
    }
  }

  /// Optimized handler for WINDOW_UPDATE frames
  Future<void> _handleWindowUpdateFrame(YamuxFrame frame) async {
    if (_state != YamuxStreamState.open && _state != YamuxStreamState.closing) {
       _log.finer('$_logPrefix Received WINDOW_UPDATE on non-open/non-closing stream. State: $_state. Ignoring.');
      return;
    }
    final delta = frame.length; // Delta is in the length field per Yamux spec
    _log.finer('$_logPrefix Received WINDOW_UPDATE from remote, delta: $delta. Current our send window: $_remoteReceiveWindow, New: ${_remoteReceiveWindow + delta}');
    _remoteReceiveWindow += delta;
    if (_sendWindowUpdateCompleter?.isCompleted == false) {
      _log.finer('$_logPrefix Completing pending write due to WINDOW_UPDATE.');
      _sendWindowUpdateCompleter!.complete();
    }
  }

  /// Optimized handler for PING frames
  Future<void> _handlePingFrame(YamuxFrame frame) async {
    // Respond to PING if it's a request (flag 0)
    if (frame.flags == 0) { // Ping request
      _log.finer('$_logPrefix Received PING request (flag 0), sending PONG (flag 1). Opaque value: ${frame.length}');
      // Fire-and-forget: don't block the read loop on PONG send.
      final pongFrame = YamuxFrame.ping(true, frame.length);
      _sendFrame(pongFrame).catchError((e) {
        _log.warning('$_logPrefix Error sending PONG response: $e');
      });
    } else { // Ping response (flag 1)
      _log.finer('$_logPrefix Received PONG (PING response flag 1). Opaque value: ${frame.length}');
    }
  }

  /// Optimized handler for DATA frames with queuing and batch processing
  Future<void> _handleDataFrameOptimized(YamuxFrame frame) async {
    _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-HANDLE-DATA-OPT] Processing DATA frame, length: ${frame.length}, flags: ${frame.flags}');

    if (_state == YamuxStreamState.init) { // First data frame opens the stream
      _state = YamuxStreamState.open;
    }
    if (_state != YamuxStreamState.open && _state != YamuxStreamState.closing) { 
      _log.warning('$_logPrefix 🔧 [YAMUX-STREAM-HANDLE-DATA-INVALID-STATE] Received DATA frame on non-open/non-closing stream. State: $_state. Ignoring.');
      return;
    }

    // Check if we're already processing frames and need to queue
    if (_isProcessingFrames) {
      if (_frameQueue.length >= _maxQueuedFrames) {
        _log.warning('$_logPrefix Frame queue full (${_frameQueue.length}), dropping frame to prevent memory exhaustion');
        // Consider this a stream error - too much backpressure
        await reset();
        return;
      }
      _frameQueue.add(frame);
      _log.fine('$_logPrefix Queued DATA frame. Queue length: ${_frameQueue.length}');
      return;
    }

    // Start processing this frame and any queued frames
    _isProcessingFrames = true;
    try {
      await _processDataFrame(frame);
      await _processQueuedDataFrames();
    } finally {
      _isProcessingFrames = false;
    }
  }

  /// Process a single DATA frame with optimized flow control
  Future<void> _processDataFrame(YamuxFrame frame) async {
    if (frame.data.isNotEmpty) {
      // Fast path: deliver directly to waiting reader if available
      if (_readCompleter != null && !_readCompleter!.isCompleted) {
        _readCompleter!.complete(frame.data);
        _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-DATA-DIRECT] Delivered ${frame.data.length} bytes directly to waiting reader');
      } else {
        // Queue for later consumption
        _incomingQueue.add(frame.data);
        _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-DATA-QUEUE] Queued ${frame.data.length} bytes (queue size: ${_incomingQueue.length})');
      }
      
      // Update flow control window
      _consumedBytesForLocalWindowUpdate += frame.data.length;
      _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-HANDLE-DATA-WINDOW] Consumed for local window: $_consumedBytesForLocalWindowUpdate');
      
      // Send window update when threshold reached.
      // Fire-and-forget: don't block the read loop waiting for the write to complete.
      // Update local state immediately so we don't reject data that arrives
      // while the window update send is queued on the write lock.
      if (_consumedBytesForLocalWindowUpdate >= _minWindowUpdateBytes) {
        final bytesToUpdate = _consumedBytesForLocalWindowUpdate;
        _consumedBytesForLocalWindowUpdate = 0;
        _localReceiveWindow += bytesToUpdate;
        final updateFrame = YamuxFrame.windowUpdate(streamId, bytesToUpdate);
        _sendFrame(updateFrame).catchError((e) {
          _log.warning('$_logPrefix Error sending window update for $bytesToUpdate bytes: $e');
        });
        _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-WINDOW-UPDATE] Queued window update for $bytesToUpdate bytes');
      }
    }

    // Handle FIN flag for stream closure
    if (frame.flags & YamuxFlags.fin != 0) {
      if (_state == YamuxStreamState.open) {
        _state = YamuxStreamState.closing;
        _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-FIN] Received FIN, transitioning to closing state');

        // FIX: Complete pending read with EOF (empty data) instead of error.
        // This allows graceful handling of stream closure and proper relay forwarding.
        // The reader will get EOF and can finish processing.
        if (frame.data.isEmpty && _readCompleter != null && !_readCompleter!.isCompleted) {
          _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-FIN] Completing pending read with EOF');
          _readCompleter!.complete(Uint8List(0));
        }
      }
      // FIX: Do NOT cleanup here even if both FINs have been sent.
      // The incoming queue may still have data that needs to be consumed.
      // Cleanup will happen when read() returns EOF and detects both FINs + empty queue.
      // This prevents data loss in bidirectional relay scenarios.
      _log.fine('$_logPrefix 🔧 [YAMUX-STREAM-FIN] FIN received. localFinSent=$_localFinSent, queueSize=${_incomingQueue.length}');
    }
  }

  /// Process queued DATA frames in batches with adaptive yielding
  Future<void> _processQueuedDataFrames() async {
    int processedInBatch = 0;
    final startTime = DateTime.now();
    
    while (_frameQueue.isNotEmpty && _state != YamuxStreamState.closed && _state != YamuxStreamState.reset) {
      final frame = _frameQueue.removeFirst();
      await _processDataFrame(frame);
      processedInBatch++;
      
      // Yield control after processing a batch to prevent event loop blocking
      if (processedInBatch >= _maxFramesPerBatch) {
        await Future.delayed(_frameProcessingDelay);
        processedInBatch = 0;
        _log.fine('$_logPrefix Applied frame processing delay after batch. Remaining queue: ${_frameQueue.length}');
      }
    }
    
    final processingDuration = DateTime.now().difference(startTime);
    if (_frameQueue.isNotEmpty) {
      _log.fine('$_logPrefix Finished processing frames in ${processingDuration.inMilliseconds}ms. Remaining in queue: ${_frameQueue.length}');
    } else if (processedInBatch > 0) {
      _log.fine('$_logPrefix Processed $processedInBatch queued frames in ${processingDuration.inMilliseconds}ms');
    }
  }

  Future<void> _cleanup() async {
    _log.finer('$_logPrefix _cleanup() called. State before cleanup: $_state');
    final previousState = _state;

    // If not already reset, mark as closed. Reset state takes precedence.
    if (_state != YamuxStreamState.reset) {
      _state = YamuxStreamState.closed;
    }
    _log.finer('$_logPrefix _cleanup() - state set to: $_state (was $previousState)');

    if (_sendWindowUpdateCompleter?.isCompleted == false) {
      _log.finer('$_logPrefix _cleanup() completing pending send window update completer with error.');
      _sendWindowUpdateCompleter!.completeError(StateError('Stream $_state while waiting for send window update.'));
       _sendWindowUpdateCompleter = null;
    }

    if (_readCompleter != null && !_readCompleter!.isCompleted ) {
      _log.finer('$_logPrefix _cleanup() completing pending read completer.');
      if (previousState == YamuxStreamState.closing && _state == YamuxStreamState.closed) {
        // Normal close - complete with EOF
        _log.finer('$_logPrefix Completing read with EOF due to normal close.');
        _readCompleter!.complete(Uint8List(0));
      } else {
        // Reset or error state - complete with error that will be handled by exception handler
        final errorMessage = 'Stream $_state.';
        _log.finer('$_logPrefix Completing read with StateError: $errorMessage');
        _readCompleter!.completeError(StateError(errorMessage));
      }
      _readCompleter = null;
    }

    if (_incomingQueue.isNotEmpty) {
        _log.finer('$_logPrefix _cleanup() clearing ${_incomingQueue.length} items from incoming queue.');
        _incomingQueue.clear();
    }

    if (!_incomingController.isClosed) {
        _log.finer('$_logPrefix _cleanup() closing incomingController.');
        _incomingController.close();
    }
    // _outgoingController is managed by the session, not closed here.
    _log.fine('$_logPrefix _cleanup() finished. Final state: $_state');
  }

  @override
  bool get isClosed => _state == YamuxStreamState.closed || _state == YamuxStreamState.reset || _state == YamuxStreamState.closing;

  @override
  bool get isWritable => _state == YamuxStreamState.open;

  YamuxStreamState get streamState => _state; // Expose state for testing/debugging

  int get currentRemoteReceiveWindow => _remoteReceiveWindow; // For testing

  @override
  String id() => streamId.toString();

  @override
  String protocol() => streamProtocol;

  @override
  Future<void> setProtocol(String id) async {
    // DEBUG: Add protocol assignment tracking
    _log.warning('🔍 [YAMUX-STREAM-PROTOCOL-ASSIGN] Stream ID=$streamId, assigning_protocol=$id, previous_protocol=$streamProtocol');
    streamProtocol = id;
    _log.warning('🔍 [YAMUX-STREAM-PROTOCOL-ASSIGN-COMPLETE] Stream ID=$streamId, final_protocol=$streamProtocol');
  }

  @override
  StreamStats stat() {
    return StreamStats(
      direction: Direction.unknown, 
      opened: DateTime.now(), 
      extra: metadata,
    );
  }

  @override
  Conn get conn => _parentConn; // Implemented getter

  @override
  StreamManagementScope scope() {
    // This should be provided by the session or resource manager
    throw UnimplementedError('scope() is not implemented for YamuxStream directly.');
  }

  @override
  Future<void> closeWrite() async {
    _log.finer('$_logPrefix closeWrite() called. Current state: $_state');
    if (_state != YamuxStreamState.open && _state != YamuxStreamState.closing) {
      _log.finer('$_logPrefix closeWrite() called on stream not in open/closing state: $_state. Doing nothing.');
      return;
    }

    try {
      _log.finer('$_logPrefix Sending FIN frame for closeWrite().');
      final frame = YamuxFrame.createData(streamId, Uint8List(0), fin: true);
      await _sendFrame(frame);
      // Sending FIN locally means we won't write anymore.
      _localFinSent = true;
      _log.fine('$_logPrefix closeWrite() sent FIN and set _localFinSent=true. Current stream state: $_state.');

      // FIX: Do NOT call _cleanup() here even if both FINs have been sent.
      // Both FINs sent only means "writing is done on both sides" - reading should
      // continue until all buffered data is consumed. Premature cleanup here was
      // causing bidirectional relay connections to become unidirectional because
      // the incoming queue would be cleared before the relay could forward all data.
      // 
      // The stream will be properly cleaned up when:
      // 1. read() returns EOF (empty data) after both FINs, OR
      // 2. close() is explicitly called, OR
      // 3. reset() is called due to an error
      _log.fine('$_logPrefix closeWrite() completed. Stream remains readable in state: $_state.');
    } catch (e) {
      _log.severe('$_logPrefix Error sending FIN frame during closeWrite(): $e. Resetting stream.');
      await reset(); // Escalate to reset on send error
      rethrow;
    }
  }

  @override
  Future<void> closeRead() async {
    _log.finer('$_logPrefix closeRead() called. Current state: $_state');
    if (_localReadClosed) {
      return;
    }
    _localReadClosed = true;
    _log.finer('$_logPrefix closeRead() set _localReadClosed=true.');

    if (_readCompleter != null && !_readCompleter!.isCompleted) {
      _log.finer('$_logPrefix Completing pending read with EOF due to closeRead().');
      _readCompleter!.complete(Uint8List(0)); // Signal EOF to pending read
    }
  }

  @override
  Future<void> setDeadline(DateTime? time) async {
    _deadline = time;
    _readDeadline = time;
    _writeDeadline = time;
    if (time != null) {
      _log.fine('$_logPrefix setDeadline() set to ${time.toIso8601String()}');
    } else {
      _log.fine('$_logPrefix setDeadline() cleared (set to null)');
    }
  }

  @override
  Future<void> setReadDeadline(DateTime time) async {
    _readDeadline = time;
    _log.fine('$_logPrefix setReadDeadline() set to ${time.toIso8601String()}');
  }

  @override
  Future<void> setWriteDeadline(DateTime time) async {
    _writeDeadline = time;
    _log.fine('$_logPrefix setWriteDeadline() set to ${time.toIso8601String()}');
  }

  @override
  P2PStream<Uint8List> get incoming {
    // This is problematic as P2PStream expects a P2PStream, not a raw Stream.
    // For now, returning a self-reference might be the closest, though not ideal.
    // Proper implementation would require a separate wrapper or different design.
    _log.warning('$_logPrefix incoming getter called, returning self. This might not be the intended use.');
    return this;
    // throw UnimplementedError('incoming getter is not properly implemented for direct P2PStream conversion');
  }

  /// Called by session when it sends an initial window update for this stream.
  void initialWindowSentBySession(int windowSize) {
    _log.finer('$_logPrefix Session confirmed sending initial window update of $windowSize for our receive capacity.');
    // _localReceiveWindow is already set at construction. This is more of an ack.
  }

  /// Forces the stream into reset state without sending frames (e.g., called by session on its own closure)
  Future<void> forceReset() async {
    _log.warning('$_logPrefix [STREAM-RESET-DIAG] forceReset() called (session cleanup). Current state: $_state');
    if (_state == YamuxStreamState.closed || _state == YamuxStreamState.reset) {
      _log.finer('$_logPrefix forceReset() called but stream already closed/reset. State: $_state. Doing nothing.');
      return;
    }
    _state = YamuxStreamState.reset;
    await _cleanup();
    _log.warning('$_logPrefix [STREAM-RESET-DIAG] forceReset() completed. Final state: $_state');
  }
}
