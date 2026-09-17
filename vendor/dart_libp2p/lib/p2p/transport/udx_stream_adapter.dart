

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/udx_exceptions.dart';
import 'package:dart_udx/dart_udx.dart';

import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/mux.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:logging/logging.dart';

final Logger _logger = Logger('UDXStreamAdapter');

class UDXP2PStreamAdapter implements MuxedStream, P2PStream<Uint8List> {
  final UDXStream _udxStream;
  UDXStream get udxStream => _udxStream; // Expose the underlying stream
  final UDXSessionConn _parentConn;
  final Direction _direction;
  String _protocol = '';
  bool _isClosed = false;
  bool _isWriteClosed = false; // Track write-side closure separately  
  final StreamController<Uint8List> _incomingDataController = StreamController<Uint8List>.broadcast(); // Kept for .stream getter if used elsewhere
  final List<Uint8List> _readBuffer = [];
  Completer<Uint8List>? _pendingReadCompleter; // For direct signaling to a waiting read()
  StreamSubscription? _udxStreamDataSubscription;
  StreamSubscription? _udxStreamCloseSubscription;
  final Completer<void> _closedCompleter = Completer<void>();

  UDXP2PStreamAdapter({
    required UDXStream udxStream,
    required UDXSessionConn parentConn,
    required Direction direction,
  }) : _udxStream = udxStream,
        _parentConn = parentConn,
        _direction = direction {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] Constructor: udxStreamId=${udxStream.id}, direction=$_direction');
    _udxStreamDataSubscription = _udxStream.data.listen(
            (data) {
          // DEBUG: Log ALL incoming data to trace server-side data reception
          _logger.fine('[UDXP2PStreamAdapter ${id()}] 📨 DATA ARRIVED: ${data.length} bytes, hasPendingRead=${_pendingReadCompleter != null}, bufferSize=${_readBuffer.length}, isClosed=$_isClosed');
          
          // CRITICAL: Check and null out the completer atomically to prevent
          // race condition where UDX delivers multiple data events synchronously
          // before we can set _pendingReadCompleter to null.
          final completerToComplete = _pendingReadCompleter;
          if (completerToComplete != null && !completerToComplete.isCompleted) {
            // Immediately null out the completer to prevent double-completion
            _pendingReadCompleter = null;
            _logger.fine('[UDXP2PStreamAdapter ${id()}] ✅ COMPLETING pending read with ${data.length} bytes');
            completerToComplete.complete(data);
          } else {
            _logger.fine('[UDXP2PStreamAdapter ${id()}] 📦 BUFFERING ${data.length} bytes (no pending read)');
            _readBuffer.add(data);
            if (!_incomingDataController.isClosed) _incomingDataController.add(data);
          }
          _parentConn.notifyActivity();
        },
        onError: (err, s) {
          _logger.fine('[UDXP2PStreamAdapter ${id()}] Error on UDXStream data: $err');
          
          // Classify UDX error and isolate stream failure from connection
          final classifiedException = UDXExceptionHandler.classifyUDXException(
            err, 
            'UDXP2PStreamAdapter(${id()}).data.onError', 
            s,
          );
          
          // Log specific handling for packet loss
          if (classifiedException is UDXPacketLossException) {
            _logger.warning('[UDXP2PStreamAdapter ${id()}] Packet permanently lost on stream. Stream will be closed but connection should remain stable.');
          } else if (classifiedException is UDXStreamException) {
            _logger.info('[UDXP2PStreamAdapter ${id()}] Stream-specific error: ${classifiedException.message}');
          }
          
          if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
            _pendingReadCompleter!.completeError(classifiedException, s);
            _pendingReadCompleter = null;
          }
          if (!_incomingDataController.isClosed) { 
            _incomingDataController.addError(classifiedException, s); 
          }
          _closeWithError(classifiedException, s);
        },
        onDone: () {
          _logger.fine('[UDXP2PStreamAdapter ${id()}] UDXStream data stream DONE - stream will close.');
          _close();
        }
    );
    _udxStreamCloseSubscription = _udxStream.closeEvents.listen(
            (_) {
          _logger.warning('[UDXP2PStreamAdapter ${id()}] ⚠️ UDXStream CLOSE EVENT received - stream will close!');
          _close();
        },
        onError: (err, s) {
          _logger.fine('[UDXP2PStreamAdapter ${id()}] UDXStream close event error: $err');
          _closeWithError(err, s);
        }
    );
  }

  @override
  String id() {
    return _udxStream.id.toString();
  }

  @override
  String protocol() {
    return _protocol;
  }

  @override
  Future<void> setProtocol(String protocolId) async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] setProtocol: $protocolId');
    _protocol = protocolId;
  }

  Stream<Uint8List> get stream {
    return _incomingDataController.stream;
  }

  @override
  Future<Uint8List> read([int? maxLength]) async {
    // DEBUG: Detailed logging for tracing read flow - including subscription state
    final subscriptionActive = _udxStreamDataSubscription != null;
    _logger.fine('[UDXP2PStreamAdapter ${id()}] 📖 read(maxLength=$maxLength) CALLED. bufferSize=${_readBuffer.length}, isClosed=$_isClosed, hasPendingRead=${_pendingReadCompleter != null}, subscriptionActive=$subscriptionActive');

    if (_isClosed && _readBuffer.isEmpty) {
      _logger.info('[UDXP2PStreamAdapter ${id()}] ⏹️ Stream closed and buffer empty. Returning EOF.');
      return Uint8List(0);
    }

    if (_readBuffer.isNotEmpty) {
      final currentChunk = _readBuffer.removeAt(0);
      if (maxLength == null || currentChunk.length <= maxLength) {
        _logger.fine('[UDXP2PStreamAdapter ${id()}] ✅ RETURN FROM BUFFER: ${currentChunk.length} bytes, remainingBuffer=${_readBuffer.length}');
        return currentChunk;
      } else {
        final toReturn = currentChunk.sublist(0, maxLength);
        final remainder = currentChunk.sublist(maxLength);
        _readBuffer.insert(0, remainder);
        _logger.fine('[UDXP2PStreamAdapter ${id()}] ✅ RETURN PARTIAL FROM BUFFER: $maxLength of ${currentChunk.length} bytes, remainder=${remainder.length}');
        return toReturn;
      }
    }

    // Buffer is empty, need to wait for data from UDX
    // CRITICAL FIX: Handle concurrent reads properly to avoid race conditions
    // If another read is already pending, wait for it to complete first,
    // then re-check the buffer instead of overwriting the completer
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      _logger.warning('[UDXP2PStreamAdapter ${id()}] Another read already pending. Waiting for existing read to complete...');
      try {
        // Wait for the existing read to complete (it will populate the buffer)
        await _pendingReadCompleter!.future.timeout(
          const Duration(seconds: 120),
          onTimeout: () {
            throw TimeoutException('Timeout waiting for existing read on UDXP2PStreamAdapter', const Duration(seconds: 120));
          },
        );
      } catch (e) {
        // If the existing read failed, clear the completer and let this read try fresh
        _logger.fine('[UDXP2PStreamAdapter ${id()}] Existing read failed: $e');
        _pendingReadCompleter = null;
      }
      
      // After existing read completes, recursively call read() to check buffer
      // This handles the case where data arrived during the wait
      return read(maxLength);
    }

    final subscriptionActiveBeforeWait = _udxStreamDataSubscription != null;
    _logger.fine('[UDXP2PStreamAdapter ${id()}] ⏳ Buffer empty, creating _pendingReadCompleter and WAITING for data... subscriptionActive=$subscriptionActiveBeforeWait');
    _pendingReadCompleter = Completer<Uint8List>();

    try {
      // No timeout here — yamux's keepalive (10s PING interval, 30s timeout/ping,
      // close after 5 timeouts) handles liveness detection. A hardcoded timeout
      // here competes with and pre-empts yamux's mechanism, killing long-lived
      // transport connections prematurely.
      final newData = await _pendingReadCompleter!.future;

      _logger.fine('[UDXP2PStreamAdapter ${id()}] ✅ pendingReadCompleter COMPLETED with ${newData.length} bytes');
      // Clear the completer after successful read
      _pendingReadCompleter = null;


      // CRITICAL FIX: If we got more bytes than requested, only return maxLength
      // and buffer the remainder. This prevents framing desync in higher layers.
      if (maxLength == null || newData.length <= maxLength) {
        return newData;
      } else {
        final toReturn = newData.sublist(0, maxLength);
        final remainder = newData.sublist(maxLength);
        _readBuffer.insert(0, remainder); // Put remainder BACK at front of buffer
        return toReturn;
      }
    } catch (e) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Error awaiting _pendingReadCompleter: $e');
      _pendingReadCompleter = null;
      if (_isClosed && _readBuffer.isEmpty) return Uint8List(0);
      rethrow;
    }
  }

  /// Pushes data to the front of the read buffer so the next read() returns it.
  /// Used to inject leftover bytes from multistream-select negotiation back
  /// into the stream before the Noise handshake reads from this connection.
  void pushBack(Uint8List data) {
    if (data.isEmpty) return;
    _logger.fine('[UDXP2PStreamAdapter ${id()}] pushBack: ${data.length} bytes pushed to front of read buffer');
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      final completerToComplete = _pendingReadCompleter;
      _pendingReadCompleter = null;
      completerToComplete!.complete(data);
    } else {
      _readBuffer.insert(0, data);
    }
  }

  @override
  Future<void> write(List<int> data) async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] write called with ${data.length} bytes. isClosed: $_isClosed, isWriteClosed: $_isWriteClosed');
    if (_isClosed) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Stream closed, throwing StateError on write.');
      throw StateError('Stream is closed');
    }
    if (_isWriteClosed) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Write side closed, throwing StateError on write.');
      throw StateError('Write side of stream is closed');
    }
    await _udxStream.add(data is Uint8List ? data : Uint8List.fromList(data));
    _parentConn.notifyActivity();
    _logger.fine('[UDXP2PStreamAdapter ${id()}] ✅ Data written to UDXStream successfully (${data.length} bytes).');
  }

  Future<void> _close() async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] _close() called. Is already closed: $_isClosed, writeClose: $_isWriteClosed');
    if (_isClosed) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Already closed, returning early');
      return;
    }
    _isClosed = true;
    _isWriteClosed = true; // Mark write side as closed on full close

    _logger.fine('[UDXP2PStreamAdapter ${id()}] Cancelling UDXStream subscriptions.');
    await _udxStreamDataSubscription?.cancel();
    _udxStreamDataSubscription = null;
    await _udxStreamCloseSubscription?.cancel();
    _udxStreamCloseSubscription = null;

    if (!_incomingDataController.isClosed) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Closing incoming data controller.');
      await _incomingDataController.close();
    }
    try {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Closing underlying UDXStream.');
      await _udxStream.close();
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Underlying UDXStream closed.');
    } catch (e) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Error closing UDXStream: $e');
    }
    
    // IMPORTANT: Notify parent connection that this stream has closed
    // This allows the session to track active streams and close when appropriate
    _logger.fine('[UDXP2PStreamAdapter ${id()}] Notifying parent connection of stream closure.');
    _parentConn.notifyStreamClosed(_udxStream.id);
    
    if (!_closedCompleter.isCompleted) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Completing close completer.');
      _closedCompleter.complete();
    }
  }

  Future<void> _closeWithError(dynamic error, [StackTrace? stackTrace]) async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] _closeWithError called with error: $error');
    if (!_closedCompleter.isCompleted) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Completing close completer with error.');
      _closedCompleter.completeError(error, stackTrace);
    }
    await _close();
  }

  @override
  Future<void> close() async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] close() called.');
    return _close();
  }

  @override
  Future<void> closeWrite() async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] closeWrite() called - delegating to UDX native half-close.');
    
    if (_isWriteClosed) {
      _logger.fine('[UDXP2PStreamAdapter ${id()}] Write side already closed.');
      return;
    }
    
    _isWriteClosed = true;
    
    // Delegate to UDX's native half-close implementation
    // This sends a FIN packet while allowing the read side to remain open
    await _udxStream.closeWrite();
    _logger.fine('[UDXP2PStreamAdapter ${id()}] UDX native closeWrite() completed. Read side remains open for bidirectional relay.');
  }

  @override
  Future<void> closeRead() async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] closeRead() called. This is a no-op as dart-udx does not support read-side half-closure.');
  }

  @override
  Future<void> reset() async {
    _logger.fine('[UDXP2PStreamAdapter ${id()}] reset() called, performing full stream close with error.');
    final exception = SocketException("Stream reset by local peer");
    await _closeWithError(exception, StackTrace.current);
    throw exception;
  }

  @override
  StreamStats stat() {
    return StreamStats(
      direction: _direction,
      opened: DateTime.now(),
      extra: {'udxStreamId': id(), 'protocol': _protocol},
    );
  }


  @override
  Future<void> setDeadline(DateTime? time) async => throw UnimplementedError("Deadlines not implemented.");
  @override
  Future<void> setReadDeadline(DateTime time) async => throw UnimplementedError("Deadlines not implemented.");
  @override
  Future<void> setWriteDeadline(DateTime time) async => throw UnimplementedError("Deadlines not implemented.");

  @override
  bool get isClosed {
    return _isClosed;
  }

  @override
  bool get isWritable => !_isClosed;

  Future<void> get onClose {
    return _closedCompleter.future;
  }

  @override
  StreamManagementScope scope() => throw UnimplementedError("Scope not yet implemented for UDXP2PStreamAdapter.");

  @override
  P2PStream<Uint8List> get incoming {
    return this;
  }

  @override
  // TODO: implement conn
  Conn get conn => _parentConn as Conn ;
}

typedef UDXSessionConnFactory = UDXSessionConn Function({
  required UDPSocket udpSocket,
  required UDXStream initialStream,
  required MultiAddr localMultiaddr,
  required MultiAddr remoteMultiaddr,
  required UDXTransport transport,
  required ConnManager connManager,
  required bool isDialer,
  required void Function(TransportConn) onClosed,
});

class UDXListener implements Listener {
  final UDXMultiplexer _multiplexer;
  final MultiAddr _boundAddr;
  final UDXTransport _transport;
  final ConnManager _connManager;
  final UDXSessionConnFactory _sessionConnFactory;

  final StreamController<TransportConn> _incomingSessionController = StreamController<TransportConn>.broadcast();
  bool _isClosed = false;
  final Map<String, UDXSessionConn> _activeSessions = {};

  UDXListener({
    required UDXMultiplexer listeningSocket,
    required UDX udxInstance,
    required MultiAddr boundAddr,
    required UDXTransport transport,
    required ConnManager connManager,
    UDXSessionConnFactory? sessionConnFactory,
  }) : _multiplexer = listeningSocket,
        _boundAddr = boundAddr,
        _transport = transport,
        _connManager = connManager,
        _sessionConnFactory = sessionConnFactory ?? UDXSessionConn.new {
    _logger.fine('[UDXListener $addr] Constructor: Initializing for $_boundAddr.');
    _logger.fine('[UDXListener $addr] Constructor: Subscribing to multiplexer connections...');

    // Note: This subscription lives for the lifetime of the listener
    // ignore: unused_local_variable
    final connectionSubscription = _multiplexer.connections.listen(
        (UDPSocket socket) {
          _logger.fine('[UDXListener $addr] Received new connection from multiplexer. Calling _handleIncomingConnection.');
          _handleIncomingConnection(socket);
        },
        onError: (err, stackTrace) {
          _logger.fine('[UDXListener $addr] !!! onError in connection subscription: $err');
          _logger.fine('[UDXListener $addr] Stack trace for onError: $stackTrace');
          if (!_incomingSessionController.isClosed) {
            _incomingSessionController.addError(err, stackTrace);
          }
          _logger.fine('[UDXListener $addr] Closing listener due to multiplexer subscription error.');
          close();
        },
        onDone: () {
          _logger.fine('[UDXListener $addr] !!! onDone in connection subscription. Multiplexer closed.');
          _logger.fine('[UDXListener $addr] Closing listener because multiplexer is done.');
          close();
        }
    );
    _logger.fine('[UDXListener $addr] Constructor: Subscription to connections complete.');
  }

  void _handleIncomingConnection(UDPSocket socket) {
    _logger.fine('[UDXListener $addr] _handleIncomingConnection EXECUTION STARTED. Socket: ${socket.remoteAddress}:${socket.remotePort}');
    if (_isClosed) {
      _logger.fine('[UDXListener $addr] Listener is already closed, ignoring incoming connection.');
      socket.close();
      return;
    }

    final remoteHost = socket.remoteAddress.address;
    final remotePort = socket.remotePort;
    final sessionKey = "$remoteHost:$remotePort";

    // Check if we already have a session for this peer
    if (_activeSessions.containsKey(sessionKey)) {
      _logger.fine('[UDXListener $addr] Session for $sessionKey already exists. Closing duplicate connection.');
      socket.close();
      return;
    }

    _logger.fine('[UDXListener $addr] New session detected from $sessionKey. Checking for buffered streams.');
    
    // First, check if there are already buffered streams (this handles the timing issue)
    final bufferedStreams = socket.getStreamBuffer();
    if (bufferedStreams.isNotEmpty) {
      _logger.fine('[UDXListener $addr] Found ${bufferedStreams.length} buffered streams, using first one.');
      final initialStream = bufferedStreams.first;
      _createSession(socket, initialStream, sessionKey, remoteHost, remotePort);
      return;
    }
    
    _logger.fine('[UDXListener $addr] No buffered streams found. Waiting for initial stream event.');
    
    // Listen for the first stream on this socket to create the session
    late StreamSubscription streamSubscription;
    streamSubscription = socket.on('stream').listen(
      (UDXEvent event) {
        final initialStream = event.data as UDXStream;
        _logger.fine('[UDXListener $addr] Received initial stream ${initialStream.id} for new session.');
        
        // Cancel the subscription since we only need the first stream
        streamSubscription.cancel();
        
        _createSession(socket, initialStream, sessionKey, remoteHost, remotePort);
      },
      onError: (err, stackTrace) {
        _logger.fine('[UDXListener $addr] Error waiting for initial stream on $sessionKey: $err');
        socket.close();
      }
    );
    
    // Also flush any streams that might be buffered to trigger the event
    socket.flushStreamBuffer();
  }
  
  void _createSession(UDPSocket socket, UDXStream initialStream, String sessionKey, String remoteHost, int remotePort) {
    try {
      final ipProtocol = socket.remoteAddress.type == InternetAddressType.IPv4 ? 'ip4' : 'ip6';
      final remoteMaString = '/$ipProtocol/$remoteHost/udp/$remotePort/udx';
      final remoteMa = MultiAddr(remoteMaString);
      _logger.fine('[UDXListener $addr] Creating UDXSessionConn for new session. Local: $_boundAddr, Remote: $remoteMa');

      final sessionConn = _sessionConnFactory(
          udpSocket: socket,
          initialStream: initialStream,
          localMultiaddr: _boundAddr,
          remoteMultiaddr: remoteMa,
          transport: _transport,
          connManager: _connManager,
          isDialer: false,
          onClosed: (conn) {
            _activeSessions.remove(sessionKey);
            _logger.fine('[UDXListener $addr] Session ${conn.id} closed and removed from active sessions.');
          }
      );
      _logger.fine('[UDXListener $addr] UDXSessionConn created for new session ${sessionConn.id}.');

      _activeSessions[sessionKey] = sessionConn;
      _logger.fine('[UDXListener $addr] Added new session ${sessionConn.id} to active sessions.');

      _connManager.registerConnection(sessionConn);
      _logger.fine('[UDXListener $addr] Registered new session ${sessionConn.id} with ConnectionManager.');

      if (!_incomingSessionController.isClosed) {
        _incomingSessionController.add(sessionConn);
        _logger.fine('[UDXListener $addr] Added new session ${sessionConn.id} to incoming session controller.');
      } else {
        _logger.fine("[UDXListener $addr] Incoming session controller closed, closing new session to $sessionKey");
        sessionConn.close();
        _activeSessions.remove(sessionKey);
      }
    } catch (e, s) {
      _logger.fine("[UDXListener $addr] Error creating new UDX session for $sessionKey: $e\n$s");
      initialStream.close();
      socket.close();
    }
  }

  @override
  MultiAddr get addr => _boundAddr;

  @override
  Stream<TransportConn> get connectionStream {
    _logger.fine('[UDXListener $addr] get connectionStream');
    return _incomingSessionController.stream;
  }

  @override
  Future<TransportConn?> accept() async {
    _logger.fine('[UDXListener $addr] accept called.');
    if (_isClosed && _incomingSessionController.isClosed) {
      _logger.fine('[UDXListener $addr] Listener closed, cannot accept.');
      return null;
    }
    final conn = await _incomingSessionController.stream.first;
    _logger.fine('[UDXListener $addr] Accepted connection: ${conn.id}');
    return conn;
  }

  @override
  Future<void> close() async {
    _logger.fine('[UDXListener $addr] close called. Is already closed: $_isClosed');
    if (_isClosed) return;
    _isClosed = true;

    if (!_incomingSessionController.isClosed) {
      _logger.fine('[UDXListener $addr] Closing incoming session controller.');
      await _incomingSessionController.close();
    }

    _logger.fine('[UDXListener $addr] Closing all active sessions (${_activeSessions.length} sessions).');
    for (var session in _activeSessions.values.toList()) {
      try {
        await session.close();
      } catch (e) {
        _logger.fine('[UDXListener $addr] Error closing session ${session.id}: $e');
      }
    }
    _activeSessions.clear();
    _logger.fine('[UDXListener $addr] All active sessions from this listener closed and cleared.');

    try {
      _logger.fine('[UDXListener $addr] Closing multiplexer.');
      _multiplexer.close();
      _logger.fine('[UDXListener $addr] Multiplexer closed.');
    } catch (e) {
      _logger.fine('[UDXListener $addr] Error closing multiplexer: $e');
    }
  }

  @override
  bool get isClosed {
    return _isClosed;
  }

  @override
  bool supportsAddr(MultiAddr addr) {
    return addr.hasProtocol('udx');
  }
}
