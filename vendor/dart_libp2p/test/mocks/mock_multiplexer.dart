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

/// Mock multiplexer for testing
class MockMultiplexer implements p2p_mux.Multiplexer {
  final Logger _logger = Logger('MockMultiplexer');
  
  final SecuredConnection _securedConn;
  final bool _isClient;
  final List<MockMuxedStream> _streams = [];
  int _nextStreamId = 1;
  bool _isClosed = false;
  final StreamController<P2PStream> _incomingStreamsController = StreamController.broadcast();
  Future<void> Function(P2PStream stream)? _streamHandler;

  MockMultiplexer(this._securedConn, this._isClient) {
    _logger.fine('Created MockMultiplexer: client=$_isClient');
  }

  @override
  String get protocolId => '/yamux/1.0.0';

  @override
  Future<core_mux.MuxedConn> newConnOnTransport(
    TransportConn transport,
    bool isServer,
    PeerScope peerScope,
  ) async {
    _logger.fine('MockMultiplexer: Creating new muxed connection, isServer=$isServer');
    // Cast transport to SecuredConnection for our mock
    final securedConn = transport as SecuredConnection;
    return MockMuxedConn(securedConn, isServer, this);
  }

  @override
  Future<List<P2PStream>> get streams async => _streams.cast<P2PStream>();

  @override
  Future<P2PStream> acceptStream() async {
    _logger.fine('MockMultiplexer: Accepting stream');
    final stream = createStream(Context(), isOutbound: false);
    return stream;
  }

  @override
  Stream<P2PStream> get incomingStreams => _incomingStreamsController.stream;

  @override
  int get maxStreams => 1000;

  @override
  int get numStreams => _streams.length;

  @override
  bool get canCreateStream => numStreams < maxStreams && !_isClosed;

  @override
  void setStreamHandler(Future<void> Function(P2PStream stream) handler) {
    _streamHandler = handler;
    _logger.fine('MockMultiplexer: Set stream handler');
  }

  @override
  void removeStreamHandler() {
    _streamHandler = null;
    _logger.fine('MockMultiplexer: Removed stream handler');
  }

  @override
  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      for (final stream in List.from(_streams)) {
        await stream.close();
      }
      _streams.clear();
      await _incomingStreamsController.close();
      _logger.fine('MockMultiplexer: Closed');
    }
  }

  @override
  bool get isClosed => _isClosed;

  /// Creates a new mock stream
  MockMuxedStream createStream(Context context, {required bool isOutbound}) {
    final streamId = _nextStreamId++;
    final stream = MockMuxedStream(
      id: streamId.toString(),
      conn: _securedConn,
      isOutbound: isOutbound,
    );
    _streams.add(stream);
    _logger.fine('MockMultiplexer: Created stream ${stream.id()}, outbound=$isOutbound');
    
    // If this is an incoming stream, notify the handler
    if (!isOutbound && _streamHandler != null) {
      Future.microtask(() async {
        try {
          await _streamHandler!(stream);
        } catch (e) {
          _logger.warning('MockMultiplexer: Error in stream handler: $e');
        }
      });
    }
    
    return stream;
  }

  void removeStream(MockMuxedStream stream) {
    _streams.remove(stream);
    _logger.fine('MockMultiplexer: Removed stream ${stream.id()}');
  }
}

/// Mock muxed connection
class MockMuxedConn implements core_mux.MuxedConn {
  final Logger _logger = Logger('MockMuxedConn');
  
  final SecuredConnection _transport;
  final bool _isServer;
  final MockMultiplexer _multiplexer;
  final StreamController<MockMuxedStream> _incomingStreams = StreamController();

  MockMuxedConn(this._transport, this._isServer, this._multiplexer) {
    _logger.fine('Created MockMuxedConn: server=$_isServer');
  }

  @override
  Future<core_mux.MuxedStream> openStream(Context context) async {
    _logger.fine('MockMuxedConn: Opening new stream');
    final stream = _multiplexer.createStream(context, isOutbound: true);
    return stream;
  }

  @override
  Future<core_mux.MuxedStream> acceptStream() async {
    _logger.fine('MockMuxedConn: Accepting stream');
    // For testing, we'll simulate accepting a stream
    final stream = _multiplexer.createStream(Context(), isOutbound: false);
    return stream;
  }

  @override
  Future<void> close() async {
    _logger.fine('MockMuxedConn: Closing');
    await _multiplexer.close();
    await _incomingStreams.close();
  }

  @override
  bool get isClosed => _multiplexer.isClosed;
}

/// Mock muxed stream
class MockMuxedStream implements core_mux.MuxedStream, P2PStream<Uint8List> {
  final Logger _logger = Logger('MockMuxedStream');
  
  final String _id;
  final SecuredConnection _conn;
  final bool _isOutbound;
  bool _isClosed = false;
  String _protocol = '';
  final List<Uint8List> _writeBuffer = [];

  MockMuxedStream({
    required String id,
    required SecuredConnection conn,
    required bool isOutbound,
  }) : _id = id, _conn = conn, _isOutbound = isOutbound {
    _logger.fine('Created MockMuxedStream: $_id, outbound=$_isOutbound');
  }

  @override
  String id() => _id;

  @override
  String protocol() => _protocol;

  @override
  Future<void> setProtocol(String protocol) async {
    _protocol = protocol;
    _logger.fine('MockMuxedStream ${id()}: Set protocol to $protocol');
  }

  @override
  bool get isClosed => _isClosed;

  @override
  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      _logger.fine('MockMuxedStream ${id()}: Closed');
    }
  }

  @override
  Future<void> reset() async {
    await close();
    _logger.fine('MockMuxedStream ${id()}: Reset');
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
    _logger.fine('MockMuxedStream ${id()}: Wrote ${data.length} bytes');
  }

  @override
  Future<void> closeWrite() async {
    _logger.fine('MockMuxedStream ${id()}: Close write');
  }

  @override
  Future<void> closeRead() async {
    _logger.fine('MockMuxedStream ${id()}: Close read');
  }

  @override
  StreamStats stat() => StreamStats(
    direction: _isOutbound ? Direction.outbound : Direction.inbound,
    opened: DateTime.now(),
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
