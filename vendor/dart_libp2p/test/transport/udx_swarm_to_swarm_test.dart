
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/host/host.dart'; // For Context (though we use core.Context)
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
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
import 'package:dart_libp2p/core/connmgr/conn_manager.dart' as core_connmgr; // For type casting if needed
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart'; // Added for ResourceManagerImpl
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart'; // Added for FixedLimiter
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart'; // Attempting corrected path for MemoryPeerstore
import 'package:dart_libp2p/core/event/bus.dart';
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
  group('Swarm-to-Swarm UDX, Noise, Yamux, Ping', () {
    late Swarm clientSwarm;
    late Swarm serverSwarm;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late UDX udxInstance;
    late MultiAddr serverListenAddr;
    late p2p_config.Config clientP2PConfig;
    late p2p_config.Config serverP2PConfig;
    late ResourceManagerImpl resourceManager;
    late p2p_transport.ConnectionManager connManager;
    late EventBus eventBus;
    late UDXTransport clientUdxTransport;
    late UDXTransport serverUdxTransport;
    TestNotifiee? serverNotifiee;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = p2p_transport.ConnectionManager();
      eventBus = BasicBus();

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
      final muxerDefs = [
        _TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)
      ];

      final clientSecurity = [await NoiseSecurity.create(clientKeyPair)];
      final serverSecurity = [await NoiseSecurity.create(serverKeyPair)];

      clientP2PConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = clientSecurity
        ..muxers = muxerDefs
        ..connManager = connManager
        ..eventBus = eventBus
        ..addrsFactory = passThroughAddrsFactory;

      final initialListen = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = serverSecurity
        ..muxers = muxerDefs
        ..listenAddrs = [initialListen]
        ..connManager = connManager
        ..eventBus = eventBus
        ..addrsFactory = passThroughAddrsFactory;

      clientUdxTransport =
          UDXTransport(connManager: connManager, udxInstance: udxInstance);
      serverUdxTransport =
          UDXTransport(connManager: connManager, udxInstance: udxInstance);

      final clientPeerstore = MemoryPeerstore();
      final serverPeerstore = MemoryPeerstore();

      clientSwarm = Swarm(
        host: null,
        localPeer: clientPeerId,
        peerstore: clientPeerstore,
        resourceManager: resourceManager,
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: clientP2PConfig,
        transports: [clientUdxTransport],
      );

      serverSwarm = Swarm(
        host: null,
        localPeer: serverPeerId,
        peerstore: serverPeerstore,
        resourceManager: resourceManager,
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: serverP2PConfig,
        transports: [serverUdxTransport],
      );

      await serverSwarm.listen(serverP2PConfig.listenAddrs);
      expect(serverSwarm.listenAddresses.isNotEmpty, isTrue);
      serverListenAddr = serverSwarm.listenAddresses.firstWhere((addr) =>
          addr.hasProtocol(multiaddr_protocol.Protocols.udx.name));
      print('Server Swarm listening on: $serverListenAddr');

      clientSwarm.peerstore.addrBook.addAddrs(
          serverPeerId, [serverListenAddr], AddressTTL.permanentAddrTTL);
      clientSwarm.peerstore.keyBook.addPubKey(
          serverPeerId, serverKeyPair.publicKey);

      print('Swarm-to-Swarm Setup Complete. Client: ${clientPeerId
          .toString()}, Server: ${serverPeerId
          .toString()} listening on $serverListenAddr');
    });

    tearDownAll(() async {
      print('Closing client swarm...');
      await clientSwarm.close();
      print('Closing server swarm...');
      await serverSwarm.close();
      await connManager.dispose();
      await resourceManager.close();
      print('Swarm-to-Swarm Teardown Complete.');
    });

    test(
        'should establish connection, upgrade, and ping directly between Swarms', () async {
      Completer<Conn> serverConnCompleter = Completer();
      serverNotifiee = TestNotifiee(
          connectedCallback: (network, conn) {
            if (conn.remotePeer.toString() == clientPeerId.toString() &&
                !serverConnCompleter.isCompleted) {
              print('Server Swarm Notifiee: Connected to client ${conn
                  .remotePeer}');
              serverConnCompleter.complete(conn);
            }
          }
      );
      serverSwarm.notify(serverNotifiee!);

      print('Client Swarm (${clientPeerId
          .toString()}) dialing Server Swarm (${serverPeerId
          .toString()}) at $serverListenAddr');
      final Conn clientSwarmConn = await clientSwarm.dialPeer(
          core_context.Context(), serverPeerId);
      print('Client Swarm connected to Server. Connection ID: ${clientSwarmConn
          .id}, Remote: ${clientSwarmConn.remotePeer}');
      expect(clientSwarmConn.remotePeer.toString(), serverPeerId.toString());

      final Conn serverSwarmConn = await serverConnCompleter.future.timeout(
          Duration(seconds: 10),
          onTimeout: () =>
          throw TimeoutException(
              'Server did not receive connection from client in time')
      );
      print(
          'Server Swarm received connection from Client. Connection ID: ${serverSwarmConn
              .id}, Remote: ${serverSwarmConn.remotePeer}');
      expect(serverSwarmConn.remotePeer.toString(), clientPeerId.toString());

      late core_network_stream.P2PStream serverP2PStream;
      final serverAcceptStreamFuture = ((serverSwarmConn as dynamic)
          .conn as core_mux_types.MuxedConn).acceptStream().then((stream) {
        serverP2PStream = stream as core_network_stream
            .P2PStream; // Cast MuxedStream to P2PStream
        print('Server Swarm accepted P2PStream: ${serverP2PStream
            .id()} from ${serverP2PStream.conn.remotePeer}');
        return serverP2PStream;
      });

      await Future.delayed(Duration(milliseconds: 100));

      final core_network_stream
          .P2PStream clientP2PStream = await ((clientSwarmConn as dynamic)
          .conn as core_mux_types.MuxedConn).openStream(
          core_context.Context()) as core_network_stream
          .P2PStream; // Use openStream, no context, cast MuxedStream
      print('Client Swarm opened P2PStream: ${clientP2PStream
          .id()} to ${clientP2PStream.conn.remotePeer}');

      await serverAcceptStreamFuture.timeout(Duration(seconds: 5),
          onTimeout: () =>
          throw TimeoutException(
              'Server did not accept stream in time'));

      expect(clientP2PStream, isNotNull);
      expect(serverP2PStream, isNotNull);

      final random = Random();
      final pingData = Uint8List.fromList(
          List.generate(32, (_) => random.nextInt(256)));

      print('Client sending ping data (${pingData
          .length} bytes) over P2PStream ${clientP2PStream.id()}');
      await clientP2PStream.write(pingData);
      print('Client ping data sent.');

      final receivedOnServer = await serverP2PStream.read().timeout(
          Duration(seconds: 5));
      print('Server received ${receivedOnServer
          .length} bytes data over P2PStream ${serverP2PStream.id()}');
      expect(receivedOnServer, orderedEquals(pingData));

      await serverP2PStream.write(receivedOnServer);
      print('Server echoed data over P2PStream ${serverP2PStream.id()}');

      final echoedToClient = await clientP2PStream.read().timeout(
          Duration(seconds: 5));
      print('Client received ${echoedToClient
          .length} echoed data over P2PStream ${clientP2PStream.id()}');
      expect(echoedToClient, orderedEquals(pingData));

      print('Swarm-to-Swarm Ping successful.');

      await clientP2PStream.close();
      await serverP2PStream.close();

      if (serverNotifiee != null) {
        serverSwarm.stopNotify(serverNotifiee!);
      }
    }, timeout: Timeout(Duration(seconds: 30)));
  });
}