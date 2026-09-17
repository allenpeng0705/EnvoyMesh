import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/mux.dart' as core_mux;
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart' as p2p_mux;
import 'package:dart_libp2p/p2p/security/secured_connection.dart';
import 'package:logging/logging.dart';

/// Factory for creating mock multiplexed connections
/// This is the proper implementation of the p2p_mux.Multiplexer interface
class StreamlinedMockMultiplexerFactory implements p2p_mux.Multiplexer {
  final Logger _logger = Logger('StreamlinedMockMultiplexerFactory');

  @override
  String get protocolId => '/yamux/1.0.0';

  @override
  Future<core_mux.MuxedConn> newConnOnTransport(
    TransportConn transport,
    bool isServer,
    PeerScope peerScope,
  ) async {
    _logger.fine('StreamlinedMockMultiplexerFactory: Creating new muxed connection, isServer=$isServer');
    final securedConn = transport as SecuredConnection;
    
    // Create the actual multiplexed connection implementation
    final multiplexer = StreamlinedMockMultiplexer(securedConn, !isServer);
    return StreamlinedMockMuxedConn(securedConn, isServer, multiplexer);
  }

  // Factory methods - these should not be called on the factory itself
  @override
  Future<List<P2PStream>> get streams async => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  Future<P2PStream> acceptStream() async => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  Stream<P2PStream> get incomingStreams => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  int get maxStreams => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  int get numStreams => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  bool get canCreateStream => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  void setStreamHandler(Future<void> Function(P2PStream stream) handler) => 
      throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  void removeStreamHandler() => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  Future<void> close() async => throw UnsupportedError('Factory method - use MuxedConn instead');

  @override
  bool get isClosed => throw UnsupportedError('Factory method - use MuxedConn instead');
}

/// Streamlined mock multiplexer that focuses on connection state tracking
/// This handles the actual multiplexing logic for a single connection
class StreamlinedMockMultiplexer {
  final Logger _logger = Logger('StreamlinedMockMultiplexer');
  
  final SecuredConnection _securedConn;
  final bool _isClient;
  final List<StreamlinedMockStream> _streams = [];
  int _nextStreamId = 1;
  bool _isClosed = false;
  final StreamController<P2PStream> _incomingStreamsController = StreamController.broadcast();
  Future<void> Function(P2PStream stream)? _streamHandler;

  // Connection reuse tracking
  int _totalStreamsCreated = 0;
  int _activeStreams = 0;
  final DateTime _createdAt = DateTime.now();
  final List<String> _streamHistory = [];

  StreamlinedMockMultiplexer(this._securedConn, this._isClient) {
    _logger.fine('Created StreamlinedMockMultiplexer: client=$_isClient, conn=${_securedConn.id}');
  }

  String get protocolId => '/yamux/1.0.0';

  Future<List<P2PStream>> get streams async => _streams.cast<P2PStream>();

  Future<P2PStream> acceptStream() async {
    _logger.fine('StreamlinedMockMultiplexer: Accepting stream');
    final stream = createStream(Context(), isOutbound: false);
    return stream;
  }

  Stream<P2PStream> get incomingStreams => _incomingStreamsController.stream;

  int get maxStreams => 1000;

  int get numStreams => _streams.length;

  bool get canCreateStream => numStreams < maxStreams && !_isClosed;

  void setStreamHandler(Future<void> Function(P2PStream stream) handler) {
    _streamHandler = handler;
    _logger.fine('StreamlinedMockMultiplexer: Set stream handler');
  }

  void removeStreamHandler() {
    _streamHandler = null;
    _logger.fine('StreamlinedMockMultiplexer: Removed stream handler');
  }

  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      for (final stream in List.from(_streams)) {
        await stream.close();
      }
      _streams.clear();
      await _incomingStreamsController.close();
      _logConnectionStats();
      _logger.fine('StreamlinedMockMultiplexer: Closed');
    }
  }

  bool get isClosed => _isClosed;

  /// Creates a new mock stream with connection reuse tracking
  StreamlinedMockStream createStream(Context context, {required bool isOutbound}) {
    if (_isClosed) {
      throw StateError('Multiplexer is closed');
    }

    final streamId = _nextStreamId++;
    _totalStreamsCreated++;
    _activeStreams++;
    
    final stream = StreamlinedMockStream(
      id: streamId.toString(),
      conn: _securedConn,
      isOutbound: isOutbound,
      onClose: () => _onStreamClosed(streamId.toString()),
    );
    
    _streams.add(stream);
    _streamHistory.add('Created stream $streamId (${isOutbound ? 'outbound' : 'inbound'}) at ${DateTime.now()}');
    
    _logger.fine('StreamlinedMockMultiplexer: Created stream $streamId, outbound=$isOutbound. Total created: $_totalStreamsCreated, Active: $_activeStreams');
    
    return stream;
  }

  void _onStreamClosed(String streamId) {
    _activeStreams--;
    _streamHistory.add('Closed stream $streamId at ${DateTime.now()}');
    _logger.fine('StreamlinedMockMultiplexer: Stream $streamId closed. Active streams: $_activeStreams');
    
    // Remove from active streams list
    _streams.removeWhere((s) => s.id() == streamId);
  }

  void _logConnectionStats() {
    final age = DateTime.now().difference(_createdAt);
    _logger.info('Connection ${_securedConn.id} multiplexer stats:');
    _logger.info('  - Age: $age');
    _logger.info('  - Total streams created: $_totalStreamsCreated');
    _logger.info('  - Final active streams: $_activeStreams');
    _logger.info('  - Stream history: ${_streamHistory.length} events');
    
    // Log recent stream history for debugging
    final recentHistory = _streamHistory.length > 10 
        ? _streamHistory.sublist(_streamHistory.length - 10)
        : _streamHistory;
    for (final event in recentHistory) {
      _logger.info('    $event');
    }
  }

  // Diagnostic methods for testing
  int get totalStreamsCreated => _totalStreamsCreated;
  int get activeStreams => _activeStreams;
  List<String> get streamHistory => List.unmodifiable(_streamHistory);
  DateTime get createdAt => _createdAt;
  Duration get age => DateTime.now().difference(_createdAt);
}

/// Streamlined mock muxed connection
class StreamlinedMockMuxedConn implements core_mux.MuxedConn {
  final Logger _logger = Logger('StreamlinedMockMuxedConn');
  
  final SecuredConnection _transport;
  final bool _isServer;
  final StreamlinedMockMultiplexer _multiplexer;

  StreamlinedMockMuxedConn(this._transport, this._isServer, this._multiplexer) {
    _logger.fine('Created StreamlinedMockMuxedConn: server=$_isServer, conn=${_transport.id}');
  }

  // Expose the multiplexer for testing
  StreamlinedMockMultiplexer get multiplexer => _multiplexer;

  @override
  Future<core_mux.MuxedStream> openStream(Context context) async {
    _logger.fine('StreamlinedMockMuxedConn: Opening new stream on connection ${_transport.id}');
    final stream = _multiplexer.createStream(context, isOutbound: true);
    return stream;
  }

  @override
  Future<core_mux.MuxedStream> acceptStream() async {
    _logger.fine('StreamlinedMockMuxedConn: Accepting stream on connection ${_transport.id}');
    final stream = _multiplexer.createStream(Context(), isOutbound: false);
    return stream;
  }

  @override
  Future<void> close() async {
    _logger.fine('StreamlinedMockMuxedConn: Closing connection ${_transport.id}');
    await _multiplexer.close();
  }

  @override
  bool get isClosed => _multiplexer.isClosed;
}

/// Streamlined mock stream with connection reuse tracking
class StreamlinedMockStream implements core_mux.MuxedStream, P2PStream<Uint8List> {
  final Logger _logger = Logger('StreamlinedMockStream');
  
  final String _id;
  final SecuredConnection _conn;
  final bool _isOutbound;
  final VoidCallback? _onClose;
  bool _isClosed = false;
  String _protocol = '';
  final List<Uint8List> _writeBuffer = [];
  final DateTime _createdAt = DateTime.now();

  StreamlinedMockStream({
    required String id,
    required SecuredConnection conn,
    required bool isOutbound,
    VoidCallback? onClose,
  }) : _id = id, _conn = conn, _isOutbound = isOutbound, _onClose = onClose {
    _logger.fine('Created StreamlinedMockStream: $_id, outbound=$_isOutbound, conn=${_conn.id}');
  }

  @override
  String id() => _id;

  @override
  String protocol() => _protocol;

  @override
  Future<void> setProtocol(String protocol) async {
    _protocol = protocol;
    _logger.fine('StreamlinedMockStream ${id()}: Set protocol to $protocol');
  }

  @override
  bool get isClosed => _isClosed;

  @override
  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      final age = DateTime.now().difference(_createdAt);
      _logger.fine('StreamlinedMockStream ${id()}: Closed (age: $age, writes: ${_writeBuffer.length})');
      _onClose?.call();
    }
  }

  @override
  Future<void> reset() async {
    await close();
    _logger.fine('StreamlinedMockStream ${id()}: Reset');
  }

  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_isClosed) {
      throw StateError('Stream is closed');
    }
    
    // For testing, return empty data to simulate no data available
    return Uint8List(0);
  }

  @override
  Future<void> write(List<int> data) async {
    if (_isClosed) {
      throw StateError('Stream is closed');
    }
    
    _writeBuffer.add(Uint8List.fromList(data));
    _logger.fine('StreamlinedMockStream ${id()}: Wrote ${data.length} bytes (total writes: ${_writeBuffer.length})');
  }

  @override
  Future<void> closeWrite() async {
    _logger.fine('StreamlinedMockStream ${id()}: Close write');
  }

  @override
  Future<void> closeRead() async {
    _logger.fine('StreamlinedMockStream ${id()}: Close read');
  }

  @override
  StreamStats stat() => StreamStats(
    direction: _isOutbound ? Direction.outbound : Direction.inbound,
    opened: _createdAt,
  );

  @override
  Conn get conn => _conn;

  @override
  StreamManagementScope scope() => NullScope();

  @override
  Future<void> setDeadline(DateTime? time) async {
    // Mock implementation - no-op
  }

  @override
  Future<void> setReadDeadline(DateTime time) async {
    // Mock implementation - no-op
  }

  @override
  Future<void> setWriteDeadline(DateTime time) async {
    // Mock implementation - no-op
  }

  @override
  P2PStream<Uint8List> get incoming => this;

  /// Get the data written to this stream for testing
  List<Uint8List> get writtenData => List.unmodifiable(_writeBuffer);
  
  /// Get diagnostic information about this stream
  Duration get age => DateTime.now().difference(_createdAt);
  int get writeCount => _writeBuffer.length;

  @override
  // TODO: implement isWritable
  bool get isWritable => throw UnimplementedError();
}

/// Null scope implementation for testing
class NullScope implements StreamManagementScope, PeerScope, ProtocolScope, ServiceScope {
  @override
  ScopeStat get stat => const ScopeStat();

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  void releaseMemory(int size) {}

  @override
  Future<ResourceScopeSpan> beginSpan() async => NullResourceScopeSpan();

  @override
  void done() {}

  @override
  Future<void> setProtocol(String protocol) async {}

  @override
  Future<void> setService(String service) async {}

  @override
  ProtocolScope? get protocolScope => null;

  @override
  ServiceScope? get serviceScope => null;

  @override
  PeerScope get peerScope => this;

  @override
  String get name => '';

  @override
  String get protocol => '';

  @override
  PeerId get peer => PeerId.fromString('');
}

/// Null resource scope span for testing
class NullResourceScopeSpan implements ResourceScopeSpan {
  @override
  void done() {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  void releaseMemory(int size) {}

  @override
  ScopeStat get stat => const ScopeStat();

  @override
  Future<ResourceScopeSpan> beginSpan() async => this;
}

typedef VoidCallback = void Function();
