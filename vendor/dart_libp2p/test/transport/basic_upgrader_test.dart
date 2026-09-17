import 'dart:async';
import 'dart:typed_data';
import 'dart:convert';

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/mux.dart' as core_mux;
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'dart:io'; // Added for Socket

import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519; // Corrected path
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart';
import 'package:dart_libp2p/p2p/security/secured_connection.dart';
import 'package:dart_libp2p/p2p/security/security_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart' as config_stream_muxer;
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart' as p2p_mux;
import 'package:dart_libp2p/p2p/multiaddr/codec.dart'; // Added for MultiAddrCodec

import 'package:test/test.dart';

// --- Mock Classes ---

class MockResourceManager extends NullResourceManager {}

class MockSecurityProtocol implements SecurityProtocol {
  @override
  final ProtocolID protocolId;
  final Future<SecuredConnection> Function(TransportConn conn) secureOutboundFunc;
  final Future<SecuredConnection> Function(TransportConn conn) secureInboundFunc;

  MockSecurityProtocol(this.protocolId, this.secureOutboundFunc, this.secureInboundFunc);

  @override
  Future<SecuredConnection> secureOutbound(TransportConn conn) => secureOutboundFunc(conn);

  @override
  Future<SecuredConnection> secureInbound(TransportConn conn) => secureInboundFunc(conn);
}

class MockStreamMuxerDef extends config_stream_muxer.StreamMuxer {
  MockStreamMuxerDef({
    required ProtocolID id,
    required p2p_mux.Multiplexer Function(Conn secureConn, bool isClient) muxerFactory,
  }) : super(id: id, muxerFactory: muxerFactory);
}

class MockP2pMultiplexer implements p2p_mux.Multiplexer {
  final Future<core_mux.MuxedConn> Function(TransportConn secureConnection, bool isServer, PeerScope scope) newConnOnTransportFunc;

  MockP2pMultiplexer(this.newConnOnTransportFunc);

  @override
  String get protocolId => '/mock-muxer/1.0.0';
  @override
  Future<P2PStream> openStream(Context context) async => throw UnimplementedError(); // Changed from newStream()
  @override
  Future<P2PStream> acceptStream() async => throw UnimplementedError();
  @override
  Future<List<P2PStream>> get streams async => throw UnimplementedError(); // Changed to async
  @override
  Stream<P2PStream> get incomingStreams => throw UnimplementedError();
  @override
  Future<void> close() async {}
  @override
  bool get isClosed => false;
  @override
  int get maxStreams => 100;
  @override
  int get numStreams => 0;
  @override
  bool get canCreateStream => true;
  @override
  void setStreamHandler(Future<void> Function(P2PStream stream) handler) {}
  @override
  void removeStreamHandler() {}

  @override
  Future<core_mux.MuxedConn> newConnOnTransport(TransportConn secureConnection, bool isServer, PeerScope scope) =>
      newConnOnTransportFunc(secureConnection, isServer, scope);
}

class MockMuxedConn implements core_mux.MuxedConn {
  @override
  Future<void> close() async {}
  @override
  bool get isClosed => false;
  @override
  Future<core_mux.MuxedStream> openStream(Context context) async => throw UnimplementedError();
  @override
  Future<core_mux.MuxedStream> acceptStream() async => throw UnimplementedError();
}

class MockTransportConn implements TransportConn {
  final PeerId _localPeer;
  final PeerId _remotePeer;
  final MultiAddr _localMultiaddr;
  final MultiAddr _remoteMultiaddr;
  final KeyPair _localKeyPair;
  final KeyPair remoteKeyPair; // Added to access remote public key

  List<Uint8List> writtenData = [];
  List<Uint8List> dataToRead = [];
  int readPointer = 0;
  bool _isClosed = false;
  Completer<void>? _readCompleter;

  MockTransportConn(this._localPeer, this._remotePeer, this._localMultiaddr, this._remoteMultiaddr, this._localKeyPair, this.remoteKeyPair);

  void addDataToRead(Uint8List data) {
    dataToRead.add(data);
    if (_readCompleter != null && !_readCompleter!.isCompleted) {
      _readCompleter!.complete();
    }
  }

  @override
  Future<Uint8List> read([int? length]) async {
    if (_isClosed) throw Exception('Connection closed');
    if (readPointer >= dataToRead.length) {
      _readCompleter = Completer<void>();
      await _readCompleter!.future; // Wait for data to be added
      _readCompleter = null;
      if (_isClosed) throw Exception('Connection closed while waiting for read');
      if (readPointer >= dataToRead.length) {
         throw Exception('No more data to read after wait');
      }
    }
    final data = dataToRead[readPointer++];
    return data;
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) throw Exception('Connection closed');
    writtenData.add(data);
  }

  @override
  Future<void> close() async {
    _isClosed = true;
     if (_readCompleter != null && !_readCompleter!.isCompleted) {
      _readCompleter!.completeError(Exception('Connection closed by closer'));
    }
  }

  @override
  bool get isClosed => _isClosed;
  @override
  String get id => 'mock-transport-conn';
  @override
  MultiAddr get localMultiaddr => _localMultiaddr;
  @override
  MultiAddr get remoteMultiaddr => _remoteMultiaddr;
  @override
  PeerId get localPeer => _localPeer;
  @override
  PeerId get remotePeer => _remotePeer;
  @override
  Future<PublicKey?> get remotePublicKey async => remoteKeyPair.publicKey;
   @override
  ConnScope get scope => NullScope(); // Using NullScope from rcmgr.dart

  // Unimplemented but required by interface
  @override
  Socket get socket => throw UnimplementedError();
  @override
  void setReadTimeout(Duration timeout) {}
  @override
  void setWriteTimeout(Duration timeout) {}
  @override
  Future<P2PStream> newStream(Context context) => throw UnimplementedError();
  @override
  Future<List<P2PStream>> get streams async => [];
  @override
  ConnState get state => ConnState(
    streamMultiplexer: '',
    security: '',
    transport: 'tcp',
    usedEarlyMuxerNegotiation: false,
  );
  @override
  ConnStats get stat => throw UnimplementedError();
  // TransportConn requires these, ensure MockTransportConn provides them or they are handled here.
  // For this mock, we assume they are not critical for the upgrader logic itself if not called.
  @override
  void notifyActivity() {}
}

// --- New MockSecuredConnection that delegates to an underlying MockTransportConn ---
class DelegatingMockSecuredConnection implements SecuredConnection {
  final MockTransportConn _delegate;
  final PeerId _localPeer;
  final PeerId _remotePeer; // This is the peer ID established by the security handshake
  final KeyPair _localKeyPair; // Local keypair for this secured identity
  final PublicKey _establishedRemotePublicKey; // Remote public key established by handshake
  final String _protocolId; // The ID of the security protocol used

  DelegatingMockSecuredConnection(
    this._delegate,
    this._localPeer,
    this._remotePeer,
    this._localKeyPair,
    this._establishedRemotePublicKey,
    this._protocolId,
  );

  // Delegate TransportConn methods to the underlying MockTransportConn
  @override
  Future<Uint8List> read([int? length]) => _delegate.read(length);
  @override
  Future<void> write(Uint8List data) => _delegate.write(data);
  @override
  Future<void> close() => _delegate.close();
  @override
  bool get isClosed => _delegate.isClosed;
  @override
  String get id => _delegate.id; // Or a new ID specific to the secured connection
  @override
  MultiAddr get localMultiaddr => _delegate.localMultiaddr;
  @override
  MultiAddr get remoteMultiaddr => _delegate.remoteMultiaddr;

  // SecuredConnection specific properties (and TransportConn properties that might change post-security)
  @override
  PeerId get localPeer => _localPeer; // Use the local peer specific to this secured context
  @override
  PeerId get remotePeer => _remotePeer; // CRITICAL: This is the peer ID from the security handshake
  @override
  Future<PublicKey?> get remotePublicKey async => _establishedRemotePublicKey; // CRITICAL: Key from handshake

  @override
  ConnScope get scope => _delegate.scope; // Or a new scope if security changes it

  // Implement other TransportConn methods required by the interface by delegating
  @override
  Socket get socket => _delegate.socket;
  @override
  void setReadTimeout(Duration timeout) => _delegate.setReadTimeout(timeout);
  @override
  void setWriteTimeout(Duration timeout) => _delegate.setWriteTimeout(timeout);
  @override
  Future<P2PStream> newStream(Context context) => _delegate.newStream(context);
  @override
  Future<List<P2PStream>> get streams async => _delegate.streams;
  @override
  ConnState get state => _delegate.state; // This might need to be constructed based on secured state
  @override
  ConnStats get stat => _delegate.stat;

  // Implement SecuredConnection specific properties
  @override
  MultiAddr get localAddr => localMultiaddr;
  @override
  MultiAddr get remoteAddr => remoteMultiaddr;
  @override
  PeerId? get establishedRemotePeer => _remotePeer;
  @override
  PublicKey? get establishedRemotePublicKey => _establishedRemotePublicKey;
  @override
  String get securityProtocolId => _protocolId;

  @override
  void notifyActivity() {
    _delegate.notifyActivity(); // Delegate to the underlying mock transport connection
  }

  @override
  // TODO: implement currentRecvNonce
  int get currentRecvNonce => throw UnimplementedError();

  @override
  // TODO: implement currentSendNonce
  int get currentSendNonce => throw UnimplementedError();
}


void main() {
  group('BasicUpgrader', () {
    late BasicUpgrader upgrader;
    late MockTransportConn mockConn;
    late p2p_config.Config testConfig;
    late PeerId localPeerId;
    late PeerId remotePeerId;
    late KeyPair localKeyPair;
    late KeyPair remoteKeyPair;
    late MultiAddr localAddr;
    late MultiAddr remoteAddr;
    late MockSecurityProtocol mockSecProto;
    late MockStreamMuxerDef mockMuxerDef;
    late MockP2pMultiplexer mockP2pMuxer;
    late MockMuxedConn mockMuxedConn;

    setUp(() async {
      localKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      remoteKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      localPeerId = await PeerId.fromPublicKey(localKeyPair.publicKey);
      remotePeerId = await PeerId.fromPublicKey(remoteKeyPair.publicKey);
      localAddr = MultiAddr('/ip4/127.0.0.1/tcp/1000'); // Assuming Multiaddr.fromString exists
      remoteAddr = MultiAddr('/ip4/127.0.0.1/tcp/2000'); // Assuming Multiaddr.fromString exists

      upgrader = BasicUpgrader(resourceManager: MockResourceManager());
      mockConn = MockTransportConn(localPeerId, remotePeerId, localAddr, remoteAddr, localKeyPair, remoteKeyPair);

      mockMuxedConn = MockMuxedConn();
      mockP2pMuxer = MockP2pMultiplexer((conn, isServer, scope) async => mockMuxedConn);
      
      mockSecProto = MockSecurityProtocol(
        '/mock-sec/1.0.0',
        (transportConn) async {
          final originalMockConn = transportConn as MockTransportConn;
          // The remotePeerId and remoteKeyPair.publicKey are "established" by this mock security protocol
          return DelegatingMockSecuredConnection(
            originalMockConn,
            localPeerId, // Local peer for the secured connection
            remotePeerId, // Remote peer ID established by this mock handshake
            localKeyPair, // Local keypair
            remoteKeyPair.publicKey, // Remote public key established by this mock handshake
            '/mock-sec/1.0.0', // The ID of this mock security protocol
          );
        },
        (transportConn) async { // secureInboundFunc
          final originalMockConn = transportConn as MockTransportConn;
          // For inbound, remotePeerId and remoteKeyPair.publicKey are "discovered"
          return DelegatingMockSecuredConnection(
            originalMockConn,
            localPeerId,
            remotePeerId,
            localKeyPair,
            remoteKeyPair.publicKey,
            '/mock-sec/1.0.0',
          );
        },
      );
      mockMuxerDef = MockStreamMuxerDef(
        id: mockP2pMuxer.protocolId,
        muxerFactory: (secureConn, isClient) => mockP2pMuxer,
      );

      testConfig = p2p_config.Config()
        ..peerKey = localKeyPair
        ..securityProtocols = [mockSecProto]
        ..muxers = [mockMuxerDef];
    });

    test('upgradeOutbound successfully upgrades a connection', () async {
      // Simulate multistream negotiation for security
      // BasicUpgrader (initiator) sends:
      // 1. Its own /multistream/1.0.0
      // 2. Its proposed security protocol (e.g., /mock-sec/1.0.0)
      // MockConn (responder) needs to send back:
      // 1. Acknowledgment of /multistream/1.0.0
      // 2. Acknowledgment of the chosen security protocol
      Timer.run(() {
        // Mock responds to initiator's /multistream/1.0.0
        mockConn.addDataToRead(_prepareMultistreamResponse(protocolID)); // protocolID is '/multistream/1.0.0'
        // Mock responds to initiator's security protocol proposal
        mockConn.addDataToRead(_prepareMultistreamResponse(mockSecProto.protocolId));
      });

      // Simulate multistream negotiation for muxer
      // SecuredConn (initiator) sends:
      // 1. Its own /multistream/1.0.0
      // 2. Its proposed muxer protocol (e.g., /mock-muxer/1.0.0)
      // MockConn (responder, via DelegatingMockSecuredConnection) needs to send back:
      // 1. Acknowledgment of /multistream/1.0.0
      // 2. Acknowledgment of the chosen muxer protocol
      Timer.run(() {
        // Mock responds to initiator's /multistream/1.0.0 for muxer negotiation
        mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
        // Mock responds to initiator's muxer protocol proposal
        mockConn.addDataToRead(_prepareMultistreamResponse(mockMuxerDef.id));
      });

      final upgradedConn = await upgrader.upgradeOutbound(
        connection: mockConn,
        remotePeerId: remotePeerId,
        config: testConfig,
        remoteAddr: remoteAddr,
      );

      expect(upgradedConn, isA<Conn>());
      expect(upgradedConn.state.security, equals(mockSecProto.protocolId));
      expect(upgradedConn.state.streamMultiplexer, equals(mockMuxerDef.id));
      expect(upgradedConn.localPeer, equals(localPeerId));
      expect(upgradedConn.remotePeer, equals(remotePeerId));
    });

    test('upgradeInbound successfully upgrades a connection', () async {
      // Simulate initiator (remote) sending its preferred security protocol
      // The initiator (mockConn) sends:
      // 1. /multistream/1.0.0
      // 2. Its chosen security protocol
      mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
      mockConn.addDataToRead(_prepareMultistreamResponse(mockSecProto.protocolId));
      
      // Simulate initiator (remote) sending its preferred muxer protocol
      // The initiator (mockConn) sends:
      // 1. /multistream/1.0.0
      // 2. Its chosen muxer protocol
      mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
      mockConn.addDataToRead(_prepareMultistreamResponse(mockMuxerDef.id));

      final upgradedConn = await upgrader.upgradeInbound(
        connection: mockConn,
        config: testConfig,
      );

      expect(upgradedConn, isA<Conn>());
      expect(upgradedConn.state.security, equals(mockSecProto.protocolId));
      expect(upgradedConn.state.streamMultiplexer, equals(mockMuxerDef.id));
      expect(upgradedConn.localPeer, equals(localPeerId));
      // Remote peer ID is established during security handshake, simulated by MockSecuredConnection
      expect(upgradedConn.remotePeer, equals(remotePeerId)); 
    });

    test('upgradeOutbound fails if security negotiation fails (no common protocol)', () async {
      Timer.run(() {
        // Mock acks /multistream/1.0.0
        mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
        // Simulate remote responding with a protocol not offered by us
        mockConn.addDataToRead(_prepareMultistreamResponse('/non-existent-sec/1.0.0'));
      });

      await expectLater(
        upgrader.upgradeOutbound(
          connection: mockConn,
          remotePeerId: remotePeerId,
          config: testConfig,
          remoteAddr: remoteAddr,
        ),
        throwsA(isA<IncorrectVersionException>())
      );
      expect(mockConn.isClosed, isTrue);
    });

    test('upgradeOutbound fails if muxer negotiation fails', () async {
      // Security negotiation succeeds
      Timer.run(() {
        // Mock acks /multistream/1.0.0 for security
        mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
        // Mock acks the security protocol
        mockConn.addDataToRead(_prepareMultistreamResponse(mockSecProto.protocolId));
      });
      // Muxer negotiation fails
      Timer.run(() {
        // Mock acks /multistream/1.0.0 for muxer
        mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
        // Mock responds with a non-existent muxer
        mockConn.addDataToRead(_prepareMultistreamResponse('/non-existent-muxer/1.0.0'));
      });
      
      await expectLater(
        upgrader.upgradeOutbound(
          connection: mockConn,
          remotePeerId: remotePeerId,
          config: testConfig,
          remoteAddr: remoteAddr,
        ), throwsA(isA<IncorrectVersionException>())
      );
       // The underlying connection (mockConn) might be closed by the security layer if muxer fails,
       // or by BasicUpgrader itself. Here, secureConn (which is mockConn) would be closed.
      expect(mockConn.isClosed, isTrue);
    });
     test('upgradeOutbound closes connection on error during security handshake', () async {
      final erroringSecProto = MockSecurityProtocol(
        '/error-sec/1.0.0',
        (conn) async => throw Exception('Security handshake error'),
        (conn) async => throw Exception('Security handshake error'),
      );
      testConfig.securityProtocols = [erroringSecProto];

      Timer.run(() {
        // Mock acks /multistream/1.0.0
        mockConn.addDataToRead(_prepareMultistreamResponse(protocolID));
        // Mock "selects" the erroring security protocol
        mockConn.addDataToRead(_prepareMultistreamResponse(erroringSecProto.protocolId));
      });
      
      await expectLater(
        upgrader.upgradeOutbound(
          connection: mockConn,
          remotePeerId: remotePeerId,
          config: testConfig,
          remoteAddr: remoteAddr,
        ),
        throwsA(isA<Exception>().having((e) => e.toString(), 'message', contains('Security handshake error'))),
      );
      expect(mockConn.isClosed, isTrue);
    });
  });
}

// Helper to prepare a fully-formed multistream message (varint_length_prefix + payload + newline)
// This is what the responder (mock) should send back.
Uint8List _prepareMultistreamResponse(String protocolPayload) {
  final messageBytes = utf8.encode(protocolPayload);
  // The length written by _writeDelimited in MultistreamMuxer is message.length + 1 (for the newline)
  final lengthOfMessageAndNewline = messageBytes.length + 1;
  final lengthPrefixBytes = MultiAddrCodec.encodeVarint(lengthOfMessageAndNewline);

  final fullMessage = BytesBuilder();
  fullMessage.add(lengthPrefixBytes);
  fullMessage.add(messageBytes);
  fullMessage.addByte(10); // newline '\n'
  return fullMessage.toBytes();
}

// Commenting out the old helper as it's replaced by _prepareMultistreamResponse for these tests.
// Uint8List _encodeMultistreamMessages(List<String> protocols) {
//   final lines = protocols.map((p) => '${p}\n').join();
//   return Uint8List.fromList(utf8.encode(lines));
// }
