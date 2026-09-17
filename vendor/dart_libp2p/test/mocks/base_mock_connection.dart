import 'dart:io';
import 'dart:typed_data';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
// Conn, ConnState, ConnStats, Stats are used from conn.dart
// ConnScope will come from rcmgr.dart
import 'package:dart_libp2p/core/network/conn.dart' show Conn, ConnState, ConnStats, Stats;
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // For P2PStream
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceScope;
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:meta/meta.dart';

/// Base class for mock connections that implements common behavior
abstract class BaseMockConnection implements Conn {
  final String id;
  bool _closed = false;

  // For test verification
  final writes = <Uint8List>[];

  BaseMockConnection(this.id);

  @override
  bool get isClosed => _closed;

  // These methods are deprecated and should be replaced with localMultiaddr/remoteMultiaddr
  MultiAddr get localAddr => localMultiaddr;
  MultiAddr get remoteAddr => remoteMultiaddr;

  @override
  MultiAddr get localMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/1234');

  @override
  MultiAddr get remoteMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/5678');

  @override
  Socket get socket => throw UnimplementedError();

  @override
  void setReadTimeout(Duration timeout) {}

  @override
  void setWriteTimeout(Duration timeout) {}

  @override
  Future<P2PStream> newStream(Context context) async {
    throw UnimplementedError('Stream multiplexing not implemented in mock connection');
  }

  @override
  Future<List<P2PStream>> get streams async => [];

  @override
  PeerId get localPeer => throw UnimplementedError('localPeer not implemented in mock connection');

  @override
  PeerId get remotePeer => throw UnimplementedError('remotePeer not implemented in mock connection');

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

  /// Marks the connection as closed
  @protected
  void markClosed() {
    _closed = true;
  }

  /// Records a write for test verification
  @protected
  void recordWrite(Uint8List data) {
    writes.add(data);
  }

  /// Validates that the connection is not closed
  @protected
  void validateNotClosed() {
    if (_closed) throw StateError('Connection is closed');
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
