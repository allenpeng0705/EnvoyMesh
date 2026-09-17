import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'dart:io'; // For Socket in P2PStreamToTransportConnAdapter

import 'package:dart_libp2p/core/interfaces.dart';
import 'package:dart_libp2p/p2p/security/secured_connection.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart'; // ProtocolID, HandlerFunc
import 'package:dart_libp2p/p2p/multiaddr/codec.dart'; // For varint encoding
import 'package:dart_libp2p/core/network/conn.dart'; // Conn, ConnStats, Stats, ConnState
import 'package:dart_libp2p/core/network/common.dart'; // Direction
import 'package:dart_libp2p/core/network/rcmgr.dart' show StreamScope, ConnScope, NullScope, ScopeStat, ResourceScopeSpan; // Using NullScope for mocks
import 'package:dart_libp2p/core/peer/peer_id.dart' as core_peer; // PeerId, PeerId
import 'package:dart_libp2p/core/multiaddr.dart'; // Multiaddr
import 'package:dart_libp2p/core/crypto/keys.dart' as libp2p_keys; // PublicKey, KeyPair
import 'package:dart_libp2p/p2p/crypto/key_generator.dart'; // generateEd25519KeyPair
import 'package:dart_libp2p/core/network/context.dart'; // Context
import 'package:dart_libp2p/core/network/transport_conn.dart'; // TransportConn
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart'; // NoiseSecurity, NoiseProtocolException
import 'package:dart_libp2p/p2p/security/security_protocol.dart'; // SecuredConnection

// --- Mock Dependencies (adapted from multistream_muxer_test.dart) ---

class MockConnStats implements ConnStats {
  @override
  final Stats stats;
  @override
  final int numStreams;

  MockConnStats({Stats? stats, this.numStreams = 0})
      : stats = stats ?? Stats(direction: Direction.inbound, opened: DateTime.now());
}

class MockConn implements Conn {
  final String _id = 'mock-conn-${Random().nextInt(1 << 32)}';
  final core_peer.PeerId _localPeer;
  final core_peer.PeerId _remotePeer;
  final MultiAddr _localMultiaddr;
  final MultiAddr _remoteMultiaddr;

  MockConn({
    required core_peer.PeerId localPeer,
    required core_peer.PeerId remotePeer,
    required MultiAddr localMultiaddr,
    required MultiAddr remoteMultiaddr,
  })  : _localPeer = localPeer,
        _remotePeer = remotePeer,
        _localMultiaddr = localMultiaddr,
        _remoteMultiaddr = remoteMultiaddr;


  @override
  String get id => _id;

  @override
  core_peer.PeerId get localPeer => _localPeer;

  @override
  MultiAddr get localMultiaddr => _localMultiaddr;

  @override
  core_peer.PeerId get remotePeer => _remotePeer;

  @override
  MultiAddr get remoteMultiaddr => _remoteMultiaddr;

  @override
  Future<P2PStream<dynamic>> newStream(Context context) async {
    throw UnimplementedError('MockConn.newStream not implemented');
  }

  @override
  Future<List<P2PStream<dynamic>>> get streams async => [];

  @override
  ConnStats get stat => MockConnStats();

  @override
  Future<void> close() async {}

  @override
  bool get isClosed => false;

  @override
  ConnScope get scope => NullScope();

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey async => null; // Key not known/verified at this unsecured stage

  @override
  ConnState get state => const ConnState(
        streamMultiplexer: '',
        security: '',
        transport: 'mock',
        usedEarlyMuxerNegotiation: false,
      );
}

class MockStreamStats implements StreamStats {
  @override
  Direction get direction => Direction.inbound;
  @override
  DateTime get opened => DateTime.now();
  @override
  bool get limited => false;
  @override
  Map get extra => {};
}

class MockP2PStream implements P2PStream<Uint8List> {
  final String _id_internal = 'mock-stream-${Random().nextInt(1 << 32)}';
  final StreamController<Uint8List> _incomingDataController = StreamController<Uint8List>.broadcast();
  final StreamController<Uint8List> _outgoingDataController;

  final BytesBuilder _readBuffer = BytesBuilder();
  final Completer<void> _localCloseCompleter = Completer<void>();
  final Completer<void> _remoteCloseCompleter = Completer<void>();
  StreamSubscription? _incomingSubscription;
  String _protocol_internal = '';
  Completer<void>? _pendingReadCompleter;
  final Conn _mockConn;

  MockP2PStream(this._outgoingDataController, Stream<Uint8List> incomingStream, this._mockConn) {
    _incomingSubscription = incomingStream.listen(
      (data) {
        _readBuffer.add(data);
        if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
          _pendingReadCompleter!.complete();
          _pendingReadCompleter = null;
        }
      },
      onDone: () {
        if (!_remoteCloseCompleter.isCompleted) _remoteCloseCompleter.complete();
        if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
          if (_readBuffer.isEmpty) {
            _pendingReadCompleter!.completeError(StateError("Stream closed by remote while awaiting read"));
          } else {
            _pendingReadCompleter!.complete();
          }
          _pendingReadCompleter = null;
        }
      },
      onError: (e, s) {
        if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
          _pendingReadCompleter!.completeError(e, s);
          _pendingReadCompleter = null;
        }
        if (!_remoteCloseCompleter.isCompleted) _remoteCloseCompleter.complete();
      },
    );
  }

  @override
  Future<Uint8List> read([int? count]) async {
    if (_readBuffer.isNotEmpty) {
      final available = _readBuffer.length;
      final bytesToRead = (count != null && count < available && count > 0) ? count : available;
      if (bytesToRead > 0) {
        final result = Uint8List.fromList(_readBuffer.toBytes().sublist(0, bytesToRead));
        final remainingBytes = Uint8List.fromList(_readBuffer.toBytes().sublist(bytesToRead));
        _readBuffer.clear();
        _readBuffer.add(remainingBytes);
        return result;
      }
    }
    if (_remoteCloseCompleter.isCompleted || (_localCloseCompleter.isCompleted && _readBuffer.isEmpty)) {
      return Uint8List(0); // EOF
    }
    _pendingReadCompleter ??= Completer<void>();
    await _pendingReadCompleter!.future;
    return read(count);
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_localCloseCompleter.isCompleted) throw StateError('Cannot write to locally closed stream');
    if (_outgoingDataController.isClosed) throw StateError('Cannot write to closed outgoing controller');
    _outgoingDataController.add(data);
  }

  @override
  Future<void> close() async {
    if (!_localCloseCompleter.isCompleted) _localCloseCompleter.complete();
    if (!_remoteCloseCompleter.isCompleted) _remoteCloseCompleter.complete();
    await _incomingSubscription?.cancel();
    _incomingSubscription = null;
    if (!_outgoingDataController.isClosed) await _outgoingDataController.close();
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      if (_readBuffer.isEmpty) _pendingReadCompleter!.completeError(StateError("Stream closed"));
      else _pendingReadCompleter!.complete();
      _pendingReadCompleter = null;
    }
  }

  @override
  Future<void> closeWrite() async {
    if (!_outgoingDataController.isClosed) await _outgoingDataController.close();
  }
  
  @override
  Future<void> closeRead() async {
    if (!_remoteCloseCompleter.isCompleted) _remoteCloseCompleter.complete();
    await _incomingSubscription?.cancel();
    _incomingSubscription = null;
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted && _readBuffer.isEmpty) {
      _pendingReadCompleter!.completeError(StateError("Stream closed for reading"));
      _pendingReadCompleter = null;
    }
  }

  @override
  Future<void> reset() async {
    final err = StateError("Stream reset");
    if (!_localCloseCompleter.isCompleted) _localCloseCompleter.complete();
    if (!_remoteCloseCompleter.isCompleted) _remoteCloseCompleter.complete();
    await _incomingSubscription?.cancel();
    _incomingSubscription = null;
    _readBuffer.clear();
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      _pendingReadCompleter!.completeError(StateError("Stream reset"));
      _pendingReadCompleter = null;
    }
    if (!_outgoingDataController.isClosed) {
      _outgoingDataController.addError(err);
      await _outgoingDataController.close();
    }
  }

  @override
  String id() => _id_internal;
  @override
  String protocol() => _protocol_internal;
  @override
  Future<void> setProtocol(String protocol) async { _protocol_internal = protocol; }
  @override
  StreamStats stat() => MockStreamStats();
  @override
  StreamManagementScope scope() => NullScope();
  @override
  P2PStream<Uint8List> get incoming => this;
  @override
  Future<void> get done async {
    await Future.wait([
      _localCloseCompleter.future.catchError((_){}), 
      _remoteCloseCompleter.future.catchError((_){})
    ]);
  }
  @override
  Future<void> setDeadline(DateTime? time) async {}
  @override
  Future<void> setReadDeadline(DateTime time) async {}
  @override
  Future<void> setWriteDeadline(DateTime time) async {}
  @override
  bool get isClosed => _localCloseCompleter.isCompleted && _remoteCloseCompleter.isCompleted;

  @override
  bool get isWritable => !_localCloseCompleter.isCompleted;

  @override
  Conn get conn => _mockConn;
}

(MockP2PStream, MockP2PStream) newPipe(Conn connA, Conn connB) {
  final controllerAtoB = StreamController<Uint8List>();
  final controllerBtoA = StreamController<Uint8List>();
  final streamA = MockP2PStream(controllerAtoB, controllerBtoA.stream, connA);
  final streamB = MockP2PStream(controllerBtoA, controllerAtoB.stream, connB);
  return (streamA, streamB);
}

// --- P2PStream to TransportConn Adapter ---
class P2PStreamToTransportConnAdapter implements TransportConn {
  final P2PStream<Uint8List> _p2pStream;
  final core_peer.PeerId _localPeer;
  final core_peer.PeerId _remotePeer;
  final MultiAddr _localMultiaddr;
  final MultiAddr _remoteMultiaddr;
  final String _id;

  P2PStreamToTransportConnAdapter(
    this._p2pStream, {
    required core_peer.PeerId localPeer,
    required core_peer.PeerId remotePeer,
    required MultiAddr localMultiaddr,
    required MultiAddr remoteMultiaddr,
  })  : _localPeer = localPeer,
        _remotePeer = remotePeer,
        _localMultiaddr = localMultiaddr,
        _remoteMultiaddr = remoteMultiaddr,
        _id = 'adapter-conn-${Random().nextInt(1 << 32)}';

  @override
  Future<Uint8List> read([int? length]) => _p2pStream.read(length);

  @override
  Future<void> write(Uint8List data) => _p2pStream.write(data);

  @override
  Future<void> close() => _p2pStream.close();

  @override
  bool get isClosed => _p2pStream.isClosed;

  @override
  String get id => _id;

  @override
  core_peer.PeerId get localPeer => _localPeer;

  @override
  MultiAddr get localMultiaddr => _localMultiaddr;

  @override
  core_peer.PeerId get remotePeer => _remotePeer;

  @override
  MultiAddr get remoteMultiaddr => _remoteMultiaddr;
  
  // Deprecated Conn methods
  @override
  MultiAddr get localAddr => localMultiaddr;

  @override
  MultiAddr get remoteAddr => remoteMultiaddr;

  @override
  Future<libp2p_keys.PublicKey?> get remotePublicKey async => _p2pStream.conn.remotePublicKey;

  @override
  ConnState get state => ConnState(
        streamMultiplexer: '', // Not applicable at this layer post-muxing
        security: '', // This will be filled by NoiseSecurity
        transport: 'p2pstream-adapter',
        usedEarlyMuxerNegotiation: false,
      );

  @override
  ConnStats get stat => MockConnStats(); // Use the same mock stats

  @override
  ConnScope get scope => NullScope();

  // TransportConn specific (less relevant for P2PStream post-muxing)
  @override
  Socket get socket => throw UnimplementedError('Socket not available on P2PStream adapter');

  @override
  void setReadTimeout(Duration timeout) { /* No-op, P2PStream deadlines are different */ }

  @override
  void setWriteTimeout(Duration timeout) { /* No-op, P2PStream deadlines are different */ }

  // Conn methods not directly applicable or needing mock implementation
  @override
  Future<P2PStream<dynamic>> newStream(Context context) {
    throw UnimplementedError('newStream not applicable on an already established P2PStream adapter');
  }

  @override
  Future<List<P2PStream<dynamic>>> get streams async => [_p2pStream]; // The stream itself

  @override
  void notifyActivity() {}
}


// --- Test Suite ---
void main() {
  group('MultistreamMuxer with Noise Handshake', () {
    late MultistreamMuxer clientMuxer;
    late MultistreamMuxer serverMuxer;
    late MockP2PStream clientUnsecuredStream; // Stream A
    late MockP2PStream serverUnsecuredStream; // Stream B

    late libp2p_keys.KeyPair clientIdentityKey;
    late core_peer.PeerId clientPeerId;
    late NoiseSecurity clientNoiseSec;

    late libp2p_keys.KeyPair serverIdentityKey;
    late core_peer.PeerId serverPeerId;
    late NoiseSecurity serverNoiseSec;

    late MultiAddr clientMa;
    late MultiAddr serverMa;

    late MockConn mockConnClient;
    late MockConn mockConnServer;


    setUp(() async {
      clientMuxer = MultistreamMuxer();
      serverMuxer = MultistreamMuxer();

      clientIdentityKey = await generateEd25519KeyPair();
      clientPeerId = await core_peer.PeerId.fromPublicKey(clientIdentityKey.publicKey);
      clientNoiseSec = await NoiseSecurity.create(clientIdentityKey);

      serverIdentityKey = await generateEd25519KeyPair();
      serverPeerId = await core_peer.PeerId.fromPublicKey(serverIdentityKey.publicKey);
      serverNoiseSec = await NoiseSecurity.create(serverIdentityKey);

      clientMa = MultiAddr('/ip4/127.0.0.1/tcp/10001');
      serverMa = MultiAddr('/ip4/127.0.0.1/tcp/10002');

      // MockConns for the MockP2PStreams
      // Client's perspective: local is client, remote is server
      mockConnClient = MockConn(
        localPeer: clientPeerId, 
        remotePeer: serverPeerId, 
        localMultiaddr: clientMa, 
        remoteMultiaddr: serverMa
      );
      // Server's perspective: local is server, remote is client
      mockConnServer = MockConn(
        localPeer: serverPeerId, 
        remotePeer: clientPeerId, 
        localMultiaddr: serverMa, 
        remoteMultiaddr: clientMa
      );

      final pipes = newPipe(mockConnClient, mockConnServer);
      clientUnsecuredStream = pipes.$1;
      serverUnsecuredStream = pipes.$2;
    });

    tearDown(() async {
      await clientUnsecuredStream.close().catchError((_) {});
      await serverUnsecuredStream.close().catchError((_) {});
      // NoiseSecurity instances might have internal resources to dispose if added later
      // For now, they don't have an explicit dispose method in the provided API.
    });

    test('selectOneOf successfully negotiates Noise protocol and performs handshake', () async {
      final serverHandshakeCompleter = Completer<SecuredConnection>();

      // Server: Set up handler for Noise protocol
      serverMuxer.addHandler(serverNoiseSec.protocolId, (protocol, p2pStreamFromServer) async {
        try {
          final adapterFromServer = P2PStreamToTransportConnAdapter(
            p2pStreamFromServer as P2PStream<Uint8List>, // Cast needed
            localPeer: serverPeerId,
            remotePeer: clientPeerId,
            localMultiaddr: serverMa,
            remoteMultiaddr: clientMa,
          );
          final serverSecuredConn = await serverNoiseSec.secureInbound(adapterFromServer);
          serverHandshakeCompleter.complete(serverSecuredConn);
        } catch (e, s) {
          if (!serverHandshakeCompleter.isCompleted) {
            serverHandshakeCompleter.completeError(e, s);
          }
        }
      });

      // Server: Start listening for protocol negotiation (non-blocking)
      final serverHandlingFuture = serverMuxer.handle(serverUnsecuredStream).catchError((e) {
        // If serverHandshakeCompleter is not done, this error might be relevant
        if (!serverHandshakeCompleter.isCompleted) {
          // serverHandshakeCompleter.completeError(e); // Avoid double completion
        }
      });


      // Client: Negotiate for Noise protocol
      final selectedProtocol = await clientMuxer.selectOneOf(
        clientUnsecuredStream,
        [clientNoiseSec.protocolId, '/proto/dummy1'], // Offer Noise first
      );
      expect(selectedProtocol, equals(clientNoiseSec.protocolId));

      // Client: Perform Noise handshake (outbound)
      final adapterFromClient = P2PStreamToTransportConnAdapter(
        clientUnsecuredStream,
        localPeer: clientPeerId,
        remotePeer: serverPeerId,
        localMultiaddr: clientMa,
        remoteMultiaddr: serverMa,
      );
      final SecuredConnection clientSecuredConn = await clientNoiseSec.secureOutbound(adapterFromClient);

      // Wait for server-side handshake to complete
      final SecuredConnection serverSecuredConn = await serverHandshakeCompleter.future.timeout(
        Duration(seconds: 10), // Increased timeout for handshake
        onTimeout: () => throw TimeoutException("Server Noise handshake timed out"),
      );

      // Verification: Exchange encrypted data
      final testMessage = Uint8List.fromList(utf8.encode('hello noisy multistream world!'));

      // Client writes, Server reads
      await clientSecuredConn.write(testMessage);
      final receivedByServer = await serverSecuredConn.read(testMessage.length);
      expect(receivedByServer, equals(testMessage), reason: "Server did not receive correct message from client");

      // Server writes, Client reads
      final testMessageFromServer = Uint8List.fromList(utf8.encode('greetings from server!'));
      await serverSecuredConn.write(testMessageFromServer);
      final receivedByClient = await clientSecuredConn.read(testMessageFromServer.length);
      expect(receivedByClient, equals(testMessageFromServer), reason: "Client did not receive correct message from server");
      
      // Verify remote peer IDs and public keys on secured connections
      expect(clientSecuredConn.remotePeer, equals(serverPeerId));

      var remotePubKey = await clientSecuredConn.remotePublicKey;
      expect(remotePubKey?.raw, equals(serverIdentityKey.publicKey.raw));
      
      expect(serverSecuredConn.remotePeer, equals(clientPeerId));
      remotePubKey = await serverSecuredConn.remotePublicKey;
      expect(remotePubKey?.raw, equals(clientIdentityKey.publicKey.raw));

      // Cleanup
      await clientSecuredConn.close();
      await serverSecuredConn.close(); // This should also close underlying P2PStreams via adapter

      // Ensure server handling future also completes (might have errored if client closed first)
      await serverHandlingFuture.catchError((_){});
    });
  });
}
