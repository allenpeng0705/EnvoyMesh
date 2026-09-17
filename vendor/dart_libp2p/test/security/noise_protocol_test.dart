import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:math';

import 'package:dart_libp2p/core/crypto/keys.dart' as libp2p_keys;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceScope;
// Import the abstract PeerId directly
// Import the concrete PeerId implementation
import 'package:dart_libp2p/core/peer/peer_id.dart' as concrete_peer_id;
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/crypto/key_generator.dart';
import 'package:dart_libp2p/p2p/security/secured_connection.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/security/security_protocol.dart';
import 'package:dart_libp2p/pb/noise/payload.pb.dart';
import '../mocks/noise_mock_connection.dart';
import 'package:dart_libp2p/p2p/security/noise/xx_pattern.dart';
import 'package:collection/collection.dart'; // For ListEquality

/// Simple adapter to make NoiseMockConnection compatible with TransportConn
class NoiseTransportAdapter implements TransportConn {
  final NoiseMockConnection _conn;

  NoiseTransportAdapter(this._conn);

  @override
  Future<void> close() => _conn.close();

  @override
  bool get isClosed => _conn.isClosed;

  @override
  String get id => _conn.id;

  @override
  Future<P2PStream> newStream(Context context) => _conn.newStream(context);

  @override
  Future<List<P2PStream>> get streams => _conn.streams;

  @override
  PeerId get localPeer => _conn.localPeer; // Use direct PeerId type

  @override
  PeerId get remotePeer => _conn.remotePeer; // Use direct PeerId type

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey => _conn.remotePublicKey;

  @override
  ConnState get state => _conn.state;

  @override
  ConnStats get stat => _conn.stat;

  @override
  ConnScope get scope => _conn.scope;

  @override
  MultiAddr get localMultiaddr => _conn.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => _conn.remoteMultiaddr;

  // Deprecated methods
  @override
  MultiAddr get localAddr => _conn.localAddr;

  @override
  MultiAddr get remoteAddr => _conn.remoteAddr;

  // TransportConn specific methods
  @override
  Future<Uint8List> read([int? length]) => _conn.read(length);

  @override
  Future<void> write(Uint8List data) => _conn.write(data);

  @override
  Socket get socket => _conn.socket;

  @override
  void setReadTimeout(Duration timeout) => _conn.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _conn.setWriteTimeout(timeout);

  @override
  void notifyActivity() {
    // If _conn implements notifyActivity, call it.
    // Otherwise, this mock might not need to do anything specific for activity.
    // For now, assuming _conn might be a TransportConn itself.
    if (_conn is TransportConn) {
      (_conn as TransportConn).notifyActivity();
    }
  }
}

/// Adapter to make _TrackedConnection compatible with TransportConn
class TrackedTransportAdapter implements TransportConn {
  final _TrackedConnection _conn;

  TrackedTransportAdapter(this._conn);

  // Access to the tracked reads for testing
  List<int> get reads => _conn.reads;

  @override
  Future<void> close() => _conn.close();

  @override
  bool get isClosed => _conn.isClosed;

  @override
  String get id => _conn._inner.id;

  @override
  Future<P2PStream> newStream(Context context) =>
      _conn._inner.newStream(context);

  @override
  Future<List<P2PStream>> get streams => _conn._inner.streams;

  @override
  PeerId get localPeer => _conn._inner.localPeer; // Use direct PeerId type

  @override
  PeerId get remotePeer => _conn._inner.remotePeer; // Use direct PeerId type

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey => _conn._inner.remotePublicKey;

  @override
  ConnState get state => _conn._inner.state;

  @override
  ConnStats get stat => _conn._inner.stat;

  @override
  ConnScope get scope => _conn._inner.scope;

  @override
  MultiAddr get localMultiaddr => _conn._inner.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => _conn._inner.remoteMultiaddr;

  // Deprecated methods
  @override
  MultiAddr get localAddr => _conn.localAddr;

  @override
  MultiAddr get remoteAddr => _conn.remoteAddr;

  // TransportConn specific methods
  @override
  Future<Uint8List> read([int? length]) => _conn.read(length);

  @override
  Future<void> write(Uint8List data) => _conn.write(data);

  @override
  Socket get socket => _conn.socket;

  @override
  void setReadTimeout(Duration timeout) => _conn.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _conn.setWriteTimeout(timeout);

  @override
  void notifyActivity() {
    // If _conn implements notifyActivity, call it.
    // Otherwise, this mock might not need to do anything specific for activity.
    if (_conn is TransportConn) {
      (_conn as TransportConn).notifyActivity();
    }
  }
}

class MockConnection implements TransportConn {
  final String id;
  bool _closed = false;

  // Stream controllers for bidirectional communication
  final _incomingData = StreamController<List<int>>.broadcast();
  final _outgoingData = StreamController<List<int>>.broadcast();

  // Single continuous buffer for incoming data (TCP-like)
  final _buffer = <int>[];

  // Stream subscriptions for cleanup
  StreamSubscription<List<int>>? _subscription;

  // For test verification only
  final writes = <Uint8List>[];

  // Callback for connection closure
  void Function()? onClose;

  MockConnection(this.id);

  /// Creates a pair of connected mock connections
  static (MockConnection, MockConnection) createPair() {
    final conn1 = MockConnection('conn1');
    final conn2 = MockConnection('conn2');

    // Wire up the connections to simulate TCP streaming
    conn1._subscription = conn2._outgoingData.stream.listen((data) {
      print('${conn1.id} received data: ${data.length} bytes');
      if (!conn1._closed) {
        conn1._buffer.addAll(data);  // Add to continuous buffer
        conn1._incomingData.add(data);
        print('${conn1.id} buffered data, total buffer size: ${conn1._buffer.length}');
      }
    });

    conn2._subscription = conn1._outgoingData.stream.listen((data) {
      print('${conn2.id} received data: ${data.length} bytes');
      if (!conn2._closed) {
        conn2._buffer.addAll(data);  // Add to continuous buffer
        conn2._incomingData.add(data);
        print('${conn2.id} buffered data, total buffer size: ${conn2._buffer.length}');
      }
    });

    return (conn1, conn2);
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    print('$id closing connection');
    _closed = true;

    // Ensure all buffered data is processed before closing
    if (_buffer.isNotEmpty) {
      print('$id has ${_buffer.length} bytes in buffer during close');
      _incomingData.add(_buffer);
    }

    await _subscription?.cancel();
    await _incomingData.close();
    await _outgoingData.close();
    _buffer.clear();
    onClose?.call();  // Call the closure callback if set
    print('$id connection closed');
  }

  @override
  Future<Uint8List> read([int? length]) async {
    if (_closed) throw StateError('Connection is closed');
    print('$id reading' + (length != null ? ' $length bytes' : ''));

    try {
      // If no length specified, return whatever is in buffer or wait for more data
      if (length == null) {
        if (_buffer.isEmpty) {
          final data = await _incomingData.stream.first.timeout(
            Duration(seconds: 30),  // Increased timeout for handshake
            onTimeout: () => throw TimeoutException('Read timed out'),
          );
          print('$id read ${data.length} bytes from stream (no length specified)');
          return Uint8List.fromList(data);
        }
        final result = Uint8List.fromList(_buffer);
        _buffer.clear();
        print('$id returning ${result.length} bytes from buffer (no length specified)');
        return result;
      }

      // If we already have enough data in the buffer, return it immediately
      if (_buffer.length >= length) {
        final result = Uint8List.fromList(_buffer.take(length).toList());
        _buffer.removeRange(0, length);
        print('$id returning ${result.length} bytes from buffer, ${_buffer.length} bytes remaining');
        return result;
      }

      // Wait until we have enough data
      while (_buffer.length < length) {
        print('$id buffer has ${_buffer.length} bytes, waiting for more data to reach $length bytes');
        final data = await _incomingData.stream.first.timeout(
          Duration(seconds: 30),  // Increased timeout for handshake
          onTimeout: () => throw TimeoutException('Read timed out waiting for more data'),
        );
        print('$id received ${data.length} additional bytes');
        _buffer.addAll(data);
      }

      // Return exactly the requested number of bytes
      final result = Uint8List.fromList(_buffer.take(length).toList());
      _buffer.removeRange(0, length);
      print('$id returning ${result.length} bytes, ${_buffer.length} bytes remaining in buffer');
      return result;
    } catch (e) {
      print('$id error during read: $e');
      rethrow;
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_closed) throw StateError('Connection is closed');
    print('$id writing ${data.length} bytes');

    writes.add(data);  // For test verification only
    _outgoingData.add(data);
    print('$id wrote ${data.length} bytes to outgoing stream');
  }

  @override
  bool get isClosed => _closed;

  @override
  MultiAddr get localAddr => MultiAddr('/ip4/127.0.0.1/tcp/1234');

  @override
  MultiAddr get remoteAddr => MultiAddr('/ip4/127.0.0.1/tcp/5678');

  @override
  MultiAddr get localMultiaddr => localAddr;

  @override
  MultiAddr get remoteMultiaddr => remoteAddr;

  @override
  Socket get socket => throw UnimplementedError();

  @override
  void setReadTimeout(Duration timeout) {}

  @override
  void setWriteTimeout(Duration timeout) {}

  // Additional methods required by Conn interface
  @override
  Future<P2PStream> newStream(Context context) {
    throw UnimplementedError('Stream multiplexing not implemented in mock connection');
  }

  @override
  Future<List<P2PStream>> get streams async => [];

  @override
  PeerId get localPeer => throw UnimplementedError('localPeer not implemented in mock connection'); // Use direct PeerId type

  @override
  PeerId get remotePeer => throw UnimplementedError('remotePeer not implemented in mock connection'); // Use direct PeerId type

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey async => null;

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
  void notifyActivity() {}
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
  ScopeStat get stat => const ScopeStat(); // Renamed scopeStat to stat
}

/// Mock implementation of ResourceScopeSpan
class _MockResourceScopeSpan implements ResourceScopeSpan { // Implements ResourceScopeSpan from rcmgr
  @override
  Future<ResourceScopeSpan> beginSpan() async { // Returns ResourceScopeSpan from rcmgr
    return this;
  }

  @override
  void done() {}

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat(); // Renamed scopeStat to stat. ScopeStat from rcmgr
}

/// A connection wrapper that monitors reads
class _MonitoredConnection implements TransportConn {
  final TransportConn _inner;
  final void Function(int readNum, int? length, Uint8List result) onRead;
  int _readCount = 0;

  _MonitoredConnection(this._inner, {required this.onRead});

  @override
  Future<Uint8List> read([int? length]) async {
    _readCount++;
    final result = await _inner.read(length);
    onRead(_readCount, length, result);
    return result;
  }

  @override
  Future<void> write(Uint8List data) => _inner.write(data);

  @override
  Future<void> close() => _inner.close();

  @override
  bool get isClosed => _inner.isClosed;

  // Deprecated methods
  @override
  MultiAddr get localAddr => _inner.localMultiaddr;

  @override
  MultiAddr get remoteAddr => _inner.remoteMultiaddr;

  @override
  MultiAddr get localMultiaddr => _inner.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => _inner.remoteMultiaddr;

  @override
  Socket get socket => _inner.socket;

  @override
  void setReadTimeout(Duration timeout) => _inner.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _inner.setWriteTimeout(timeout);

  @override
  String get id => _inner.id;

  @override
  Future<P2PStream> newStream(Context context) => _inner.newStream(context);

  @override
  Future<List<P2PStream>> get streams => _inner.streams;

  @override
  PeerId get localPeer => _inner.localPeer; // Use direct PeerId type

  @override
  PeerId get remotePeer => _inner.remotePeer; // Use direct PeerId type

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey => _inner.remotePublicKey;

  @override
  ConnState get state => _inner.state;

  @override
  ConnStats get stat => _inner.stat;

  @override
  ConnScope get scope => _inner.scope;

  @override
  void notifyActivity() {
    _inner.notifyActivity();
  }
}

/// A connection wrapper that tracks reads
class _TrackedConnection implements TransportConn {
  final TransportConn _inner;
  final reads = <int>[];

  _TrackedConnection(this._inner);

  @override
  Future<Uint8List> read([int? length]) async {
    final result = await _inner.read(length);
    reads.add(result.length);
    return result;
  }

  @override
  Future<void> write(Uint8List data) => _inner.write(data);

  @override
  Future<void> close() => _inner.close();

  @override
  bool get isClosed => _inner.isClosed;

  // Deprecated methods
  MultiAddr get localAddr => _inner.localMultiaddr;

  MultiAddr get remoteAddr => _inner.remoteMultiaddr;

  MultiAddr get localMultiaddr => _inner.localMultiaddr;

  MultiAddr get remoteMultiaddr => _inner.remoteMultiaddr;

  @override
  Socket get socket => _inner.socket;

  @override
  void setReadTimeout(Duration timeout) => _inner.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _inner.setWriteTimeout(timeout);

  @override
  String get id => _inner.id;

  @override
  Future<P2PStream> newStream(Context context) => _inner.newStream(context);

  @override
  Future<List<P2PStream>> get streams => _inner.streams;

  @override
  PeerId get localPeer => _inner.localPeer; // Use direct PeerId type

  @override
  PeerId get remotePeer => _inner.remotePeer; // Use direct PeerId type

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey => _inner.remotePublicKey;

  @override
  ConnState get state => _inner.state;

  @override
  ConnStats get stat => _inner.stat;

  @override
  ConnScope get scope => _inner.scope;

  @override
  void notifyActivity() {
    _inner.notifyActivity();
  }
}

void main() {
  group('NoiseXXProtocol', () {
    late KeyPair identityKey;
    late NoiseSecurity protocol;

    setUp(() async {
      identityKey = await generateEd25519KeyPair();
      protocol = await NoiseSecurity.create(identityKey);
    });

    tearDown(() async {
      await protocol.dispose();
    });

    test('verifies identity key type', () async {
      //Noise needs an Ed25519 keypair. Let's see if it detects the wrong type
      KeyPair wrongKey = await generateRSAKeyPair() ;

      try {
        await NoiseSecurity.create(wrongKey);
        fail('Should have thrown NoiseProtocolException');
      } catch (e) {
        expect(e, isA<NoiseProtocolException>());
        expect((e as NoiseProtocolException).message, contains('Ed25519 compatible'));
      }
    });

    test('handles disposal correctly', () async {
      final conn = NoiseMockConnection('test');
      final transportConn = NoiseTransportAdapter(conn);

      expect(protocol.protocolId, equals('/noise'));

      await protocol.dispose();

      await expectLater(
        () => protocol.secureOutbound(transportConn),
        throwsA(isA<NoiseProtocolException>()
          .having((e) => e.message, 'message', contains('disposed'))),
      );

      await expectLater(
        () => protocol.secureInbound(transportConn),
        throwsA(isA<NoiseProtocolException>()
          .having((e) => e.message, 'message', contains('disposed'))),
      );
    });

    test('cleans up connection on error', () async {
      final conn = NoiseMockConnection('test');
      final transportConn = NoiseTransportAdapter(conn);
      await conn.close();

      await expectLater(
        () => protocol.secureOutbound(transportConn),
        throwsA(isA<NoiseProtocolException>()),
      );

      expect(conn.isClosed, isTrue, reason: 'Connection should be closed after error');
    });

    test('provides correct protocol identifier', () {
      expect(protocol.protocolId, equals('/noise'));
    });

    test('successfully performs handshake and exchanges messages', () async {
      final (conn1, conn2) = NoiseMockConnection.createPair(
        id1: 'initiator',
        id2: 'responder',
      );

      // Create transport adapters
      final transportConn1 = NoiseTransportAdapter(conn1);
      final transportConn2 = NoiseTransportAdapter(conn2);

      // Add tracking to monitor message sizes
      final trackedConn2 = _TrackedConnection(transportConn2);

      // We don't need TrackedTransportAdapter anymore since _TrackedConnection now implements TransportConn

      final protocol1 = await NoiseSecurity.create(identityKey);
      final protocol2 = await NoiseSecurity.create(identityKey);

      try {
        // Perform handshake
        final [secured1, secured2] = await Future.wait<SecuredConnection>([
          protocol1.secureOutbound(transportConn1),
          protocol2.secureInbound(trackedConn2),
        ], eagerError: true);

        print('\nMessage sizes during handshake:');
        print('Responder reads: ${trackedConn2.reads}');
        print('Initiator writes: ${conn1.writes.map((w) => w.length)}');

        // Test message exchange
        final testMessage = Uint8List.fromList([1, 2, 3, 4, 5]);
        await secured1.write(testMessage);
        final received = await secured2.read();
        expect(received, equals(testMessage), reason: 'Received message should match sent message');

        // Test large message exchange
        final random = Random.secure();
        final largeMessage = Uint8List.fromList(List.generate(4096, (_) => random.nextInt(256)));
        await secured1.write(largeMessage);
        final receivedLarge = await secured2.read();
        expect(receivedLarge, equals(largeMessage), reason: 'Large message should be received correctly');

        await secured1.close();
        await secured2.close();
      } finally {
        await protocol1.dispose();
        await protocol2.dispose();
      }
    });

    test('handles concurrent handshakes correctly', () async {
      final pairs = List.generate(3, (i) => NoiseMockConnection.createPair(
        id1: 'initiator$i',
        id2: 'responder$i',
      ));

      final protocols = await Future.wait(
        List.generate(6, (_) => NoiseSecurity.create(identityKey))
      );

      try {
        // Start multiple handshakes concurrently
        final futures = List<Future<SecuredConnection>>.empty(growable: true);
        for (var i = 0; i < pairs.length; i++) {
          final (conn1, conn2) = pairs[i];
          // Create transport adapters
          final transportConn1 = NoiseTransportAdapter(conn1);
          final transportConn2 = NoiseTransportAdapter(conn2);
          futures.add(protocols[i*2].secureOutbound(transportConn1));
          futures.add(protocols[i*2+1].secureInbound(transportConn2));
        }

        final connections = await Future.wait(futures, eagerError: true);

        // Clean up
        await Future.wait(connections.map((conn) => conn.close()));
      } finally {
        await Future.wait(protocols.map((p) => p.dispose()));
      }
    });

    test('correctly encrypts/decrypts specific Yamux SYN frame after initial nonce usage', () async {
      final (connInitiator, connResponder) = NoiseMockConnection.createPair(
        id1: 'initiator-yamux-test',
        id2: 'responder-yamux-test',
      );
      final transportConnInitiator = NoiseTransportAdapter(connInitiator);
      final transportConnResponder = NoiseTransportAdapter(connResponder);

      final noiseInitiator = await NoiseSecurity.create(identityKey); // Use the setUp identityKey
      final responderIdentityKey = await generateEd25519KeyPair(); // Different key for responder
      final noiseResponder = await NoiseSecurity.create(responderIdentityKey);
      // Use the concrete PeerId class for instantiation
      final responderPeerId = await concrete_peer_id.PeerId.fromPublicKey(responderIdentityKey.publicKey);
      final initiatorPeerId = await concrete_peer_id.PeerId.fromPublicKey(identityKey.publicKey);


      SecuredConnection securedInitiator;
      SecuredConnection securedResponder;

      try {
        // Perform handshake
        // Pass remotePeerId to secureOutbound and localPeerId to secureInbound for full context
        // Use the adapters transportConnInitiator and transportConnResponder
        final handshakeResult = await Future.wait<SecuredConnection>([
          noiseInitiator.secureOutbound(transportConnInitiator),
          noiseResponder.secureInbound(transportConnResponder),
        ], eagerError: true);
        securedInitiator = handshakeResult[0];
        securedResponder = handshakeResult[1];

        // Simulate some initial messages to advance nonces
        // Initiator sends 2 messages, Responder reads them.
        // Responder sends 2 messages, Initiator reads them.
        // This should increment send/recv nonces on both sides past 0 and 1.
        final dummyMsg1 = Uint8List.fromList([10, 20, 30]); // Represents e.g. multistream select for identify
        final dummyMsg2 = Uint8List.fromList([40, 50, 60]); // Represents e.g. multistream select for yamux

        // Exchange 1: Initiator -> Responder
        print('Test: Initiator sending dummyMsg1');
        await securedInitiator.write(dummyMsg1);
        print('Test: Responder reading dummyMsg1');
        await securedResponder.read(); 

        // Exchange 2: Responder -> Initiator
        print('Test: Responder sending dummyMsg1');
        await securedResponder.write(dummyMsg1); 
        print('Test: Initiator reading dummyMsg1');
        await securedInitiator.read();          

        // Exchange 3: Initiator -> Responder
        print('Test: Initiator sending dummyMsg2');
        await securedInitiator.write(dummyMsg2);
        print('Test: Responder reading dummyMsg2');
        await securedResponder.read(); 

        // Exchange 4: Responder -> Initiator
        print('Test: Responder sending dummyMsg2');
        await securedResponder.write(dummyMsg2); 
        print('Test: Initiator reading dummyMsg2');
        await securedInitiator.read();          

        // After these 4 exchanges (2 in each direction), 
        // initiator's sendNonce for the next write should be 2.
        // responder's recvNonce for the next read should be 2.

        final yamuxSynFrame = Uint8List.fromList([0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]); // Flag SYN (0x01)
        final expectedCorruptedFrame = Uint8List.fromList([0, 2, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0]); // Flag SYN|ACK (0x03)

        print('Test: Initiator (expecting sendNonce 2) writing Yamux SYN: $yamuxSynFrame');
        await securedInitiator.write(yamuxSynFrame);

        print('Test: Responder (expecting recvNonce 2) reading Yamux SYN...');
        final receivedFrame = await securedResponder.read();
        print('Test: Responder received Yamux SYN: $receivedFrame');

        expect(receivedFrame, orderedEquals(yamuxSynFrame),
            reason: 'Yamux SYN frame should be received uncorrupted. '
                    'If it is ${expectedCorruptedFrame}, the corruption bug is present.');
        
        // Additional check to be very explicit if the primary one fails.
        if (!ListEquality().equals(receivedFrame, yamuxSynFrame)) {
            print('Test: Frame was corrupted!');
            if (ListEquality().equals(receivedFrame, expectedCorruptedFrame)) {
                print('Test: Corruption matches known pattern (SYN -> SYN|ACK).');
            } else {
                print('Test: Corruption does NOT match known SYN -> SYN|ACK pattern. Different corruption.');
            }
        }


        await securedInitiator.close();
        await securedResponder.close();
      } finally {
        await noiseInitiator.dispose();
        await noiseResponder.dispose();
        // Ensure mock connections are closed if not already by SecuredConnection
        if (!connInitiator.isClosed) await connInitiator.close();
        if (!connResponder.isClosed) await connResponder.close();
      }
    });
  });
}
