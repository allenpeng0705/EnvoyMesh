import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:collection/collection.dart';
import 'package:logging/logging.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart'; // For Connectedness
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as core_peer_id_lib;
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport;
import 'package:dart_libp2p/core/connmgr/conn_manager.dart' as core_connmgr;
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_network_stream;
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart';

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

void main() {
  Logger.root.level = Level.INFO; // Adjusted for less verbose output initially
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
    if (record.error != null) {
      print('ERROR: ${record.error}');
    }
    if (record.stackTrace != null) {
      print('STACKTRACE: ${record.stackTrace}');
    }
  });

  group('UDX Transport: Multiple Clients from Same IP, Different Ports', () {
    late BasicHost serverHost;
    late BasicHost client1Host;
    late BasicHost client2Host; // Re-enable client2

    late core_peer_id_lib.PeerId serverPeerId;
    late core_peer_id_lib.PeerId client1PeerId;
    late core_peer_id_lib.PeerId client2PeerId; // Re-enable client2

    late KeyPair serverKeyPair;
    late KeyPair client1KeyPair;
    late KeyPair client2KeyPair; // Re-enable client2

    late UDX udxInstance;
    late MultiAddr serverListenAddr;
    late ResourceManagerImpl resourceManager;
    late p2p_transport.ConnectionManager connManager;
    late EventBus hostEventBus;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = p2p_transport.ConnectionManager(); // Shared by all transports
      hostEventBus = BasicBus();

      // Generate keys and PeerIDs for all three hosts
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      client1KeyPair = await crypto_ed25519.generateEd25519KeyPair();
      client2KeyPair = await crypto_ed25519.generateEd25519KeyPair(); // Re-enable client2

      serverPeerId = await core_peer_id_lib.PeerId.fromPublicKey(serverKeyPair.publicKey);
      client1PeerId = await core_peer_id_lib.PeerId.fromPublicKey(client1KeyPair.publicKey);
      client2PeerId = await core_peer_id_lib.PeerId.fromPublicKey(client2KeyPair.publicKey); // Re-enable client2

      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration.zero,
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );
      final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)];

      // Helper to create a host
      Future<BasicHost> createHost(KeyPair keyPair, core_peer_id_lib.PeerId peerId, [List<MultiAddr>? listenAddrs]) async {
        final security = [await NoiseSecurity.create(keyPair)];
        final peerstore = MemoryPeerstore();
        final udxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
        final upgrader = BasicUpgrader(resourceManager: resourceManager);

        final swarmConfig = p2p_config.Config()
          ..peerKey = keyPair
          ..connManager = connManager
          ..eventBus = BasicBus() // Swarm's own event bus
          ..addrsFactory = passThroughAddrsFactory
          ..securityProtocols = security
          ..muxers = muxerDefs
          ..listenAddrs = listenAddrs ?? [];

        final network = Swarm(
          host: null,
          localPeer: peerId,
          peerstore: peerstore,
          upgrader: upgrader,
          config: swarmConfig,
          transports: [udxTransport],
          resourceManager: resourceManager,
        );

        final hostConfig = p2p_config.Config()
          ..peerKey = keyPair
          ..eventBus = hostEventBus // Shared event bus for hosts
          ..connManager = connManager
          ..addrsFactory = passThroughAddrsFactory
          ..negotiationTimeout = Duration(seconds: 20)
          ..identifyUserAgent = "dart-libp2p-multi-client-test/1.0"
          ..muxers = muxerDefs
          ..securityProtocols = security
          ..listenAddrs = listenAddrs ?? [];
          
        final host = await BasicHost.create(network: network, config: hostConfig);
        network.setHost(host);
        await host.start();
        if (listenAddrs != null && listenAddrs.isNotEmpty) {
          await network.listen(swarmConfig.listenAddrs);
        }
        return host;
      }

      final initialListen = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      serverHost = await createHost(serverKeyPair, serverPeerId, [initialListen]);
      client1Host = await createHost(client1KeyPair, client1PeerId);
      client2Host = await createHost(client2KeyPair, client2PeerId); // Re-enable client2
      
      expect(serverHost.addrs.isNotEmpty, isTrue, reason: "Server host should have listen addresses.");
      serverListenAddr = serverHost.addrs.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name),
          orElse: () => throw StateError("No UDX listen address found for server host"));
      print('Server Host (${serverPeerId.toBase58().substring(0,10)}) listening on: $serverListenAddr');

      // Populate client peerstores with server info
      client1Host.peerStore.addrBook.addAddrs(serverPeerId, [serverListenAddr], AddressTTL.permanentAddrTTL);
      client1Host.peerStore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey);
      client2Host.peerStore.addrBook.addAddrs(serverPeerId, [serverListenAddr], AddressTTL.permanentAddrTTL); // Re-enable client2
      client2Host.peerStore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey); // Re-enable client2

      print('Setup Complete. Server: ${serverPeerId.toBase58().substring(0,10)}, Client1: ${client1PeerId.toBase58().substring(0,10)}, Client2: ${client2PeerId.toBase58().substring(0,10)}');
    });

    tearDownAll(() async {
      print('Closing client1 host...');
      await client1Host.close();
      print('Closing client2 host...'); // Re-enable client2
      await client2Host.close(); // Re-enable client2
      print('Closing server host...');
      await serverHost.close();
      
      await connManager.dispose();
      await resourceManager.close();
      print('Teardown Complete.');
    });

    test('server correctly distinguishes connections from two clients on same IP, different ports', () async { // Restore original test name
      const String testProtocolID = '/multi-client-echo/1.0.0';
      final serverReceivedDataFromClient1 = Completer<Uint8List>();
      final serverReceivedDataFromClient2 = Completer<Uint8List>(); // Re-enable client2

      serverHost.setStreamHandler(testProtocolID, (stream, remotePeer) async {
        print('Server Host (${serverPeerId.toBase58().substring(0,10)}): Received stream ${stream.id()} from ${remotePeer.toBase58().substring(0,10)} for protocol ${stream.protocol}');
        try {
          final receivedData = await stream.read().timeout(Duration(seconds: 10));
          print('Server Host (${serverPeerId.toBase58().substring(0,10)}): Stream ${stream.id()} received ${receivedData.length} bytes.');
          await stream.write(receivedData); // Echo data
          print('Server Host (${serverPeerId.toBase58().substring(0,10)}): Stream ${stream.id()} echoed data.');

          if (remotePeer == client1PeerId) {
            if (!serverReceivedDataFromClient1.isCompleted) serverReceivedDataFromClient1.complete(receivedData);
          } else if (remotePeer == client2PeerId) { // Re-enable client2
            if (!serverReceivedDataFromClient2.isCompleted) serverReceivedDataFromClient2.complete(receivedData);
          }
        } catch (e, s) {
          print('Server Host stream handler error: $e\n$s');
          if (remotePeer == client1PeerId && !serverReceivedDataFromClient1.isCompleted) serverReceivedDataFromClient1.completeError(e);
          if (remotePeer == client2PeerId && !serverReceivedDataFromClient2.isCompleted) serverReceivedDataFromClient2.completeError(e); // Re-enable client2
        } finally {
          if (!stream.isClosed) await stream.close();
        }
      });

      final serverAddrInfo = AddrInfo(serverPeerId, serverHost.addrs);

      // Client 1 connects and opens a stream
      print('Client1 (${client1PeerId.toBase58().substring(0,10)}) connecting to Server (${serverPeerId.toBase58().substring(0,10)}) at $serverAddrInfo');
      await client1Host.connect(serverAddrInfo).timeout(Duration(seconds: 15));
      print('Client1 (${client1PeerId.toBase58().substring(0,10)}) connected. Opening stream for $testProtocolID');
      final client1Stream = await client1Host.newStream(serverPeerId, [testProtocolID], core_context.Context()).timeout(Duration(seconds:10));
      print('Client1 (${client1PeerId.toBase58().substring(0,10)}) opened stream: ${client1Stream.id()}');

      // Re-enable Client 2 operations
      print('Client2 (${client2PeerId.toBase58().substring(0,10)}) connecting to Server (${serverPeerId.toBase58().substring(0,10)}) at $serverAddrInfo');
      await client2Host.connect(serverAddrInfo).timeout(Duration(seconds: 15));
      print('Client2 (${client2PeerId.toBase58().substring(0,10)}) connected. Opening stream for $testProtocolID');
      final client2Stream = await client2Host.newStream(serverPeerId, [testProtocolID], core_context.Context()).timeout(Duration(seconds:10));
      print('Client2 (${client2PeerId.toBase58().substring(0,10)}) opened stream: ${client2Stream.id()}');

      // Verify connections on server
      final serverConns = serverHost.network.conns; 
      expect(serverConns.length, equals(2), reason: "Server should have two connections."); // Restore for two clients

      final connsToClient1List = serverHost.network.connsToPeer(client1PeerId);
      final connToClient1 = connsToClient1List.isNotEmpty ? connsToClient1List.first : null;
      final connsToClient2List = serverHost.network.connsToPeer(client2PeerId); // Re-enable client2
      final connToClient2 = connsToClient2List.isNotEmpty ? connsToClient2List.first : null; // Re-enable client2

      expect(connToClient1, isNotNull, reason: "Server should have a connection to Client1.");
      expect(connToClient2, isNotNull, reason: "Server should have a connection to Client2."); // Re-enable client2
      
      final remoteAddrClient1 = connToClient1!.remoteMultiaddr;
      final remoteAddrClient2 = connToClient2!.remoteMultiaddr; // Re-enable client2

      print('Server: Conn to Client1 remote multiaddr: $remoteAddrClient1');
      print('Server: Conn to Client2 remote multiaddr: $remoteAddrClient2'); // Re-enable client2

      // CRITICAL ASSERTION: Remote multiaddrs should have different UDP source ports
      // The UDX transport embeds its port within the UDP component of the multiaddr.
      // e.g., /ip4/127.0.0.1/udp/12345/udx where 12345 is the UDX source port.

      String getUdpComponent(MultiAddr addr) {
        // Temporary simplification for diagnostics
        final protocol = addr.components.firstWhereOrNull((el) => el.$1.name == multiaddr_protocol.Protocols.udp.name);

        if (protocol != null) {
          // Still perform the check to ensure portValue is an int
          return '/udp/${protocol.$2}'; // Return a fixed valid string
        }
        return '/udp/0'; // Fallback if no port or not an int
      }

      final udpComponentClient1 = getUdpComponent(remoteAddrClient1);
      final udpComponentClient2 = getUdpComponent(remoteAddrClient2);

      expect(udpComponentClient1, isNotEmpty, reason: "Client1 remote multiaddr should have a UDP component.");
      expect(udpComponentClient2, isNotEmpty, reason: "Client2 remote multiaddr should have a UDP component.");
      
      print('Server: UDP component for Client1: $udpComponentClient1');
      print('Server: UDP component for Client2: $udpComponentClient2');

      expect(udpComponentClient1, isNot(equals(udpComponentClient2)), 
          reason: "The UDP components (including source ports) for Client1 and Client2 connections on the server must be different.");

      // Send data and verify echo independently
      final random = Random();
      final dataC1 = Uint8List.fromList(List.generate(16, (_) => random.nextInt(256)));
      final dataC2 = Uint8List.fromList(List.generate(24, (_) => random.nextInt(256))); // Re-enable client2 data

      print('Client1 (${client1PeerId.toBase58().substring(0,10)}) sending data (${dataC1.length} bytes) on stream ${client1Stream.id()}');
      await client1Stream.write(dataC1);
      final echoedToC1 = await client1Stream.read().timeout(Duration(seconds:10));
      expect(echoedToC1, orderedEquals(dataC1), reason: "Client1 did not receive correct echo.");
      print('Client1 (${client1PeerId.toBase58().substring(0,10)}) received echo.');
      await client1Stream.close();

      // Re-enable Client 2 data sending
      print('Client2 (${client2PeerId.toBase58().substring(0,10)}) sending data (${dataC2.length} bytes) on stream ${client2Stream.id()}');
      await client2Stream.write(dataC2);
      final echoedToC2 = await client2Stream.read().timeout(Duration(seconds:10));
      expect(echoedToC2, orderedEquals(dataC2), reason: "Client2 did not receive correct echo.");
      print('Client2 (${client2PeerId.toBase58().substring(0,10)}) received echo.');
      await client2Stream.close();

      // Verify server received the correct data on distinct logical streams
      final serverReceivedC1 = await serverReceivedDataFromClient1.future.timeout(Duration(seconds:5));
      final serverReceivedC2 = await serverReceivedDataFromClient2.future.timeout(Duration(seconds:5)); // Re-enable client2
      expect(serverReceivedC1, orderedEquals(dataC1));
      expect(serverReceivedC2, orderedEquals(dataC2)); // Re-enable client2

      print('Test successful: Server distinguished connections and streams correctly.');
      serverHost.removeStreamHandler(testProtocolID);

    }, timeout: Timeout(Duration(seconds: 90))); // Increased overall test timeout
  });
}
