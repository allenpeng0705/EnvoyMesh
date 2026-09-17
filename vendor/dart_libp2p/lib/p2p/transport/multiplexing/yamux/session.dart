import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:logging/logging.dart'; // Added for logging

import '../../../../core/network/conn.dart';
import '../../../../core/network/stream.dart';
import '../../../../core/network/transport_conn.dart';
import '../../../../core/crypto/keys.dart'; // For PublicKey
import '../../../../core/multiaddr.dart'; // For Multiaddr
import '../multiplexer.dart'; // This now brings in core_mux.MuxedConn and PeerScope via its own imports
import '../../../../core/network/mux.dart' as core_mux; // Explicit import for MuxedConn, MuxedStream
import '../../../../core/network/rcmgr.dart'; // Explicit import for PeerScope
import '../../../../core/network/context.dart'; // Explicit import for Context
import 'frame.dart';
import 'stream.dart';
import 'metrics_observer.dart';

// Added logger instance
final _log = Logger('YamuxSession');

/// Reasons for closing a Yamux session
enum YamuxCloseReason {
  /// Normal closure
  normal(0x0),
  /// Protocol error
  protocolError(0x1),
  /// Internal error
  internalError(0x2);

  final int value;
  const YamuxCloseReason(this.value);
}


class YamuxConstants {
  static const String protocolId = '/yamux/1.0.0';
}

/// Yamux session that implements the Multiplexer and MuxedConn interfaces
class YamuxSession implements Multiplexer, core_mux.MuxedConn, Conn { // Added Conn
  static int _instanceCounter = 0; // Added instance counter
  final int _instanceId; // Added instance ID field

  // Session-level performance constants for adaptive behavior
  static const int _maxMetricsHistory = 50;
  static const int _maxFramesPerBatch = 20;
  static const Duration _batchProcessingDelay = Duration(milliseconds: 5);
  static const Duration _stressThreshold = Duration(milliseconds: 50);

  @override
  final String protocolId = YamuxConstants.protocolId;

  final TransportConn _connection;
  final MultiplexerConfig _config;
  final bool _isClient;
  PeerScope? _peerScope;
  final YamuxMetricsObserver? metricsObserver; 

  final _streams = <int, YamuxStream>{};
  int _nextStreamId;
  Future<void> Function(P2PStream stream)? _streamHandler;
  // Using broadcast controller
  final _incomingStreamsController = StreamController<P2PStream>.broadcast();
  // Completer-based approach to prevent race condition where acceptStream()
  // misses events if SYN arrives before .first listener attaches
  Completer<P2PStream>? _pendingAcceptStreamCompleter;
  bool _closed = false;
  bool _cleanupStarted = false; 
  final _initCompleter = Completer<void>();
  Timer? _keepaliveTimer;
  String get _logPrefix => "[$_instanceId][${_isClient ? "Client" : "Server"}]";
  int _lastPingId = 0;
  final _pendingStreams = <int, Completer<void>>{};
  
  // Ping-pong timeout detection
  final Map<int, DateTime> _pendingPings = {};
  static const Duration _pingTimeout = Duration(seconds: 30);
  static const int _pingTimeoutThreshold = 5; // Close after this many timeouts
  
  // Write lock to serialize frame writes and prevent Noise encryption nonce desync
  // This ensures encryption operations complete sequentially to maintain nonce ordering
  final Queue<Completer<void>> _writeLockQueue = Queue<Completer<void>>();
  bool _writeLockHeld = false;

  YamuxSession(this._connection, this._config, this._isClient, [this._peerScope, this.metricsObserver])
      : _instanceId = _instanceCounter++, 
        _nextStreamId = _isClient ? 1 : 2 {
    _init();
  }

  void _init() {
    _readFrames().catchError((error, stackTrace) { 
      if (!_closed) {
        _log.severe('$_logPrefix Uncaught error in _readFrames, initiating GO_AWAY: $error', stackTrace);
        _goAway(YamuxCloseReason.internalError);
      }
    });
    _startKeepalive();
    _initCompleter.complete();
  }

  void _startKeepalive() {
    if (_config.keepAliveInterval == Duration.zero) {
      return;
    }
    _keepaliveTimer = Timer.periodic(_config.keepAliveInterval, (_) => _sendPing());
  }

  Future<void> _sendPing() async {
    if (_closed) return;
    
    // Check for timed-out pings
    final now = DateTime.now();
    final timedOut = _pendingPings.entries
        .where((e) => now.difference(e.value) > _pingTimeout)
        .toList();
    
    if (timedOut.isNotEmpty) {

      // After threshold timeouts, close the session as unhealthy
      // This is lenient for mobile connections with intermittent connectivity
      if (timedOut.length >= _pingTimeoutThreshold) {
        await close();
        return;
      }
    }
    
    final pingId = ++_lastPingId;
    _pendingPings[pingId] = now;
    
    try {
      final frame = YamuxFrame.ping(false, pingId);
      await _sendFrame(frame);

      // Notify metrics observer
      final peer = _remotePeerOrNull;
      if (peer != null) metricsObserver?.onPingSent(peer, pingId, now);
    } catch (e) {
      _log.warning('$_logPrefix ❌ [YAMUX-KEEPALIVE] Error sending PING: $e. Closing session.');
      _pendingPings.remove(pingId);
      // Underlying connection is dead — close session to prevent zombie
      _goAway(YamuxCloseReason.internalError);
    }
  }

  Future<void> _readFrames() async {
    final headerSize = 12;
    var buffer = Uint8List(0); 
    int frameCount = 0;
    int framesInCurrentBatch = 0;
    final startTime = DateTime.now();
    
    // Session-level performance tracking for adaptive behavior
    final List<Duration> _recentFrameProcessingTimes = [];

    // High-volume mode detection to reduce logging overhead
    bool _isHighVolumeMode = false;
    int _recentFrameCount = 0;
    DateTime _lastFrameCountReset = DateTime.now();

    void _updateVolumeMode() {
      final now = DateTime.now();
      if (now.difference(_lastFrameCountReset) > Duration(seconds: 1)) {
        _isHighVolumeMode = _recentFrameCount > 50; // 50+ frames/sec = high volume
        _recentFrameCount = 0;
        _lastFrameCountReset = now;
        
      }
    }


    void _recordFrameProcessingTime(Duration duration) {
      _recentFrameProcessingTimes.add(duration);
      if (_recentFrameProcessingTimes.length > _maxMetricsHistory) {
        _recentFrameProcessingTimes.removeAt(0);
      }
    }

    bool _isSessionUnderStress() {
      if (_recentFrameProcessingTimes.length < 10) return false;
      
      final avgTime = _recentFrameProcessingTimes.reduce((a, b) => a + b) ~/ 
                     _recentFrameProcessingTimes.length;
      return avgTime > _stressThreshold;
    }

    Future<void> _applyAdaptiveDelay() async {
      if (_isSessionUnderStress()) {
        // Apply longer delay when session is under stress
        await Future.delayed(Duration(milliseconds: 10));
      } else {
        // Standard batch processing delay
        await Future.delayed(_batchProcessingDelay);
      }
    }

    try {
      while (!_closed) {
        final loopStartTime = DateTime.now();
        frameCount++;
        framesInCurrentBatch++;
        _recentFrameCount++;
        
        // Update volume mode detection
        _updateVolumeMode();
        

        // Adaptive yielding based on batch processing and session stress
        if (framesInCurrentBatch >= _maxFramesPerBatch) {
          await _applyAdaptiveDelay();
          framesInCurrentBatch = 0;
        } else {
          // Minimal yield for event loop cooperation during normal processing
          await Future.delayed(Duration.zero);
        }
        
        // Ensure we have enough bytes for at least a header
        while (buffer.length < headerSize) {
          if (_closed || _connection.isClosed) { // Check before read
             await _cleanupWithoutFrames(); return;
          }
          
          final bytesNeeded = headerSize - buffer.length;

          final readStartTime = DateTime.now();
          final chunk = await _connection.read(bytesNeeded);
          final readDuration = DateTime.now().difference(readStartTime);
          

          if (chunk.isEmpty) { // Connection closed by peer
            await _cleanupWithoutFrames(); return;
          }
          final newBuffer = Uint8List(buffer.length + chunk.length);
          newBuffer.setAll(0, buffer);
          newBuffer.setAll(buffer.length, chunk);
          buffer = newBuffer;
          
        }


        final headerView = ByteData.view(buffer.buffer, buffer.offsetInBytes, headerSize);
        final frameTypeValue = headerView.getUint8(1);
        final lengthField = headerView.getUint32(8, Endian.big);

        // Only Data frames (type 0x0) have a data payload after the header.
        // For WindowUpdate/Ping/GoAway, the length field carries a value, not data size.
        final hasDataPayload = frameTypeValue == YamuxFrameType.dataFrame.value;
        final dataPayloadSize = hasDataPayload ? lengthField : 0;
        final expectedTotalFrameLength = headerSize + dataPayloadSize;

        // Ensure we have the full frame (header + data payload if applicable)
        while (buffer.length < expectedTotalFrameLength) {
          if (_closed || _connection.isClosed) {
             await _cleanupWithoutFrames(); return;
          }
          final stillNeeded = expectedTotalFrameLength - buffer.length;
          final chunk = await _connection.read(stillNeeded);
          if (chunk.isEmpty) {
            await _cleanupWithoutFrames(); return;
          }
          final newBuffer = Uint8List(buffer.length + chunk.length);
          newBuffer.setAll(0, buffer);
          newBuffer.setAll(buffer.length, chunk);
          buffer = newBuffer;
        }

        final frameBytesForParser = buffer.sublist(0, expectedTotalFrameLength);
        final frame = YamuxFrame.fromBytes(frameBytesForParser);

        // [FRAME-TRACE] Log every frame received for diagnosing B→A data loss
        _log.fine('$_logPrefix [FRAME-TRACE] #$frameCount type=${frame.type} streamID=${frame.streamId} flags=0x${frame.flags.toRadixString(16)} len=${frame.length}${frame.type == YamuxFrameType.dataFrame ? " dataLen=${frame.data?.length ?? 0}" : ""}');

        final handleStartTime = DateTime.now();

        try {
          await _handleFrame(frame);
          final handleDuration = DateTime.now().difference(handleStartTime);
          
          // Record frame processing time for adaptive behavior
          _recordFrameProcessingTime(handleDuration);

        } catch (e, st) {
          final handleDuration = DateTime.now().difference(handleStartTime);
          _log.severe('$_logPrefix 🔧 [YAMUX-FRAME-READER-HANDLE-ERROR-$frameCount] Frame handling failed after ${handleDuration.inMilliseconds}ms: $e\n$st');
          rethrow;
        }
        
        buffer = buffer.sublist(expectedTotalFrameLength);
        final loopDuration = DateTime.now().difference(loopStartTime);
      }
    } catch (e, st) {
      final bool connIsClosed = _connection.isClosed; // Capture current state
      if (!_closed && !connIsClosed) {
        _log.severe('$_logPrefix Error in _readFrames loop (session and conn not marked closed): $e', st);

        // Notify metrics observer of session error
        final peer = _remotePeerOrNull;
        if (peer != null) {
          try {
            metricsObserver?.onSessionError(peer, e.toString(), st);
          } catch (observerError) {
            _log.warning('$_logPrefix Error notifying metrics observer: $observerError');
          }
        }
        
        await _goAway(YamuxCloseReason.internalError);
      } else if (!_closed && connIsClosed) {
        await _cleanupWithoutFrames();
      }
    } finally {
      if (!_closed) { 
        await _goAway(YamuxCloseReason.internalError); // This will also call _cleanupWithoutFrames
      }
    }
  }

  Future<void> _handleFrame(YamuxFrame frame) async {
    // If session is closing/closed, only process essential frames
    if (_closed && frame.type != YamuxFrameType.goAway && (frame.flags & YamuxFlags.rst == 0)) {
        return;
    }

    try {
      // Ping and GoAway are session-level frames — dispatch directly.
      // SYN/ACK/RST/FIN flags on these types have different semantics
      // (e.g., go-yamux uses SYN on Ping to mean "request", ACK for "response").
      if (frame.type == YamuxFrameType.ping) {
        await _handlePing(frame);
        return;
      }
      if (frame.type == YamuxFrameType.goAway) {
        await _handleGoAway(frame);
        return;
      }

      // For stream-bearing frames (Data, WindowUpdate), check lifecycle flags.
      // Per go-yamux: SYN opens a stream, ACK (without SYN) accepts it.
      if (frame.flags & YamuxFlags.ack != 0 && frame.flags & YamuxFlags.syn == 0) {
        // ACK (no SYN): response to our outbound stream creation
        _log.fine('$_logPrefix [ACK-DIAG] Received ACK for streamID=${frame.streamId}, pending=${_pendingStreams.containsKey(frame.streamId)}');
        final completer = _pendingStreams.remove(frame.streamId);
        if (completer != null && !completer.isCompleted) {
          completer.complete();
        }
      } else if (frame.flags & YamuxFlags.syn != 0) {
        // SYN: new incoming stream from remote
        await _handleNewStream(frame);
      }

      if (frame.flags & YamuxFlags.rst != 0) {
        // RST: reset the stream
        final stream = _streams[frame.streamId];
        _log.warning('$_logPrefix [STREAM-RESET-DIAG] Received RST frame for StreamID=${frame.streamId}, type=${frame.type}. Stream exists: ${stream != null}');
        if (stream != null) {
          await stream.handleFrame(frame);
        }
        return; // RST terminates processing
      }

      // Dispatch by frame type for the actual payload/value
      switch (frame.type) {
        case YamuxFrameType.dataFrame:
          await _handleDataFrame(frame);
          break;
        case YamuxFrameType.windowUpdate:
          await _handleWindowUpdateFrame(frame);
          break;
        case YamuxFrameType.ping:
        case YamuxFrameType.goAway:
          break; // Already handled above
      }
    } catch (e, st) {
      _log.severe('$_logPrefix Error handling frame: Type=${frame.type}, StreamID=${frame.streamId}, Error: $e\n$st');
      rethrow;
    }
  }

  /// Optimized handler for DATA frames (most common frame type)
  Future<void> _handleDataFrame(YamuxFrame frame) async {

    // Notify activity on the underlying connection when data is received
    _connection.notifyActivity(); 
    final streamData = _streams[frame.streamId];
    if (streamData != null) {

      final streamHandleStart = DateTime.now();
      await streamData.handleFrame(frame);
      final streamHandleDuration = DateTime.now().difference(streamHandleStart);
    } else {
      _log.warning('$_logPrefix 🔧 [YAMUX-HANDLE-FRAME-DATA-ERROR] Received ${frame.type} for unknown/closed stream ID ${frame.streamId}. Flags: ${frame.flags}, Length: ${frame.length}');
      // If it's a DATA for a non-existent stream, it could be a protocol error.
      // Consider sending a RESET for this stream ID if it's unexpected data.
    }
  }

  /// Optimized handler for WINDOW_UPDATE frames (second most common)
  Future<void> _handleWindowUpdateFrame(YamuxFrame frame) async {
    final stream = _streams[frame.streamId];
    if (stream != null) {
      await stream.handleFrame(frame);
    }
  }

  Future<void> _handleNewStream(YamuxFrame frame) async { 
    // DEBUG: Add detailed inbound stream creation logging
    final caller = StackTrace.current.toString().split('\n').length > 1 
        ? StackTrace.current.toString().split('\n')[1].trim() 
        : 'unknown_caller';

    
    if (frame.flags & YamuxFlags.syn == 0) { // Should be redundant due to earlier check in _handleFrame
      _log.severe('$_logPrefix New stream frame missing SYN flag for ID ${frame.streamId}');
      await _goAway(YamuxCloseReason.protocolError); return;
    }
    
    // YAMUX PROTOCOL COMPLIANCE: Validate incoming stream ID follows Yamux specification
    // Incoming streams from client should have odd IDs (1, 3, 5, ...)
    // Incoming streams from server should have even IDs (2, 4, 6, ...)
    final isIncomingFromClient = frame.streamId % 2 == 1;
    final weAreServer = !_isClient;

    if (isIncomingFromClient && !weAreServer) {
      // We're a client receiving an odd stream ID (client-initiated) - this is wrong
      _log.severe('$_logPrefix YAMUX PROTOCOL VIOLATION: Client received client-initiated stream ID ${frame.streamId}');
      await _goAway(YamuxCloseReason.protocolError);
      return;
    }

    if (!isIncomingFromClient && weAreServer) {
      // We're a server receiving an even stream ID (server-initiated) - this is wrong
      _log.severe('$_logPrefix YAMUX PROTOCOL VIOLATION: Server received server-initiated stream ID ${frame.streamId}');
      await _goAway(YamuxCloseReason.protocolError);
      return;
    }
    

    if (_closed || !canCreateStream) {
      _log.warning('$_logPrefix Cannot accept new stream ID ${frame.streamId}. Session closed: $_closed, Can create: $canCreateStream. Sending RESET.');
      // Fire-and-forget: don't block read loop on rejected stream RST send.
      final rstFrame = YamuxFrame.reset(frame.streamId);
      _sendFrame(rstFrame).catchError((e) {
        _log.warning('$_logPrefix Error sending RESET for unaccepted stream ${frame.streamId}: $e');
      });
      return;
    }
    
    // Create the stream FIRST so that subsequent frames for this stream ID
    // (which arrive on the read loop) can be dispatched immediately.
    final initialWindow = _config.initialStreamWindowSize;
    final stream = YamuxStream(
      id: frame.streamId,
      protocol: '',
      metadata: {},
      initialWindowSize: initialWindow,
      sendFrame: _sendFrame,
      parentConn: this,
      remotePeer: _remotePeerOrNull,
      maxFrameSize: _config.maxFrameSize,
      metricsObserver: metricsObserver,
      logPrefix: "$_logPrefix StreamID=${frame.streamId}",
    );

    _streams[frame.streamId] = stream;

    // Fire-and-forget SYN-ACK: don't block the read loop waiting for the
    // write to complete. If the UDX congestion controller is stalled,
    // _sendFrame() can block for up to 30s. During that time, no frames
    // would be processed — the remote's multistream-select would timeout
    // (10s) and the connection would appear dead. The yamux write lock
    // still serializes sends, preserving Noise nonce ordering.
    _log.fine('$_logPrefix [HANDLE-NEW-STREAM-DIAG] Received SYN for streamID=${frame.streamId}, sending ACK (fire-and-forget)');
    _sendFrame(YamuxFrame.synAckStream(frame.streamId)).catchError((e) {
      _log.warning('$_logPrefix Error sending SYN-ACK for stream ${frame.streamId}: $e');
    });

    try {
      // open() sends initial window update — also fire-and-forget via
      // openIncoming() which doesn't block on the send.
      await stream.openIncoming();

      // Notify metrics observer of incoming stream opened
      final peer = _remotePeerOrNull;
      if (peer != null) metricsObserver?.onStreamOpened(peer, frame.streamId, stream.protocol());

      // Check if there's a pending acceptStream() call waiting for a stream
      if (_pendingAcceptStreamCompleter != null && !_pendingAcceptStreamCompleter!.isCompleted) {
        _pendingAcceptStreamCompleter!.complete(stream);
        _pendingAcceptStreamCompleter = null;
      }

      // Always add to controller for broadcast stream listeners
      _incomingStreamsController.add(stream);

      // If there's a stream handler, invoke it
      if (_streamHandler != null) {
        _streamHandler!(stream).catchError((e, st) {
          _log.severe('$_logPrefix _handleNewStream: Error in _streamHandler for stream ID ${frame.streamId}: $e', st);
          stream.reset().catchError((_) {});
        });
      }
    } catch (e, st) {
      _log.severe('$_logPrefix _handleNewStream: Error during local stream open or handler setup for ID ${frame.streamId}: $e', st);
      _streams.remove(frame.streamId);
      await stream.reset().catchError((_) {});
    }
  }

  Future<void> _handlePing(YamuxFrame frame) async {
    final opaqueValue = frame.length;

    if (frame.flags & YamuxFlags.ack != 0) {
      // PONG received (ACK flag) - clear from pending pings
      final removed = _pendingPings.remove(opaqueValue);
      if (removed != null) {
        final receivedTime = DateTime.now();
        final rtt = receivedTime.difference(removed);

        // Notify metrics observer
        final peer = _remotePeerOrNull;
        if (peer != null) metricsObserver?.onPongReceived(peer, opaqueValue, removed, receivedTime, rtt);
      }
      return;
    }
    // Ping request (SYN flag or no flags) — respond with ACK.
    // Fire-and-forget: don't block the read loop waiting for the write to complete.
    // The yamux write lock serializes the send with other writes, preserving order.
    // If the send fails (e.g., congestion stall timeout), the remote will send
    // another PING, and the stalled write will eventually complete or timeout.
    final response = YamuxFrame.ping(true, opaqueValue);
    _sendFrame(response).catchError((e) {
      _log.warning('$_logPrefix Error sending PONG response for ping $opaqueValue: $e');
    });
  }

  Future<void> _handleGoAway(YamuxFrame frame) async {
    // The reason code from frame.length is an int. We need to map it to YamuxCloseReason or use a default.
    YamuxCloseReason reason;
    try {
      reason = YamuxCloseReason.values.firstWhere((r) => r.value == frame.length);
    } catch (_) {
      reason = YamuxCloseReason.protocolError; // Default if unknown code
    }
    _log.warning('$_logPrefix [SESSION-DIAG] Received REMOTE GO_AWAY frame. Reason: ${reason.name} (code=${frame.length}). Active streams: ${_streams.length}. Session will close.');
    await _goAway(reason);
  }

  Future<void> _sendFrame(YamuxFrame frame) async {
    if (_closed && !_cleanupStarted) { // Allow sending GO_AWAY even if _closed is true but cleanup hasn't started
        if (frame.type != YamuxFrameType.goAway) {
             throw StateError('Session is closing/closed, cannot send frame type ${frame.type}');
        }
    } else if (_closed && _cleanupStarted) {
        return; // Suppress send if cleanup fully started
    }

    // Acquire write lock to serialize frame writes and prevent Noise encryption nonce desync
    final lockAcquireStart = DateTime.now();
    await _acquireWriteLock();
    final lockAcquireDuration = DateTime.now().difference(lockAcquireStart);
    
    try {
      // Detailed logging for outgoing frames, especially Identify SYN
      if (frame.streamId == 1 && (frame.flags & YamuxFlags.syn != 0)) {
        final bytes = frame.toBytes();
      }
      
      // [FRAME-SEND] Log every frame sent for diagnosing B→A data loss
      final frameBytes = frame.toBytes();
      _log.fine('$_logPrefix [FRAME-SEND] type=${frame.type} streamID=${frame.streamId} flags=0x${frame.flags.toRadixString(16)} len=${frame.length}${frame.type == YamuxFrameType.dataFrame ? " dataLen=${frame.data.length}" : ""} wireBytes=${frameBytes.length} lockWait=${lockAcquireDuration.inMilliseconds}ms');

      final writeStart = DateTime.now();
      await _connection.write(frameBytes);
      final writeDuration = DateTime.now().difference(writeStart);

      // Log write completion for DATA frames (the ones we're losing)
      if (frame.type == YamuxFrameType.dataFrame) {
        _log.fine('$_logPrefix [FRAME-SEND-DONE] streamID=${frame.streamId} dataLen=${frame.data.length} writeDuration=${writeDuration.inMilliseconds}ms');
      }
    } catch (e) {
      _log.severe('$_logPrefix Error sending frame: Type=${frame.type}, StreamID=${frame.streamId}. Error: $e');
      if (!_closed) { // If not already closing due to this error, initiate closure.
        _log.warning('$_logPrefix Error sending frame indicates session issue. Initiating GO_AWAY. Error: $e.');
        // Fire-and-forget — don't await to avoid deadlocks if _goAway itself tries to send.
        _goAway(YamuxCloseReason.internalError);
      }
      rethrow; // Rethrow to allow caller to handle (e.g., stream reset)
    } finally {
      // Release write lock
      _releaseWriteLock();
    }
  }

  /// Acquire write lock to serialize frame writes.
  /// This prevents concurrent encryption operations which would cause
  /// Noise encryption nonce desynchronization and MAC authentication errors.
  /// 
  /// The lock ensures that each frame:
  /// 1. Gets its nonce assigned
  /// 2. Completes encryption
  /// 3. Is sent to the underlying connection
  /// 4. THEN the next frame can start
  /// 
  /// Uses queue-first pattern to prevent race conditions where multiple callers
  /// could pass the "lock available" check before any of them acquires it.
  Future<void> _acquireWriteLock() async {
    final completer = Completer<void>();
    _writeLockQueue.add(completer);

    // Try to grant lock immediately if available
    _tryGrantWriteLock();

    // Wait for our turn
    await completer.future;
  }

  /// Attempts to grant the write lock to the next waiter if the lock is free.
  /// This method is synchronous to ensure atomic check-and-grant.
  void _tryGrantWriteLock() {
    if (!_writeLockHeld && _writeLockQueue.isNotEmpty) {
      _writeLockHeld = true;
      final next = _writeLockQueue.removeFirst();
      next.complete();
    }
  }

  /// Release write lock, allowing the next queued write to proceed
  void _releaseWriteLock() {
    _writeLockHeld = false;
    _tryGrantWriteLock();
  }

  Future<void> _goAway(YamuxCloseReason reason) async {
    if (_closed && _cleanupStarted) {
      return;
    }
    _log.warning('$_logPrefix [SESSION-DIAG] _goAway() called. Reason: ${reason.name}. Already closed: $_closed. Active streams: ${_streams.length}.');
    if (_closed && !_cleanupStarted) {
        // _closed is true, so _sendFrame will only allow GO_AWAY if it's not already in cleanup.
        // This path implies _goAway might be called recursively or from different error paths.
        // The primary goal now is to ensure cleanup.
    } else {
       _closed = true; 
    }

    try {
      if (!_connection.isClosed && !_cleanupStarted) { // Only send if conn open and cleanup not started
        final frame = YamuxFrame.goAway(reason.value);
        await _sendFrame(frame); 
      }
    } catch (e) {
      _log.warning('$_logPrefix _goAway(${reason.name}): Error occurred during _sendFrame for GO_AWAY: $e. Proceeding to cleanup.');
    } finally {
      await _cleanupWithoutFrames(); // This will set _cleanupStarted = true
    }
  }


  @override
  Future<core_mux.MuxedStream> openStream(Context context) async {
    // This is the actual logic for creating an outbound stream for Yamux.
    // The old newStream() (no-args) was essentially this.
    if (_closed) {
      _log.warning('$_logPrefix openStream called on closed session.');
      throw StateError('Session is closed');
    }

    if (!canCreateStream) {
      _log.warning('$_logPrefix newStream: Maximum streams reached ($maxStreams).');
      throw StateError('Maximum streams reached');
    }

    final streamId = _nextStreamId;
    _nextStreamId += 2;
    
    // Notify metrics observer of stream open start
    final peer = _remotePeerOrNull;
    if (peer != null) metricsObserver?.onStreamOpenStart(peer, streamId);
    
    // YAMUX PROTOCOL COMPLIANCE: Validate stream ID assignment follows Yamux specification
    // Client should only create odd-numbered streams (1, 3, 5, ...)
    // Server should only create even-numbered streams (2, 4, 6, ...)
    if (_isClient && streamId % 2 == 0) {
      _log.severe('$_logPrefix YAMUX PROTOCOL VIOLATION: Client attempted to create even stream ID: $streamId');
      throw StateError('Yamux protocol violation: Client cannot create even stream ID: $streamId');
    }
    if (!_isClient && streamId % 2 == 1) {
      _log.severe('$_logPrefix YAMUX PROTOCOL VIOLATION: Server attempted to create odd stream ID: $streamId');
      throw StateError('Yamux protocol violation: Server cannot create odd stream ID: $streamId');
    }
    
    // DEBUG: Add detailed stream creation logging with caller info
    final caller = StackTrace.current.toString().split('\n').length > 1 
        ? StackTrace.current.toString().split('\n')[1].trim() 
        : 'unknown_caller';


    
    final stream = YamuxStream(
      id: streamId,
      protocol: '', 
      metadata: {},
      initialWindowSize: _config.initialStreamWindowSize, 
      sendFrame: _sendFrame,
      parentConn: this, // Added parentConn
      remotePeer: _remotePeerOrNull, // May be null before security handshake
      maxFrameSize: _config.maxFrameSize, // Limit frame size for resilience
      metricsObserver: metricsObserver, // For metrics reporting
      logPrefix: "$_logPrefix StreamID=$streamId",
    );

    _streams[streamId] = stream;
    
    // DEBUG: Add session-level stream tracking

    

    final completer = Completer<void>();
    _pendingStreams[streamId] = completer;

    try {
      final frame = YamuxFrame.synStream(streamId);
      await _sendFrame(frame);
      _log.fine('$_logPrefix [OPEN-STREAM-DIAG] SYN sent for streamID=$streamId');

      // [EnvoyMesh fork — see vendor/dart_libp2p/PATCHES.md]
      // Do not block stream setup on the peer's ACK. Yamux does not require the
      // opener to wait for it: the ACK is a lazily-emitted acknowledgement, and
      // @chainsafe/libp2p-yamux only sets it from YamuxStream.getSendFlags() on
      // the receiver's *first write*, which for multistream-select (responder
      // reads first) cannot happen until this stream's proposal has been sent.
      // Awaiting it deadlocks every Dart → libp2p-js stream. hashicorp/go-yamux's
      // Open() likewise returns right after sending SYN. Keep the completer
      // registered (the ACK diagnostic still fires) and keep a listener attached
      // so session teardown's completeError() is observed, not reported as an
      // unhandled zone error.
      unawaited(completer.future.then((_) {
        _log.fine('$_logPrefix [OPEN-STREAM-DIAG] ACK received for streamID=$streamId');
      }).catchError((_) {}));

      await stream.open();
      _log.fine('$_logPrefix [OPEN-STREAM-DIAG] stream.open() complete for streamID=$streamId');

      // Notify metrics observer of successful stream open
      if (peer != null) metricsObserver?.onStreamOpened(peer, streamId, stream.protocol());
      
      return stream;
    } catch (e) {
      _log.severe('$_logPrefix openStream: FAILED to open new stream ID $streamId: $e'); // More specific message
      _pendingStreams.remove(streamId);
      _streams.remove(streamId); // Ensure stream is removed if setup fails
      _log.finer('$_logPrefix openStream: Removed stream ID $streamId from _pendingStreams and _streams due to error.');
      // Don't await reset if stream.open() failed, as stream might not be in a state to send reset.
      // Just ensure local cleanup of the stream object if it was partially initialized.
      // If _sendFrame for SYN failed, stream.reset() would also fail.
      // If timeout occurred, stream.reset() is appropriate.
      if (e is TimeoutException) {
        await stream.reset().catchError((resetError) {
          _log.warning('$_logPrefix openStream: Error resetting stream ID $streamId during newStream timeout handling: $resetError');
        });
      } else {
        // For other errors (e.g. _sendFrame failed), a simple local cleanup might be best.
        await stream.forceReset().catchError((forceResetError) {
             _log.warning('$_logPrefix openStream: Error force-resetting stream ID $streamId: $forceResetError');
        });
      }
      rethrow;
    }
  }

  @override
  Future<YamuxStream> acceptStream() async {
    // Changed from AND to OR - if either is closed, we can't accept
    if (_closed || _incomingStreamsController.isClosed) {
        throw StateError('Session is closed, cannot accept new streams.');
    }
    
    // Use completer-based approach to avoid race condition
    _pendingAcceptStreamCompleter = Completer<P2PStream>();
    
    try {
      // Race between the completer (set by _handleNewStream) and the stream listener
      // This handles the race condition where a SYN arrives before .first attaches
      final p2pStream = await Future.any([
        _pendingAcceptStreamCompleter!.future,
        incomingStreams.first.catchError((e) {
          // If .first fails with StateError (no element), check if session is closed
          if (e is StateError) {
            if (_closed || _incomingStreamsController.isClosed) {
              throw StateError('Session closed while waiting for stream');
            }
          }
          throw e;
        }),
      ]);
      
      if (p2pStream is YamuxStream) {
        return p2pStream;
      } else {
        throw StateError('Incoming stream is not a YamuxStream, which is unexpected.');
      }
    } catch (e) {
      // Handle errors from both the completer and the stream
      if (e is StateError) {
        // Propagate StateError as is
        rethrow;
      }
      // For other errors, wrap them
      throw StateError('Error waiting for stream: $e');
    } finally {
      // Clean up the completer
      _pendingAcceptStreamCompleter = null;
    }
  }

  @override
  Stream<P2PStream> get incomingStreams => _incomingStreamsController.stream;

  @override
  Future<void> close() async {
    if (_closed && _cleanupStarted) {
      return;
    }
    await _goAway(YamuxCloseReason.normal);
  }

  @override
  bool get isClosed => _closed;

  @override
  int get maxStreams => _config.maxStreams;

  @override
  int get numStreams => _streams.length;

  @override
  bool get canCreateStream => numStreams < maxStreams;

  @override
  void setStreamHandler(Future<void> Function(P2PStream stream) handler) {
    _streamHandler = handler;
  }

  @override
  void removeStreamHandler() {
    _streamHandler = null;
  }

  Future<void> _cleanupWithoutFrames() async {
    if (_cleanupStarted) {
      return;
    }
    _cleanupStarted = true; // Set flag at the beginning
    _closed = true; 

    _keepaliveTimer?.cancel();

    // Fail any pending outgoing streams
    _pendingStreams.forEach((id, completer) {
        if (!completer.isCompleted) {
            completer.completeError(StateError('Session closed while opening stream $id'));
        }
    });
    _pendingStreams.clear();

    final activeStreams = List<YamuxStream>.from(_streams.values);
    _log.warning('$_logPrefix [STREAM-RESET-DIAG] _cleanupWithoutFrames: Force-resetting ${activeStreams.length} active streams (session teardown)');
    _streams.clear();
    for (final stream in activeStreams) {
      try {
        await stream.forceReset();
      } catch (e) {
        _log.warning('$_logPrefix _cleanupWithoutFrames: Error force-resetting stream ${stream.id()}: $e');
      }
    }

    try {
      if (!_incomingStreamsController.isClosed) {
        await _incomingStreamsController.close();
      }
    } catch (e) {
      _log.warning('$_logPrefix _cleanupWithoutFrames: Error closing incoming streams controller: $e');
    }

    try {
      if (!_connection.isClosed) {
        await _connection.close();
      }
    } catch (e) {
      _log.warning('$_logPrefix _cleanupWithoutFrames: Error closing underlying connection: $e');
    }
  }

  @override
  Future<core_mux.MuxedConn> newConnOnTransport(
    TransportConn secureConnection, 
    bool isServer,                 
    PeerScope scope
  ) async {
    if (secureConnection != this._connection) {
      _log.warning('YamuxSession.newConnOnTransport: secureConnection mismatch. Expected ${_connection.id}, got ${secureConnection.id}');
    }
    if (isServer == this._isClient) { // isServer from perspective of Multiplexer interface
      _log.warning('YamuxSession.newConnOnTransport: isServer flag mismatch. Expected isServer=${!_isClient}, got $isServer');
    }

    this._peerScope = scope; 
    await _initCompleter.future;
    return this;
  }

  // Conn interface implementation
  @override
  String get id => _connection.id;

  // Conn.newStream signature: Future<P2PStream> newStream(Context context, int streamId);
  // This implements Conn.newStream by calling the MuxedConn.openStream method.
  @override
  Future<P2PStream> newStream(Context context) async {
    return await openStream(context) as P2PStream; // openStream returns MuxedStream, cast to P2PStream
  }

  // This `streams` getter satisfies both Multiplexer.streams (now Future) and Conn.streams (Future).
  @override
  Future<List<P2PStream>> get streams async => List.unmodifiable(_streams.values);

  // isClosed is already implemented by MuxedConn and satisfies Conn.

  @override
  PeerId get localPeer => _connection.localPeer;

  /// Safe accessor for remote peer ID that returns null instead of throwing
  /// when the remote peer is not yet known (e.g., server-side before security handshake).
  PeerId? get _remotePeerOrNull {
    try {
      return _connection.remotePeer;
    } on StateError {
      return null;
    }
  }

  @override
  PeerId get remotePeer => _connection.remotePeer;

  @override
  Future<PublicKey?> get remotePublicKey => _connection.remotePublicKey;

  @override
  ConnState get state {
    // Construct ConnState based on this session and underlying connection
    final underlyingState = _connection.state;
    return ConnState(
      streamMultiplexer: protocolId, // Yamux is the multiplexer
      security: underlyingState.security, // Get security from underlying conn
      transport: underlyingState.transport, // Get transport from underlying conn
      usedEarlyMuxerNegotiation: underlyingState.usedEarlyMuxerNegotiation, // Get from underlying
    );
  }

  @override
  MultiAddr get localMultiaddr => _connection.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => _connection.remoteMultiaddr;

  @override
  ConnStats get stat => _connection.stat; // Assumes TransportConn provides a compatible ConnStats

  @override
  ConnScope get scope {
    // YamuxSession has its own _peerScope which might be more specific
    // or fall back to the underlying connection's scope.
    // The _peerScope is typically set via newConnOnTransport.
    if (_peerScope != null) {
      // This is tricky because PeerScope is not directly a ConnScope.
      // ConnScope is an interface with methods like IncRef, Done, etc.
      // PeerScope is a ResourceScope.
      // For now, if _peerScope is set, we might need to adapt it or
      // this indicates a mismatch in how scopes are handled at this level.
      // Let's assume for now that if _peerScope is available, it's the one to use,
      // but this might need a more robust adapter if ConnScope has methods not on PeerScope.
      // A simpler approach: ConnScope is about managing the connection's lifecycle within rcmgr.
      // The YamuxSession itself is scoped.
      // The _connection (TransportConn) should have its own scope.
      return _connection.scope; 
    }
    return _connection.scope;
  }
}
