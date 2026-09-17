import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
// Conn, ConnState, ConnStats, Stats are used from conn.dart
// ConnScope will come from rcmgr.dart
import 'package:dart_libp2p/core/network/conn.dart' show Conn, ConnState, ConnStats, Stats; 
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // For P2PStream
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceScope;
import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Mock connection specialized for secured connection tests
/// Focuses on length prefixing and message boundaries
class SecuredMockConnection implements TransportConn {
  // Stream controllers for bidirectional communication
  final _incomingData = StreamController<List<int>>.broadcast();
  final _outgoingData = StreamController<List<int>>.broadcast();

  // Buffer for incoming data
  final _buffer = <int>[];

  // Stream subscription for cleanup
  StreamSubscription<List<int>>? _subscription;

  // Connection properties
  final String _id;
  bool _closed = false;
  final writes = <Uint8List>[];

  SecuredMockConnection(this._id);

  /// Creates a pair of connected secured mock connections
  static (SecuredMockConnection, SecuredMockConnection) createPair({
    String id1 = 'secured1',
    String id2 = 'secured2',
  }) {
    final conn1 = SecuredMockConnection(id1);
    final conn2 = SecuredMockConnection(id2);

    // Wire up bidirectional communication
    conn1._subscription = conn2._outgoingData.stream.listen((data) {
      if (!conn1.isClosed) {
        conn1._buffer.addAll(data);
        conn1._incomingData.add(data);
      }
    });

    conn2._subscription = conn1._outgoingData.stream.listen((data) {
      if (!conn2.isClosed) {
        conn2._buffer.addAll(data);
        conn2._incomingData.add(data);
      }
    });

    return (conn1, conn2);
  }

  @override
  Future<void> close() async {
    if (_closed) return;

    await _subscription?.cancel();
    await _incomingData.close();
    await _outgoingData.close();
    _buffer.clear();
    _closed = true;
  }

  @override
  String get id => _id;

  @override
  bool get isClosed => _closed;

  @override
  MultiAddr get localMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/1234');

  @override
  MultiAddr get remoteMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/5678');

  @override
  PeerId get localPeer => throw UnimplementedError('localPeer not implemented in SecuredMockConnection');

  @override
  PeerId get remotePeer => throw UnimplementedError('remotePeer not implemented in SecuredMockConnection');

  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnState get state => ConnState(
    streamMultiplexer: 'mock-muxer/1.0.0',
    security: 'mock-security/1.0.0',
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  ConnStats get stat => _MockConnStats(
    stats: Stats(
      direction: Direction.outbound,
      opened: DateTime.now(),
    ),
    numStreams: 0,
  );

  @override
  ConnScope get scope => _MockConnScope();

  @override
  Future<P2PStream> newStream(Context context) async {
    throw UnimplementedError('Stream multiplexing not implemented in SecuredMockConnection');
  }

  @override
  Future<List<P2PStream>> get streams async => [];

  @override
  Socket get socket => throw UnimplementedError('Socket is not implemented in SecuredMockConnection');

  @override
  void setReadTimeout(Duration timeout) {}

  @override
  void setWriteTimeout(Duration timeout) {}

  @override
  Future<Uint8List> read([int? length]) async {
    if (_closed) {
      throw StateError('Connection is closed');
    }

    try {
      // Must specify length for secured connections
      if (length == null) {
        throw ArgumentError('Length must be specified for secured connections');
      }

      // If we already have enough data in the buffer, return it immediately
      if (_buffer.length >= length) {
        final result = Uint8List.fromList(_buffer.take(length).toList());
        _buffer.removeRange(0, length);
        return result;
      }

      // Wait until we have enough data
      // Note: Data is added to _buffer by the stream listener (see createPair),
      // so we just wait for the _incomingData event as a signal
      while (_buffer.length < length) {
        await _incomingData.stream.first.timeout(
          Duration(seconds: 5),
          onTimeout: () => throw TimeoutException('Read timed out'),
        );
        // Don't add to _buffer here - the listener already did it
      }

      // Return exactly the requested number of bytes
      final result = Uint8List.fromList(_buffer.take(length).toList());
      _buffer.removeRange(0, length);
      return result;
    } catch (e) {
      rethrow;
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_closed) {
      throw StateError('Connection is closed');
    }
    writes.add(data);
    _outgoingData.add(data);
  }

  /// For testing: get current buffer size
  int get debugBufferSize => _buffer.length;

  /// For testing: get buffer contents
  List<int> debugGetBufferContents() => List<int>.from(_buffer);

  @override
  void notifyActivity() {
    // Mock implementation, can be empty or log
  }
}

/// Mock implementation of ConnStats
class _MockConnStats implements ConnStats {
  @override
  final Stats stats;

  @override
  final int numStreams;

  const _MockConnStats({
    required this.stats,
    required this.numStreams,
  });
}

/// Mock implementation of ConnScope
class _MockConnScope implements ConnScope {
  @override
  Future<ResourceScopeSpan> beginSpan() async {
    return _MockResourceScopeSpan();
  }

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat(); // Renamed scopeStat to stat. ScopeStat from rcmgr.dart
}

/// Mock implementation of ResourceScopeSpan
class _MockResourceScopeSpan implements ResourceScopeSpan { // ResourceScopeSpan from rcmgr.dart
  @override
  Future<ResourceScopeSpan> beginSpan() async { // ResourceScopeSpan from rcmgr.dart
    return this;
  }

  @override
  void done() {}

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat(); // Renamed scopeStat to stat. ScopeStat from rcmgr.dart
}
