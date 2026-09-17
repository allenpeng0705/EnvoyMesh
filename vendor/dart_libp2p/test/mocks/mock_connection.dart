import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
// conn.dart is imported for Conn, ConnState, ConnStats, Stats
// but ConnScope will come from rcmgr
import 'package:dart_libp2p/core/network/conn.dart' show Conn, ConnState, ConnStats, Stats;
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // For P2PStream
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceScope;
import 'package:dart_libp2p/core/protocol/protocol.dart';

/// A mock implementation of Connection for testing
class MockConnection implements Conn {
  @override
  final String id;
  
  @override
  final MultiAddr localAddr;
  
  @override
  final MultiAddr remoteAddr;
  
  @override
  final PeerId remotePeer;
  
  @override
  final PeerId localPeer;
  
  bool _isClosed = false;
  
  final List<P2PStream<dynamic>> _streams = [];
  
  final ConnState _state = ConnState(
    streamMultiplexer: '/mock/1.0.0',
    security: '/mock/1.0.0',
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );
  
  final ConnStats _stats = MockConnStats(
    stats: Stats(
      direction: Direction.outbound, // Direction comes from common.dart
      opened: DateTime.now(),
    ),
    numStreams: 0,
  );

  final ConnScope _scope = MockConnScope(); // ConnScope will be from rcmgr.dart
  
  MockConnection({
    required this.localAddr,
    required this.remoteAddr,
    required this.remotePeer,
    PeerId? localPeer,
    String? id,
  }) : id = id ?? DateTime.now().millisecondsSinceEpoch.toString(),
       localPeer = localPeer ?? PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC');
  
  @override
  Future<void> close() async {
    _isClosed = true;
  }
  
  @override
  Future<P2PStream<dynamic>> newStream(Context context) async {
    throw UnimplementedError('newStream not implemented in MockConnection');
  }
  
  @override
  Future<List<P2PStream<dynamic>>> get streams async => _streams;
  
  @override
  bool get isClosed => _isClosed;
  
  @override
  Future<PublicKey?> get remotePublicKey async => null;
  
  @override
  ConnState get state => _state;
  
  @override
  MultiAddr get localMultiaddr => localAddr;
  
  @override
  MultiAddr get remoteMultiaddr => remoteAddr;
  
  @override
  ConnStats get stat => _stats;
  
  @override
  ConnScope get scope => _scope;

  @override
  Future<void> reset() async {
    await close();
  }

  @override
  Future<Uint8List> read([int? length]) async {
    // In a real implementation, we would read from the socket
    // For testing, we'll just return an empty buffer
    return Uint8List(0);
  }

  @override
  void setReadTimeout(Duration timeout) {}

  @override
  void setWriteTimeout(Duration timeout) {}

  @override
  Socket get socket {
    throw UnimplementedError('Socket is not implemented in MockConnection');
  }

  @override
  Future<void> write(Uint8List data) async {
    // In a real implementation, we would write to the socket
    // For testing, we'll just do nothing
  }
}

/// Mock implementation of ConnStats
class MockConnStats implements ConnStats {
  @override
  final Stats stats;
  
  @override
  final int numStreams;
  
  MockConnStats({
    required this.stats,
    required this.numStreams,
  });
}

/// Mock implementation of ConnScope
class MockConnScope implements ConnScope {
  @override
  Future<void> reserveMemory(int size, int priority) async {}
  
  @override
  void releaseMemory(int size) {}
  
  @override
  ScopeStat get stat => const ScopeStat( // Renamed scopeStat to stat
    numStreamsInbound: 0,
    numStreamsOutbound: 0,
    numConnsInbound: 0,
    numConnsOutbound: 0,
    numFD: 0,
    memory: 0,
  );
  
  @override
  Future<ResourceScopeSpan> beginSpan() async { // ResourceScopeSpan from rcmgr.dart
    throw UnimplementedError('beginSpan not implemented in MockConnScope');
  }
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
