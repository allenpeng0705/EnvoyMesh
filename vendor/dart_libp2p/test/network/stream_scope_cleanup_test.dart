import 'dart:async';
import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm_stream.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm_conn.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';

/// Mock implementation of Conn for testing
class MockConn implements Conn {
  @override
  String get id => 'mock-conn';

  @override
  bool get isClosed => false;

  @override
  PeerId get localPeer => PeerId.fromString('local-peer');

  @override
  PeerId get remotePeer => PeerId.fromString('remote-peer');

  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnState get state => ConnState(
    streamMultiplexer: '/yamux/1.0.0',
    security: '/tls/1.0.0',
    transport: 'tcp',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  MultiAddr get localMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/0');

  @override
  MultiAddr get remoteMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/0');

  @override
  ConnStats get stat => MockConnStats();

  @override
  ConnScope get scope => MockConnScope();

  @override
  Future<void> close() async {}

  @override
  Future<P2PStream> newStream(dynamic context) async => throw UnimplementedError();

  @override
  Future<List<P2PStream>> get streams async => [];
}

class MockConnStats implements ConnStats {
  @override
  Stats get stats => Stats(
    direction: Direction.outbound,
    opened: DateTime.now(),
    limited: false,
  );

  @override
  int get numStreams => 0;
}

class MockConnScope implements ConnScope {
  @override
  Future<ResourceScopeSpan> beginSpan() async => MockResourceScopeSpan();

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat();
}

/// Mock implementation of StreamScope for testing
class MockStreamScope implements StreamScope {
  @override
  Future<ResourceScopeSpan> beginSpan() async => MockResourceScopeSpan();

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat();

  @override
  Future<void> setService(String service) async {}
}

/// Mock implementation of P2PStream for testing
class MockP2PStream implements P2PStream<Uint8List> {
  final String _id;
  bool _isClosed = false;
  String _protocol = '';

  MockP2PStream(this._id);

  @override
  String id() => _id;

  @override
  String protocol() => _protocol;

  @override
  Future<void> setProtocol(String protocol) async {
    _protocol = protocol;
  }

  @override
  MockConn get conn => MockConn();

  @override
  StreamManagementScope scope() => MockStreamManagementScope();

  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_isClosed) throw Exception('Stream closed');
    return Uint8List.fromList([1, 2, 3]);
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) throw Exception('Stream closed');
  }

  @override
  Future<void> close() async {
    _isClosed = true;
  }

  @override
  Future<void> closeRead() async {}

  @override
  Future<void> closeWrite() async {}

  @override
  Future<void> reset() async {
    _isClosed = true;
  }

  @override
  Future<void> setDeadline(DateTime? time) async {}

  @override
  Future<void> setReadDeadline(DateTime time) async {}

  @override
  Future<void> setWriteDeadline(DateTime time) async {}

  @override
  bool get isClosed => _isClosed;

  @override
  bool get isWritable => !_isClosed;

  @override
  StreamStats stat() => StreamStats(
    direction: Direction.outbound,
    opened: DateTime.now(),
    limited: false,
  );

  @override
  P2PStream<Uint8List> get incoming => this;
}

/// Mock implementation of StreamManagementScope for testing
class MockStreamManagementScope implements StreamManagementScope {
  bool _isDone = false;
  int _doneCallCount = 0;

  @override
  void done() {
    _doneCallCount++;
    if (_isDone) {
      print('WARN: BUG: done() called on already done scope (call count: $_doneCallCount)');
      return;
    }
    _isDone = true;
  }

  int get doneCallCount => _doneCallCount;
  bool get isDone => _isDone;

  @override
  Future<ResourceScopeSpan> beginSpan() async => MockResourceScopeSpan();

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat();

  @override
  Future<void> setService(String service) async {}

  @override
  Future<void> setProtocol(String protocol) async {}

  @override
  ProtocolScope? get protocolScope => null;

  @override
  ServiceScope? get serviceScope => null;

  @override
  PeerScope get peerScope => MockPeerScope();
}

class MockResourceScopeSpan implements ResourceScopeSpan {
  @override
  Future<ResourceScopeSpan> beginSpan() async => this;

  @override
  void done() {}

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat();
}

class MockPeerScope implements PeerScope {
  @override
  PeerId get peer => PeerId.fromString('test-peer');

  @override
  Future<ResourceScopeSpan> beginSpan() async => MockResourceScopeSpan();

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat();
}

/// Mock implementation of SwarmConn for testing
class MockSwarmConn implements SwarmConn {
  final List<SwarmStream> _removedStreams = [];

  @override
  Future<void> removeStream(SwarmStream stream) async {
    _removedStreams.add(stream);
  }

  List<SwarmStream> get removedStreams => _removedStreams;

  // Implement other required methods with minimal functionality
  @override
  String get id => 'mock-conn';

  @override
  bool get isClosed => false;

  @override
  PeerId get localPeer => PeerId.fromString('local-peer');

  @override
  PeerId get remotePeer => PeerId.fromString('remote-peer');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('SwarmStream Scope Cleanup Tests', () {
    test('should prevent double scope cleanup on close()', () async {
      // Arrange
      final mockScope = MockStreamManagementScope();
      final mockUnderlyingStream = MockP2PStream('test-stream-1');
      final mockConn = MockSwarmConn();

      final swarmStream = SwarmStream(
        id: 'test-stream-1',
        conn: mockConn,
        direction: Direction.outbound,
        opened: DateTime.now(),
        underlyingMuxedStream: mockUnderlyingStream,
        managementScope: mockScope,
      );

      // Act - call close() multiple times
      await swarmStream.close();
      await swarmStream.close(); // Second call should be safe
      await swarmStream.close(); // Third call should be safe

      // Assert
      expect(mockScope.doneCallCount, equals(1), 
        reason: 'done() should only be called once, even with multiple close() calls');
      expect(mockScope.isDone, isTrue);
      expect(swarmStream.isClosed, isTrue);
      expect(mockConn.removedStreams.length, equals(1), 
        reason: 'removeStream should only be called once');
    });

    test('should prevent double scope cleanup on reset()', () async {
      // Arrange
      final mockScope = MockStreamManagementScope();
      final mockUnderlyingStream = MockP2PStream('test-stream-2');
      final mockConn = MockSwarmConn();

      final swarmStream = SwarmStream(
        id: 'test-stream-2',
        conn: mockConn,
        direction: Direction.outbound,
        opened: DateTime.now(),
        underlyingMuxedStream: mockUnderlyingStream,
        managementScope: mockScope,
      );

      // Act - call reset() multiple times
      await swarmStream.reset();
      await swarmStream.reset(); // Second call should be safe
      await swarmStream.reset(); // Third call should be safe

      // Assert
      expect(mockScope.doneCallCount, equals(1), 
        reason: 'done() should only be called once, even with multiple reset() calls');
      expect(mockScope.isDone, isTrue);
      expect(swarmStream.isClosed, isTrue);
      expect(mockConn.removedStreams.length, equals(1), 
        reason: 'removeStream should only be called once');
    });

    test('should prevent double scope cleanup when mixing close() and reset()', () async {
      // Arrange
      final mockScope = MockStreamManagementScope();
      final mockUnderlyingStream = MockP2PStream('test-stream-3');
      final mockConn = MockSwarmConn();

      final swarmStream = SwarmStream(
        id: 'test-stream-3',
        conn: mockConn,
        direction: Direction.outbound,
        opened: DateTime.now(),
        underlyingMuxedStream: mockUnderlyingStream,
        managementScope: mockScope,
      );

      // Act - call close() then reset()
      await swarmStream.close();
      await swarmStream.reset(); // Should be safe since stream is already closed

      // Assert
      expect(mockScope.doneCallCount, equals(1), 
        reason: 'done() should only be called once, even when mixing close() and reset()');
      expect(mockScope.isDone, isTrue);
      expect(swarmStream.isClosed, isTrue);
      expect(mockConn.removedStreams.length, equals(1), 
        reason: 'removeStream should only be called once');
    });

    test('should correctly report stream availability for reuse', () async {
      // Arrange
      final mockScope = MockStreamManagementScope();
      final mockUnderlyingStream = MockP2PStream('test-stream-4');
      final mockConn = MockSwarmConn();

      final swarmStream = SwarmStream(
        id: 'test-stream-4',
        conn: mockConn,
        direction: Direction.outbound,
        opened: DateTime.now(),
        underlyingMuxedStream: mockUnderlyingStream,
        managementScope: mockScope,
      );

      // Assert initial state
      expect(swarmStream.isAvailableForReuse, isFalse, 
        reason: 'Active stream should not be available for reuse');

      // Act - close the stream
      await swarmStream.close();

      // Assert final state
      expect(swarmStream.isAvailableForReuse, isTrue, 
        reason: 'Closed stream with cleaned up scope should be available for reuse');
      expect(swarmStream.isClosed, isTrue);
      expect(mockScope.isDone, isTrue);
    });

    test('should allow external scope cleanup', () async {
      // Arrange
      final mockScope = MockStreamManagementScope();
      final mockUnderlyingStream = MockP2PStream('test-stream-5');
      final mockConn = MockSwarmConn();

      final swarmStream = SwarmStream(
        id: 'test-stream-5',
        conn: mockConn,
        direction: Direction.outbound,
        opened: DateTime.now(),
        underlyingMuxedStream: mockUnderlyingStream,
        managementScope: mockScope,
      );

      // Act - external cleanup
      final cleanupPerformed = swarmStream.cleanupScope();

      // Assert
      expect(cleanupPerformed, isTrue, 
        reason: 'First cleanup should return true');
      expect(mockScope.isDone, isTrue);
      expect(mockScope.doneCallCount, equals(1));

      // Act - second external cleanup
      final secondCleanupPerformed = swarmStream.cleanupScope();

      // Assert
      expect(secondCleanupPerformed, isFalse, 
        reason: 'Second cleanup should return false (already cleaned up)');
      expect(mockScope.doneCallCount, equals(1), 
        reason: 'done() should still only be called once');
    });
  });
}
