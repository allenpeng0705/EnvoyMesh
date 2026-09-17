import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:synchronized/synchronized.dart';
import 'package:uuid/uuid.dart'; // Re-enabling Uuid
import 'package:convert/convert.dart';

import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart' show Conn, ConnState, ConnStats, Stats;
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceManager, ConnManagementScope, StreamManagementScope;
import 'package:dart_libp2p/core/network/stream.dart' show P2PStream; // P2PStream might not be directly relevant if this is raw
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
// We typically don't need to import the concrete PeerId implementation directly if only PeerId is used for types.
// However, if TCPConnection instantiates PeerId directly (e.g. PeerId.random()), it would need it.
// For now, assuming PeerId is sufficient for type declarations from the interface.
// If PeerId concrete class is needed for instantiation, it would be:
import 'package:dart_libp2p/core/peer/peer_id.dart' as concrete_peer; // Alias to avoid conflict if PeerId is also in core/peer_id.dart

// Local relative imports are usually fine if they don't cross major boundaries,
// but for consistency, they can also be package imports.
// For now, leaving these as potentially relative if they are within the same sub-module.
// If 'connection_manager.dart' is in the same directory or a sub-directory of 'transport', this is okay.
// If it's in a different top-level part of 'p2p', then package path is better.
// Let's assume these are local enough for now.
import 'connection_state.dart' as transport_state; // For ConnManager interaction
import 'p2p_stream_adapter.dart';
import 'package:logging/logging.dart'; // Added for logging

final _log = Logger('TCPConnection');

/// TCP implementation of the Conn interface, upgraded for multiplexing.
class TCPConnection implements TransportConn {
  final Socket _socket; // The underlying (potentially secured) socket
  final MultiAddr _remoteAddr;
  final MultiAddr _localAddr;
  // final TransportConfig _config; // May not be needed directly if Multiplexer and ResourceManager are passed in
  final ConnManager? _legacyConnManager; // For phased transition if needed

  // final Multiplexer _multiplexer; // Removed
  final ResourceManager _resourceManager; // Kept for now, for raw connection scope
  // MuxedConn? _muxedConn; // Removed
  ConnManagementScope? _connManagementScope; // Made nullable

  Timer? _readTimeout; // These timeouts might apply to the underlying socket before muxing
  Timer? _writeTimeout; // or might be deprecated in favor of stream-level deadlines.
  Duration? _currentReadTimeout;
  Duration? _currentWriteTimeout;
  bool _closed = false;
  // transport_state.ConnectionState _transportState = transport_state.ConnectionState.connecting; // Handled by ConnManager

  final String _id; // Unique ID for this connection

  // Stream management for raw socket data
  // StreamController<Uint8List>? _dataStreamController; // Removed
  StreamSubscription? _socketSubscription;
  final BytesBuilder _receiveBuffer = BytesBuilder();
  final Lock _writeLock = Lock(); // Added for synchronizing writes
  Completer<void>? _pendingReadCompleter; // Used to signal read() when data arrives
  bool _socketIsDone = false; // Tracks if the socket's onDone/onError has been called

  final List<P2PStreamAdapter> _streams = [];

  final PeerId _localPeerId;
  PeerId? _remotePeerId; // Made nullable as it might not be known for raw incoming
  final bool _isServer; // Was this connection accepted by a listener?
  final Direction _direction; // Direction of the connection establishment

  // Callback for when a new inbound stream is accepted - REMOVED for raw connection
  // final void Function(P2PStream stream)? onIncomingStream;


  /// Creates a new raw TCP connection.
  TCPConnection(
    this._socket,
    this._localAddr,
    this._remoteAddr,
    this._localPeerId,
    this._remotePeerId, // Can be null for incoming raw connections before handshake
    // this._multiplexer, // Removed
    this._resourceManager, // Kept for now
    this._isServer, {
    // this.onIncomingStream, // Removed
    ConnManager? legacyConnManager,
  }) : _id = Uuid().v4(),
       _legacyConnManager = legacyConnManager,
       _direction = _isServer ? Direction.inbound : Direction.outbound {
    _log.fine('TCPConnection($_id) CREATED. IsServer: $_isServer, Direction: $_direction. Socket Local: ${_socket.address.address}:${_socket.port}, Socket Remote: ${_socket.remoteAddress.address}:${_socket.remotePort}');
    this._legacyConnManager?.registerConnection(this);
  }

  /// Asynchronous factory method to create and initialize a TCPConnection.
  static Future<TCPConnection> create(
    Socket socket,
    MultiAddr localAddr,
    MultiAddr remoteAddr,
    PeerId localPeerId,
    PeerId? remotePeerId, // Can be null
    // Multiplexer multiplexer, // Removed
    ResourceManager resourceManager,
    bool isServer, {
    // void Function(P2PStream stream)? onIncomingStream, // Removed
    ConnManager? legacyConnManager,
  }) async {
    final conn = TCPConnection(
      socket, localAddr, remoteAddr, localPeerId, remotePeerId,
      // multiplexer, // Removed
      resourceManager, isServer,
      // onIncomingStream: onIncomingStream, // Removed
      legacyConnManager: legacyConnManager,
    );
    await conn._initialize();
    return conn;
  }

  Future<void> _initialize() async {
    if (_closed) {
      throw StateError('Connection is already closed');
    }
    // Completer to manage the success/failure of the socket listening setup phase.
    final initListenCompleter = Completer<void>();
    _socketIsDone = false; // Reset for new connection

    try {
      _connManagementScope = await _resourceManager.openConnection(_direction, true /* useFd */, _remoteAddr);
      if (_remotePeerId != null) { // Only set peer if known
        await _connManagementScope!.setPeer(_remotePeerId!);
      }
      
      _legacyConnManager?.updateState(this, transport_state.ConnectionState.active, error: null);

      // _dataStreamController = StreamController<Uint8List>.broadcast(); // Removed
      _socketSubscription = _socket.listen(
        (dataChunk) {
          _log.finest('TCPConnection($id) - RAW_SOCKET_DATA_CHUNK_RECV (${dataChunk.length} bytes): ${hex.encode(dataChunk)}');
          _receiveBuffer.add(dataChunk);
          if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
            _pendingReadCompleter!.complete();
          }
        },
        onError: (error, stackTrace) {
          _log.severe('TCPConnection($id) - Socket error: $error', error, stackTrace);
          _socketIsDone = true;
          if (!initListenCompleter.isCompleted) { // Error during setup phase
            initListenCompleter.completeError(error, stackTrace);
          } else if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) { // Ongoing error after successful init
            _pendingReadCompleter!.completeError(error, stackTrace);
          }
          // If init is complete, _handleError will be called by the main catch block if initListenCompleter errors,
          // or here for ongoing errors.
          if (initListenCompleter.isCompleted) {
             _handleError(error);
          }
        },
        onDone: () {
          _log.fine('TCPConnection($id) - Socket stream done.');
          _socketIsDone = true;
          if (!initListenCompleter.isCompleted) { // Socket closed during setup phase
            initListenCompleter.completeError(StateError("Socket stream closed unexpectedly during initialization"));
          } else if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) { // Ongoing closure after successful init
            _pendingReadCompleter!.complete(); // Signal EOF
          }
          // Removed auto-close logic: The connection should remain readable for buffered data.
          // The _socketIsDone flag will signal EOF to the read() method.
          // if (initListenCompleter.isCompleted && !_closed) { 
          //   this.close().catchError((e) => _log.warning('Error during auto-close on socket done: $e'));
          // }
        },
        cancelOnError: true, 
      );

      await Future.microtask(() {}); // Allow any immediate errors from listen() to propagate

      if (!initListenCompleter.isCompleted) {
        initListenCompleter.complete();
      }
      
      await initListenCompleter.future;

    } catch (e) {
      _legacyConnManager?.updateState(this, transport_state.ConnectionState.error, error: e);
      if (!_closed) {
        _closed = true; 
        await _socketSubscription?.cancel();
        _socketSubscription = null; 
        // No _dataStreamController to close
        _receiveBuffer.clear();
        try {
          await _socket.close(); 
        } catch (socketCloseError) {
          _log.warning('Error closing socket during _initialize error handling: $socketCloseError');
        }
        _connManagementScope?.done(); 
        _connManagementScope = null; 
      }
      rethrow;
    }
  }

  // void _acceptLoop() async { // Removed }

  @override
  String get id => _id;

  @override
  PeerId get localPeer => _localPeerId;

  @override
  PeerId get remotePeer { // remotePeer might be null initially for raw incoming
    if (_remotePeerId == null) {
      // This case should be handled by higher layers after security handshake.
      // For now, throw or return a placeholder if accessed too early.
      throw StateError('Remote PeerId not yet established for this raw connection.');
    }
    return _remotePeerId!;
  }

  @override
  Future<PublicKey?> get remotePublicKey async {
    if (_remotePeerId == null) return null;
    return _remotePeerId!.extractPublicKey();
  }

  @override
  MultiAddr get localMultiaddr => _localAddr;

  @override
  MultiAddr get remoteMultiaddr => _remoteAddr;

  @override
  bool get isClosed => _closed; // Simpler check for raw connection

  @override
  ConnState get state {
    return ConnState(
      streamMultiplexer: '', // No multiplexer at this raw stage
      security: '', // No security at this raw stage
      transport: 'tcp',
      usedEarlyMuxerNegotiation: false, // Not applicable
    );
  }

  @override
  ConnStats get stat {
    if (_connManagementScope == null) {
      return _ConnStatsImpl(
        stats: Stats(direction: _direction, opened: DateTime.now(), limited: true), // Simplified
        numStreams: 0, // No streams at raw layer
      );
    }
    return _ConnStatsImpl(
      stats: Stats(
        direction: _direction,
        opened: DateTime.now(), // Simplified
        limited: _connManagementScope!.stat.memory > 0, 
      ),
      numStreams: 0, // No streams at raw layer
    );
  }

  @override
  ConnScope get scope {
    if (_connManagementScope == null) {
      // This indicates an issue with initialization or lifecycle.
      throw StateError('Connection scope accessed before initialization or after failure.');
    }
    return _ConnScopeImpl(_connManagementScope!);
  }

  @override
  Future<P2PStream> newStream(Context context) async {
    throw StateError('Cannot create new streams on a raw, non-multiplexed connection.');
  }

  @override
  Future<List<P2PStream>> get streams async {
    return []; // No streams at this layer
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;

    _legacyConnManager?.updateState(this, transport_state.ConnectionState.closing, error: null);

    // _streams.clear(); // No streams to clear

    // _muxedConn = null; // No muxedConn

    // Clean up
    await _socketSubscription?.cancel();
    _socketSubscription = null;
    
    // Complete any pending read with an error
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      _pendingReadCompleter!.completeError(StateError('Connection closed while a read was pending'));
      _pendingReadCompleter = null;
    }

    _receiveBuffer.clear();

    try {
      await _socket.close();
    } catch (e) {
      _log.warning('Error closing socket: $e');
    }
    
    _connManagementScope?.done();
    _legacyConnManager?.updateState(this, transport_state.ConnectionState.closed, error: null);
    _readTimeout?.cancel();
    _writeTimeout?.cancel();
    _log.fine('TCPConnection($id) - Connection closed.');
  }

  @override
  Future<Uint8List> read([int? length]) async {
    final readId = Uuid().v4().substring(0, 8);
    _log.finer('TCPConnection($id) - Read($readId) START. Requested: $length. Buffer: ${_receiveBuffer.length} bytes.');
    _assertNotClosed();

    if (length != null && length < 0) throw ArgumentError('Length cannot be negative');
    if (length == 0) {
       _log.finer('TCPConnection($id) - Read($readId) END (requested 0 bytes). Returning 0 bytes.');
      return Uint8List(0);
    }

    while (true) { // Loop until enough data is available or EOF/error
      if (length != null) { // Specific length requested
        if (_receiveBuffer.length >= length) {
          final result = Uint8List.fromList(_receiveBuffer.toBytes().sublist(0, length));
          final remainingBytes = _receiveBuffer.toBytes().sublist(length);
          _receiveBuffer.clear();
          _receiveBuffer.add(remainingBytes);
          _log.finer('TCPConnection($id) - Read($readId) END (from buffer). Returning ${result.length} bytes: ${hex.encode(result)}. Buffer after: ${_receiveBuffer.length} bytes: ${hex.encode(remainingBytes)}');
          return result;
        }
      } else { // length is null, read any available data
        if (_receiveBuffer.isNotEmpty) {
          final result = _receiveBuffer.toBytes();
          _receiveBuffer.clear();
          _log.finer('TCPConnection($id) - Read($readId) END (all from buffer, length null). Returning ${result.length} bytes: ${hex.encode(result)}. Buffer after: 0');
          return result;
        }
      }

      // If not enough data, check for EOF or closed state
      if (_socketIsDone) {
        if (_receiveBuffer.isEmpty) {
          _log.finer('TCPConnection($id) - Read($readId) END (socket done, buffer empty -> EOF). Returning 0 bytes.');
          return Uint8List(0); // Clean EOF if buffer is empty
        }
        // Socket is done, buffer is NOT empty. Return what's available from buffer.
        Uint8List resultToReturn;
        if (length == null || _receiveBuffer.length <= length) {
          // Requested all, or specific length but buffer has less than or equal to what's requested.
          resultToReturn = _receiveBuffer.toBytes();
          _receiveBuffer.clear();
          _log.finer('TCPConnection($id) - Read($readId) END (socket done, returning all/partial from buffer: ${resultToReturn.length} bytes).');
        } else { // length != null && _receiveBuffer.length > length
          // Buffer has more than the specific length requested.
          resultToReturn = Uint8List.fromList(_receiveBuffer.toBytes().sublist(0, length));
          final remainingBytesInInternalBuffer = _receiveBuffer.toBytes().sublist(length);
          _receiveBuffer.clear();
          _receiveBuffer.add(remainingBytesInInternalBuffer);
          _log.finer('TCPConnection($id) - Read($readId) END (socket done, returning specific length from buffer: ${resultToReturn.length} bytes, remaining in buffer: ${_receiveBuffer.length}).');
        }
        return resultToReturn;
      }
      
      if (_closed) { // Connection explicitly closed via this.close() by the application
          _log.warning('TCPConnection($id) - Read($readId) ERROR: Connection explicitly closed by API call.');
          throw StateError('Connection closed.');
      }

      // Not enough data, socket not done, connection not closed: wait for more data
      _log.finer('TCPConnection($id) - Read($readId) ASYNC WAIT. Requested: $length. Buffer: ${_receiveBuffer.length}');
      _pendingReadCompleter = Completer<void>();
      Timer? timeoutTimer;

      try {
        if (_currentReadTimeout != null && _currentReadTimeout! > Duration.zero) {
          timeoutTimer = Timer(_currentReadTimeout!, () {
            if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
              _log.warning('TCPConnection($id) - Read($readId) TIMEOUT after $_currentReadTimeout.');
              _pendingReadCompleter!.completeError(TimeoutException('Raw read timed out after $_currentReadTimeout'));
            }
          });
        }
        await _pendingReadCompleter!.future;
      } finally {
        timeoutTimer?.cancel();
        // _pendingReadCompleter = null; // Do not nullify here, a new one is made if loop continues
      }
      _log.finer('TCPConnection($id) - Read($readId) ASYNC AWOKE. Re-checking buffer.');
      // Loop continues
    }
  }

  /// Pushes data back to the front of the receive buffer so the next read()
  /// returns it. Used to inject leftover bytes from multistream-select
  /// negotiation before the Noise handshake reads from this connection.
  void pushBack(Uint8List data) {
    if (data.isEmpty) return;
    _log.fine('TCPConnection($id) - pushBack: ${data.length} bytes pushed to front of receive buffer');
    final existing = _receiveBuffer.toBytes();
    _receiveBuffer.clear();
    _receiveBuffer.add(data);
    if (existing.isNotEmpty) {
      _receiveBuffer.add(existing);
    }
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      _pendingReadCompleter!.complete();
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    _assertNotClosed();
    await _writeLock.synchronized(() async {
      if (_closed) { // Re-check after acquiring lock
        _log.finer('TCPConnection($id) - Write aborted, connection closed while waiting for lock.');
        throw StateError('Connection is closed (id: $_id)');
      }
      try {
        final dataHex = hex.encode(data); // Encode once for logging
        _log.finer('TCPConnection.write (id: $id): Writing ${data.length} bytes: $dataHex');
        _socket.add(data);
        await _socket.flush();
        _log.finest('TCPConnection.write (id: $id): Flushed ${data.length} bytes successfully. Data preview (hex): ${dataHex.substring(0, dataHex.length > 40 ? 40 : dataHex.length)}...');
      } catch (e) {
        _log.finer('TCPConnection($id) - Error during socket write/flush: $e. Closing connection.');
        // Avoid calling close() again if already closing due to another error or from another write
        if (!_closed) {
          await close();
        }
        rethrow;
      }
    });
  }

  @override
  void setReadTimeout(Duration timeout) { // Implemented from TransportConn
    _currentReadTimeout = timeout;
  }

  @override
  void setWriteTimeout(Duration timeout) { // Implemented from TransportConn
    _currentWriteTimeout = timeout;
  }

  Socket get socket => _socket;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is TCPConnection && other._id == _id;
  }

  @override
  int get hashCode => _id.hashCode;

  @override
  String toString() {
    return 'TCPConnection(id: $_id, local: $_localAddr, remote: $_remoteAddr, closed: $_closed)';
  }

  void _handleError(Object error) {
    if (_closed) return;
    _log.finer('TCPConnection Error: $error');
    _legacyConnManager?.updateState(this, transport_state.ConnectionState.error, error: error);
    if (!_closed) {
       close().catchError((e) => _log.finer('Error during cleanup in _handleError: $e'));
    }
  }

  void _assertNotClosed() {
    if (_closed) { // Simpler check
      throw StateError('Connection is closed (id: $_id)');
    }
  }

  @override
  void notifyActivity() {
    // If using the legacy ConnManager, notify it.
    // This assumes _legacyConnManager is the correct one to notify for activity tracking.
    // If a different ConnManager instance is responsible for the idle timeout of this
    // specific TCPConnection (e.g., one from a higher layer like Swarm or BasicHost),
    // then that's the one that should be called.
    // For now, using _legacyConnManager if available.
    if (!_closed && _legacyConnManager != null) {
      _legacyConnManager!.recordActivity(this);
    }
  }

  // _handleDone for the raw socket is less relevant as muxer manages the socket.
  // Muxer closure or errors from acceptStream/openStream are primary indicators.

}

/// Implementation of ConnStats
class _ConnStatsImpl implements ConnStats {
  @override
  final Stats stats;
  @override
  final int numStreams;

  _ConnStatsImpl({required this.stats, required this.numStreams});
}

/// Implementation of ConnScope for TCPConnection
class _ConnScopeImpl implements ConnScope {
  final ConnManagementScope _connManagementScope;

  _ConnScopeImpl(this._connManagementScope);

  @override
  Future<ResourceScopeSpan> beginSpan() async {
    // The span returned by ConnManagementScope should already be a ResourceScopeSpan
    final span = await _connManagementScope.beginSpan();
    return _ResourceScopeSpanImpl(span); // Wrap if necessary, or return directly if compatible
  }

  @override
  void releaseMemory(int size) {
    _connManagementScope.releaseMemory(size);
  }

  @override
  Future<void> reserveMemory(int size, int priority) async {
    await _connManagementScope.reserveMemory(size, priority);
  }

  @override
  ScopeStat get stat {
    return _connManagementScope.stat;
  }
}

/// Implementation of ResourceScopeSpan for TCPConnection
class _ResourceScopeSpanImpl implements ResourceScopeSpan {
  final ResourceScopeSpan _underlyingSpan;

  _ResourceScopeSpanImpl(this._underlyingSpan);

  @override
  Future<ResourceScopeSpan> beginSpan() async {
    final newSpan = await _underlyingSpan.beginSpan();
    return _ResourceScopeSpanImpl(newSpan);
  }

  @override
  void done() {
    _underlyingSpan.done();
  }

  @override
  void releaseMemory(int size) {
    _underlyingSpan.releaseMemory(size);
  }

  @override
  Future<void> reserveMemory(int size, int priority) async {
    await _underlyingSpan.reserveMemory(size, priority);
  }

  @override
  ScopeStat get stat {
    return _underlyingSpan.stat;
  }
}
