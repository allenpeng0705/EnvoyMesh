import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types; // Aliased import
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart'; // Corrected import
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart'; // Corrected import for YamuxSession
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart'; // Added import for YamuxStream
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart'; // For MultiplexerConfig
import 'package:dart_libp2p/config/stream_muxer.dart'; // For StreamMuxer base class
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport; // Aliased for clarity
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart'; // Added for ResourceManagerImpl
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart'; // Added for FixedLimiter
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_network_stream;
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/core/peerstore.dart'; // For AddressTTL
import 'package:dart_libp2p/core/network/network.dart'; // For Network type in TestNotifiee
import 'package:dart_libp2p/core/network/notifiee.dart'; // For Notifiee interface

// Custom AddrsFactory for testing that doesn't filter loopback
List<MultiAddr> passThroughAddrsFactory(List<MultiAddr> addrs) {
  return addrs;
}

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: '/yamux/1.0.0', // Matches YamuxSession.protocolId
          muxerFactory: (Conn secureConn, bool isClient) {
            if (secureConn is! TransportConn) {
              throw ArgumentError(
                  'YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
            }
            return YamuxSession(secureConn, yamuxConfig, isClient);
          },
        );
}

// Helper Notifiee for tests
class TestNotifiee implements Notifiee {
  final Function(Network, Conn)? connectedCallback;
  final Function(Network, Conn)? disconnectedCallback;
  final Function(Network, MultiAddr)? listenCallback;
  final Function(Network, MultiAddr)? listenCloseCallback;

  TestNotifiee({
    this.connectedCallback,
    this.disconnectedCallback,
    this.listenCallback,
    this.listenCloseCallback,
  });

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    connectedCallback?.call(network, conn);
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    disconnectedCallback?.call(network, conn);
  }

  @override
  void listen(Network network, MultiAddr addr) {
    listenCallback?.call(network, addr);
  }

  @override
  void listenClose(Network network, MultiAddr addr) {
    listenCloseCallback?.call(network, addr);
  }
}

void main() {
  group('UDXTransport with Noise and Ping Integration Test', () {
    late UDXTransport clientTransport;
    late UDXTransport serverTransport;
    late BasicUpgrader clientUpgrader;
    late BasicUpgrader serverUpgrader;
    late p2p_config.Config clientP2PConfig;
    late p2p_config.Config serverP2PConfig;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late Listener listener;
    late MultiAddr actualListenAddr;
    late UDX udxInstance;
    late ResourceManager resourceManager;
    late NullConnMgr connManager;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = NullResourceManager();
      connManager = NullConnMgr();

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final securityProtocolsClient = [await NoiseSecurity.create(clientKeyPair)];
      final securityProtocolsServer = [await NoiseSecurity.create(serverKeyPair)];
      
      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );
      final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)];

      clientP2PConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = securityProtocolsClient
        ..muxers = muxerDefs;

      serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = securityProtocolsServer
        ..muxers = muxerDefs;

      clientTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      serverTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);

      clientUpgrader = BasicUpgrader(resourceManager: resourceManager);
      serverUpgrader = BasicUpgrader(resourceManager: resourceManager);
    });

    tearDownAll(() async {
      await clientTransport.dispose();
      await serverTransport.dispose();
    });

    test('should establish UDX connection, upgrade to Noise/Yamux, and perform ping', () async {
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      listener = await serverTransport.listen(initialListenAddr);
      actualListenAddr = listener.addr;

      late TransportConn clientRawConn;
      late TransportConn serverRawConn;

      final serverAcceptFuture = listener.accept().then((conn) {
        if (conn == null) throw Exception("Listener accepted null connection");
        serverRawConn = conn;
        return serverRawConn;
      });

      final clientDialFuture = clientTransport.dial(actualListenAddr).then((conn) {
        clientRawConn = conn;
        return clientRawConn;
      });

      await Future.wait([clientDialFuture, serverAcceptFuture]);
      expect(clientRawConn, isNotNull);
      expect(serverRawConn, isNotNull);

      final clientUpgradedFuture = clientUpgrader.upgradeOutbound(
        connection: clientRawConn,
        remotePeerId: serverPeerId,
        config: clientP2PConfig,
        remoteAddr: actualListenAddr,
      );
      final serverUpgradedFuture = serverUpgrader.upgradeInbound(
        connection: serverRawConn,
        config: serverP2PConfig,
      );

      final List<Conn> upgradedConns = await Future.wait([clientUpgradedFuture, serverUpgradedFuture]);
      final Conn clientUpgradedConn = upgradedConns[0];
      final Conn serverUpgradedConn = upgradedConns[1];

      expect(clientUpgradedConn.remotePeer.toString(), serverPeerId.toString());
      expect(serverUpgradedConn.remotePeer.toString(), clientPeerId.toString());
      expect(clientUpgradedConn.state.security, contains('noise'));
      expect(serverUpgradedConn.state.security, contains('noise'));
      expect(clientUpgradedConn.state.streamMultiplexer, contains('yamux'));
      expect(serverUpgradedConn.state.streamMultiplexer, contains('yamux'));

      late YamuxStream clientStream;
      late YamuxStream serverStream;

      final serverAcceptStreamFuture = (serverUpgradedConn as core_mux_types.MuxedConn).acceptStream().then((stream) { 
        serverStream = stream as YamuxStream;
        return serverStream;
      });

      await Future.delayed(Duration(milliseconds: 100));

      clientStream = await (clientUpgradedConn as core_mux_types.MuxedConn).openStream(core_context.Context()) as YamuxStream; 
      
      await serverAcceptStreamFuture;

      expect(clientStream, isNotNull);
      expect(serverStream, isNotNull);

      await clientStream.setProtocol(PingConstants.protocolId); 

      final random = Random();
      final pingData = Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));

      await clientStream.write(pingData);

      final receivedOnServer = await serverStream.read(); 
      expect(receivedOnServer, orderedEquals(pingData));

      await serverStream.write(receivedOnServer);

      final echoedToClient = await clientStream.read(); 
      expect(echoedToClient, orderedEquals(pingData));

      await clientStream.close();
      await serverStream.close();

      await clientUpgradedConn.close();
      await serverUpgradedConn.close();

      // Add a short delay to allow the close events to propagate
      await Future.delayed(const Duration(milliseconds: 100));

      expect(clientRawConn.isClosed, isTrue, reason: "Client raw connection should be closed by upgrader/muxer");
      expect(serverRawConn.isClosed, isTrue, reason: "Server raw connection should be closed by upgrader/muxer");
      
      await listener.close();
      expect(listener.isClosed, isTrue);
    }, timeout: Timeout(Duration(seconds: 20)));
  });

  group('UDXTransport with Noise/Ping, Real ConnMgr and RsrcMgr', () {
    late UDXTransport clientTransport;
    late UDXTransport serverTransport;
    late BasicUpgrader clientUpgrader;
    late BasicUpgrader serverUpgrader;
    late p2p_config.Config clientP2PConfig;
    late p2p_config.Config serverP2PConfig;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late Listener listener;
    late MultiAddr actualListenAddr;
    late UDX udxInstance;
    late ResourceManagerImpl resourceManager; 
    late p2p_transport.ConnectionManager connManager;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter()); 
      connManager = p2p_transport.ConnectionManager();

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final securityProtocolsClient = [await NoiseSecurity.create(clientKeyPair)];
      final securityProtocolsServer = [await NoiseSecurity.create(serverKeyPair)];
      
      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024, 
        initialStreamWindowSize: 256 * 1024, 
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );
      final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)];

      clientP2PConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = securityProtocolsClient
        ..muxers = muxerDefs;

      serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = securityProtocolsServer
        ..muxers = muxerDefs;

      clientTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      serverTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);

      clientUpgrader = BasicUpgrader(resourceManager: resourceManager);
      serverUpgrader = BasicUpgrader(resourceManager: resourceManager);
    });

    tearDownAll(() async {
      await clientTransport.dispose();
      await serverTransport.dispose();
      
      if (connManager is p2p_transport.ConnectionManager) {
        await (connManager as p2p_transport.ConnectionManager).dispose();
      }
      if (resourceManager is ResourceManagerImpl) { 
         await (resourceManager as ResourceManagerImpl).close();
      }
    });

    test('should establish UDX, upgrade (Noise/Yamux) with real managers, and ping', () async {
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      listener = await serverTransport.listen(initialListenAddr);
      actualListenAddr = listener.addr;
      print('Server listening on: $actualListenAddr (Real Managers Test)');

      late TransportConn clientRawConn;
      late TransportConn serverRawConn;

      final serverAcceptFuture = listener.accept().then((conn) {
        if (conn == null) throw Exception("Listener accepted null connection");
        serverRawConn = conn;
        print('Server accepted raw connection: ${serverRawConn.id} (Real Managers Test)');
        return serverRawConn;
      });

      final clientDialFuture = clientTransport.dial(actualListenAddr).then((conn) {
        clientRawConn = conn;
        print('Client dialed raw connection: ${clientRawConn.id} (Real Managers Test)');
        return clientRawConn;
      });

      await Future.wait([clientDialFuture, serverAcceptFuture]);
      expect(clientRawConn, isNotNull);
      expect(serverRawConn, isNotNull);

      print('Upgrading client connection outbound... (Real Managers Test)');
      final clientUpgradedFuture = clientUpgrader.upgradeOutbound(
        connection: clientRawConn,
        remotePeerId: serverPeerId,
        config: clientP2PConfig,
        remoteAddr: actualListenAddr,
      );
      print('Upgrading server connection inbound... (Real Managers Test)');
      final serverUpgradedFuture = serverUpgrader.upgradeInbound(
        connection: serverRawConn,
        config: serverP2PConfig,
      );

      final List<Conn> upgradedConns = await Future.wait([clientUpgradedFuture, serverUpgradedFuture]);
      final Conn clientUpgradedConn = upgradedConns[0];
      final Conn serverUpgradedConn = upgradedConns[1];

      print('Client upgraded. Remote peer: ${clientUpgradedConn.remotePeer}, Security: ${clientUpgradedConn.state.security}, Muxer: ${clientUpgradedConn.state.streamMultiplexer} (Real Managers Test)');
      print('Server upgraded. Remote peer: ${serverUpgradedConn.remotePeer}, Security: ${serverUpgradedConn.state.security}, Muxer: ${serverUpgradedConn.state.streamMultiplexer} (Real Managers Test)');

      expect(clientUpgradedConn.remotePeer.toString(), serverPeerId.toString());
      expect(serverUpgradedConn.remotePeer.toString(), clientPeerId.toString());
      expect(clientUpgradedConn.state.security, contains('noise'));
      expect(serverUpgradedConn.state.security, contains('noise'));
      expect(clientUpgradedConn.state.streamMultiplexer, contains('yamux'));
      expect(serverUpgradedConn.state.streamMultiplexer, contains('yamux'));

      late YamuxStream clientStream;
      late YamuxStream serverStream;

      final serverAcceptStreamFuture = (serverUpgradedConn as core_mux_types.MuxedConn).acceptStream().then((stream) { 
        serverStream = stream as YamuxStream;
        print('Server accepted stream: ${serverStream.id()} (Real Managers Test)'); 
        return serverStream;
      });

      await Future.delayed(Duration(milliseconds: 100)); 

      clientStream = await (clientUpgradedConn as core_mux_types.MuxedConn).openStream(core_context.Context()) as YamuxStream; 
      print('Client opened stream: ${clientStream.id()} (Real Managers Test)'); 
      
      await serverAcceptStreamFuture;

      expect(clientStream, isNotNull);
      expect(serverStream, isNotNull);

      await clientStream.setProtocol(PingConstants.protocolId); 

      final random = Random();
      final pingData = Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));
      print('Client sending ping data (${pingData.length} bytes) on stream ${clientStream.id()} (Real Managers Test)');

      await clientStream.write(pingData);
      print('Client ping data sent. (Real Managers Test)');

      final receivedOnServer = await serverStream.read(); 
      print('Server received data (${receivedOnServer.length} bytes) on stream ${serverStream.id()} (Real Managers Test)');
      expect(receivedOnServer, orderedEquals(pingData));

      print('Server echoing data back on stream ${serverStream.id()} (Real Managers Test)');
      await serverStream.write(receivedOnServer);
      print('Server data echoed. (Real Managers Test)');

      final echoedToClient = await clientStream.read(); 
      print('Client received echoed data (${echoedToClient.length} bytes) on stream ${clientStream.id()} (Real Managers Test)');
      expect(echoedToClient, orderedEquals(pingData));
      print('Ping successful. (Real Managers Test)');

      print('Closing client stream ${clientStream.id()} (Real Managers Test)');
      await clientStream.close();
      print('Closing server stream ${serverStream.id()} (Real Managers Test)');
      await serverStream.close();

      print('Closing client upgraded connection ${clientUpgradedConn.id} (Real Managers Test)');
      await clientUpgradedConn.close();
      print('Closing server upgraded connection ${serverUpgradedConn.id} (Real Managers Test)');
      await serverUpgradedConn.close();

      // Add a short delay to allow the close events to propagate
      await Future.delayed(const Duration(milliseconds: 100));

      expect(clientRawConn.isClosed, isTrue, reason: "Client raw connection should be closed by upgrader/muxer (Real Managers Test)");
      expect(serverRawConn.isClosed, isTrue, reason: "Server raw connection should be closed by upgrader/muxer (Real Managers Test)");
      
      print('Closing listener (Real Managers Test)');
      await listener.close();
      expect(listener.isClosed, isTrue);

      print('Test completed successfully. (Real Managers Test)');
    }, timeout: Timeout(Duration(seconds: 20)));
  });

  group('Swarm with UDX, Noise, and Ping', () {
    late BasicHost clientHost;
    late BasicHost serverHost;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late UDX udxInstance;
    late MultiAddr serverListenAddr;

    setUpAll(() async {
      udxInstance = UDX();

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );
      final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)];

      final clientSecurity = [await NoiseSecurity.create(clientKeyPair)];
      final serverSecurity = [await NoiseSecurity.create(serverKeyPair)];

      final resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      final p2p_transport.ConnectionManager connManager = p2p_transport.ConnectionManager(); 
      final eventBus = BasicBus();

      final clientP2PConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = clientSecurity
        ..muxers = muxerDefs
        ..connManager= connManager
        ..eventBus = eventBus;

      final serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = serverSecurity
        ..muxers = muxerDefs
        ..addrsFactory = passThroughAddrsFactory;
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      serverP2PConfig.listenAddrs = [initialListenAddr]; 
      serverP2PConfig.connManager= connManager; 
      serverP2PConfig.eventBus = eventBus;

      final clientUdxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      final serverUdxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      
      final clientPeerstore = MemoryPeerstore(); 
      final serverPeerstore = MemoryPeerstore(); 

      final clientSwarm = Swarm(
        host: null, 
        localPeer: clientPeerId,
        peerstore: clientPeerstore,
        resourceManager: resourceManager, 
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: clientP2PConfig,
        transports: [clientUdxTransport],
      );
      clientHost = await BasicHost.create(network: clientSwarm, config: clientP2PConfig);
      clientSwarm.setHost(clientHost); 
      await clientHost.start(); 

      final serverSwarm = Swarm(
        host: null, 
        localPeer: serverPeerId,
        peerstore: serverPeerstore,
        resourceManager: resourceManager, 
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: serverP2PConfig,
        transports: [serverUdxTransport],
      );
      serverHost = await BasicHost.create(network: serverSwarm, config: serverP2PConfig);
      serverSwarm.setHost(serverHost); 
      
      serverHost.setStreamHandler(PingConstants.protocolId, (core_network_stream.P2PStream stream, PeerId peerId) async { 
        await _handleServerPingStream(stream);
      });

      await serverSwarm.listen(serverP2PConfig.listenAddrs); 
      await serverHost.start(); 
      
      expect(serverHost.addrs.isNotEmpty, isTrue); 
      serverListenAddr = serverHost.addrs.firstWhere((addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)); 
      print('Server Host listening on: $serverListenAddr');

     clientHost.peerStore.addrBook.addAddrs(
        serverPeerId, 
        [serverListenAddr], 
        AddressTTL.permanentAddrTTL 
      );
      clientHost.peerStore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey);

      print('Swarm UDX/Noise/Ping Setup Complete. Client: ${clientPeerId.toString()}, Server: ${serverPeerId.toString()} listening on $serverListenAddr');
    });

    tearDownAll(() async {
      print('Closing client host...');
      await clientHost.close();
      print('Closing server host...');
      await serverHost.close();
      print('Swarm UDX/Noise/Ping Teardown Complete.');
    });

    test('should establish connection via Swarm, negotiate Noise/Yamux, and perform ping', () async {
      print('Client Host (${clientPeerId.toString()}) attempting to open new stream to Server Host (${serverPeerId.toString()}) for protocol ${PingConstants.protocolId}');
      
      core_network_stream.P2PStream clientStream;
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]); 
        await clientHost.connect(serverAddrInfo);
        print('Client Host connected to Server Host.');

        clientStream = await clientHost.newStream(serverPeerId, [PingConstants.protocolId], core_context.Context()); 
      } catch (e, s) {
        print('Client Host newStream failed: $e\n$s');
        fail('Client Host failed to open new stream: $e');
      }
      
      print('Client Host opened stream: ${clientStream.id()}, protocol: ${clientStream.protocol()}');
      expect(clientStream.protocol(), equals(PingConstants.protocolId));
      expect(clientStream.conn.remotePeer.toString(), serverPeerId.toString());

      final random = Random();
      final pingData = Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));
      print('Client sending ping data (${pingData.length} bytes) on stream ${clientStream.id()}');

      await clientStream.write(pingData);
      print('Client ping data sent.');

      final echoedToClient = await clientStream.read();
      print('Client received echoed data (${echoedToClient.length} bytes) on stream ${clientStream.id()}');
      expect(echoedToClient, orderedEquals(pingData));
      print('Ping successful via Swarm/Host.');

      await clientStream.close();
      print('Client closed stream ${clientStream.id()}');

      await Future.delayed(Duration(milliseconds: 100));

    }, timeout: Timeout(Duration(seconds: 20)));
  });

}

// Helper function for the server's ping stream handler to keep the main handler signature void
Future<void> _handleServerPingStream(core_network_stream.P2PStream stream) async { 
  print('Server received stream for ping: ${stream.id()} from ${stream.conn.remotePeer}'); 
  try {
    final data = await stream.read();
    print('Server read ${data.length} bytes from stream ${stream.id()}');
    await stream.write(data);
    print('Server echoed ${data.length} bytes to stream ${stream.id()}');
  } catch (e) {
    print('Server ping handler error: $e');
    await stream.reset();
  } finally {
    await stream.close(); 
    print('Server closed stream ${stream.id()}');
  }
  return; 
}
