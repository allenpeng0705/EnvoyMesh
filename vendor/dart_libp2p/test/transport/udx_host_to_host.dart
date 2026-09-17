
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:logging/logging.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart'; // For Connectedness
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
// import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types; // No longer directly used for accept/openStream on MuxedConn
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as core_peer_id_lib; // Aliased to avoid conflict
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
// import 'package:dart_libp2p/p2p/protocol/ping/ping.dart'; // Ping protocol not directly used, raw stream test
import 'package:dart_libp2p/config/config.dart' as p2p_config;
// import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart'; // Not directly used
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
// import 'package:dart_libp2p/p2p/transport/listener.dart'; // Not directly used
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
// import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart'; // YamuxStream not directly used
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
import 'package:dart_libp2p/core/peerstore.dart'; // For AddressTTL, Peerstore
import 'package:dart_libp2p/core/host/host.dart'; // For Host interface
import 'package:dart_libp2p/core/network/network.dart'; // For Network interface
// import 'package:dart_libp2p/core/network/notifiee.dart'; // TestNotifiee removed


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

// TestNotifiee removed as BasicHost stream handling is preferred for this test

void main() {
  // Setup logging
  Logger.root.level = Level.ALL; // Capture all log levels
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
    if (record.error != null) {
      print('ERROR: ${record.error}');
    }
    if (record.stackTrace != null) {
      print('STACKTRACE: ${record.stackTrace}');
    }
  });




  group('Host-to-Host UDX, Noise, Yamux, Ping (via BasicHost)', () {
    late BasicHost clientHost;
    late BasicHost serverHost;
    late Swarm clientNetwork; // Swarm acting as the Network layer for clientHost
    late Swarm serverNetwork; // Swarm acting as the Network layer for serverHost
    late core_peer_id_lib.PeerId clientPeerId;
    late core_peer_id_lib.PeerId serverPeerId;
    late KeyPair clientKeyPair; // Reverted to KeyPair from core/crypto/keys.dart
    late KeyPair serverKeyPair; // Reverted to KeyPair from core/crypto/keys.dart
    late UDX udxInstance;
    late MultiAddr serverListenAddr;
    late ResourceManagerImpl resourceManager;
    late p2p_transport.ConnectionManager connManager; // Shared connection manager for transports
    late EventBus hostEventBus; // Shared event bus for hosts

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = p2p_transport.ConnectionManager();
      hostEventBus = BasicBus(); // Event bus for BasicHost instances

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await core_peer_id_lib.PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await core_peer_id_lib.PeerId.fromPublicKey(serverKeyPair.publicKey);

      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration.zero, // Attempt to disable keepalives
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

      // Peerstores
      final clientPeerstore = MemoryPeerstore();
      final serverPeerstore = MemoryPeerstore();

      // Transports
      final clientUdxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      final serverUdxTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);

      // Upgraders (only take resourceManager)
      final clientUpgrader = BasicUpgrader(resourceManager: resourceManager);
      final serverUpgrader = BasicUpgrader(resourceManager: resourceManager);
      
      // Config for Swarm (Network layer)
      // Note: Swarm's eventBus is distinct from Host's eventBus for this setup,
      // or could be the same if events need to be shared at that level.
      // For now, using separate BasicBus for Swarm's internal events.
      final clientSwarmConfig = p2p_config.Config()
        ..peerKey = clientKeyPair // Used by Swarm if upgrader doesn't handle keys
        ..connManager = connManager 
        ..eventBus = BasicBus() // Swarm's own event bus
        ..addrsFactory = passThroughAddrsFactory
        ..securityProtocols = clientSecurity // CRITICAL: Upgrader uses Swarm's config
        ..muxers = muxerDefs; // CRITICAL: Upgrader uses Swarm's config

      final initialListen = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      final serverSwarmConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..listenAddrs = [initialListen]
        ..connManager = connManager
        ..eventBus = BasicBus() // Swarm's own event bus
        ..addrsFactory = passThroughAddrsFactory
        ..securityProtocols = serverSecurity // CRITICAL: Upgrader uses Swarm's config
        ..muxers = muxerDefs; // CRITICAL: Upgrader uses Swarm's config

      // Client Network (Swarm)
      clientNetwork = Swarm(
        host: null, // Explicitly null if Swarm's host is optional
        localPeer: clientPeerId,
        peerstore: clientPeerstore,
        upgrader: clientUpgrader,
        config: clientSwarmConfig,
        transports: [clientUdxTransport],
        resourceManager: resourceManager,
      );

      // Server Network (Swarm)
      serverNetwork = Swarm(
        host: null, // Explicitly null if Swarm's host is optional
        localPeer: serverPeerId,
        peerstore: serverPeerstore,
        upgrader: serverUpgrader,
        config: serverSwarmConfig,
        transports: [serverUdxTransport],
        resourceManager: resourceManager,
      );
      
      // Config for Client Host
      final clientHostConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..eventBus = hostEventBus // Shared event bus for hosts
        ..connManager = connManager // Shared connManager
        ..addrsFactory = passThroughAddrsFactory // For BasicHost.addrs getter
        ..negotiationTimeout = Duration(seconds: 20) // For BasicHost protocol negotiation
        ..identifyUserAgent = "dart-libp2p-test-client/1.0"
        ..muxers = muxerDefs // For BasicHost to potentially pass to services it starts
        ..securityProtocols = clientSecurity; // For BasicHost to potentially pass to services

      clientHost = await BasicHost.create(
        network: clientNetwork,
        config: clientHostConfig,
      );
      clientNetwork.setHost(clientHost); // Link Swarm back to its Host

      // Config for Server Host
      final serverHostConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..eventBus = hostEventBus
        ..connManager = connManager
        ..addrsFactory = passThroughAddrsFactory
        ..negotiationTimeout = Duration(seconds: 20)
        ..identifyUserAgent = "dart-libp2p-test-server/1.0"
        ..listenAddrs = [initialListen] // For BasicHost to know its intended listen addrs
        ..muxers = muxerDefs
        ..securityProtocols = serverSecurity;

      serverHost = await BasicHost.create(
        network: serverNetwork,
        config: serverHostConfig,
      );
      serverNetwork.setHost(serverHost); // Link Swarm back to its Host

      // Start the hosts (this will start their services, including Identify)
      await clientHost.start();
      await serverHost.start();

      await serverNetwork.listen(serverSwarmConfig.listenAddrs); // Call on Swarm instance
      expect(serverHost.addrs.isNotEmpty, isTrue, reason: "Server host should have listen addresses."); // Use getter
      serverListenAddr = serverHost.addrs.firstWhere( // Use getter
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name),
          orElse: () => throw StateError("No UDX listen address found for server host"));
      print('Server Host (via Network) listening on: $serverListenAddr');

      await clientHost.peerStore.addrBook.addAddrs( // Use peerStore getter
          serverPeerId, [serverListenAddr], AddressTTL.permanentAddrTTL);
      clientHost.peerStore.keyBook.addPubKey( // Use peerStore getter
          serverPeerId, serverKeyPair.publicKey);

      print('Host-to-Host Setup Complete. Client: ${clientPeerId.toString()}, Server: ${serverPeerId.toString()} listening on $serverListenAddr');
    });

    tearDownAll(() async {
      print('Closing client host...');
      await clientHost.close(); // Should also close clientNetwork
      print('Closing server host...');
      await serverHost.close(); // Should also close serverNetwork
      
      // These are shared resources; UDXTransport.close() (called by Swarm.close())
      // does not dispose them.
      await connManager.dispose();
      await resourceManager.close();
      // udxInstance.dispose() if available and needed.
      print('Host-to-Host Teardown Complete.');
    });

    test('should establish connection, open streams, and ping between BasicHosts', () async {
      const String testProtocolID = '/test-ping/1.0.0';
      Completer<core_network_stream.P2PStream> serverStreamCompleter = Completer();
      Completer<void> serverHandlerFinishedProcessing = Completer();

      print('Server Host (${serverPeerId.toString()}) setting stream handler for $testProtocolID');
      serverHost.setStreamHandler(testProtocolID, (stream, remotePeer) async { // Correct handler signature
        print('Server Host received stream: ${stream.id()} from $remotePeer for protocol ${stream.protocol}');
        if (!serverStreamCompleter.isCompleted) {
          serverStreamCompleter.complete(stream);
        } else {
           print('Server Host: Warning - stream handler called multiple times for $testProtocolID');
           if (!stream.isClosed) await stream.reset(); // Avoid resource leak if unexpected stream
           if (!serverHandlerFinishedProcessing.isCompleted) serverHandlerFinishedProcessing.completeError(StateError("Duplicate stream"));
           return;
        }

        try {
          final receivedData = await stream.read().timeout(Duration(seconds: 5));
          print('Server Host received ${receivedData.length} bytes on stream ${stream.id()}');
          await stream.write(receivedData); // Echo data
          print('Server Host echoed data on stream ${stream.id()}');
        } catch (e, s) {
          print('Server Host stream handler error: $e\n$s');
          if (!serverHandlerFinishedProcessing.isCompleted) serverHandlerFinishedProcessing.completeError(e);
        } finally {
          if (!stream.isClosed) await stream.close(); // Close server-side of stream
          print('Server Host closed stream ${stream.id()}');
          if (!serverHandlerFinishedProcessing.isCompleted) serverHandlerFinishedProcessing.complete();
        }
      });

      final serverAddrInfo = AddrInfo(serverPeerId, serverHost.addrs); // Positional arguments, use getter for addrs
      print('Client Host (${clientPeerId.toString()}) connecting to Server Host (${serverPeerId.toString()}) at $serverAddrInfo');
      
      // Connect ensures the network layer attempts to establish a connection.
      // newStream will then use this connection or establish it if not ready.
      await clientHost.connect(serverAddrInfo).timeout(Duration(seconds:30), onTimeout: () { // Increased timeout further
        throw TimeoutException('Client host connect timed out');
      });
      print('Client Host connect call completed for ${serverPeerId.toString()}');

      // Verify connection from client's perspective (optional, newStream is the real test)
      expect(clientNetwork.connsToPeer(serverPeerId).isNotEmpty, isTrue, // Correct method name
          reason: "Client should have a connection to server after connect()");

      print('Client Host (${clientPeerId.toString()}) opening new stream to ${serverPeerId.toString()} for $testProtocolID');
      final clientStream = await clientHost.newStream(
        serverPeerId, // First argument is PeerId
        [testProtocolID], // Second argument is List<ProtocolID>
        core_context.Context(), // Third argument is Context
      ).timeout(Duration(seconds:15), onTimeout: () { // Increased timeout
        throw TimeoutException('Client host newStream timed out');
      });
      print('Client Host opened stream: ${clientStream.id()} to ${clientStream.conn.remotePeer} for protocol ${clientStream.protocol}');

      final serverStream = await serverStreamCompleter.future.timeout(Duration(seconds: 15), onTimeout: () { // Increased timeout
        throw TimeoutException('Server did not receive stream in time');
      });
      print('Server Host got stream from completer: ${serverStream.id()}');

      expect(clientStream.protocol(), testProtocolID);
      expect(serverStream.protocol(), testProtocolID);

      final random = Random();
      final pingData = Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));

      print('Client Host sending ping data (${pingData.length} bytes) over stream ${clientStream.id()}');
      await clientStream.write(pingData);
      print('Client Host ping data sent.');

      // Server handler reads and echoes, then completes serverHandlerFinishedProcessing

      final echoedToClient = await clientStream.read().timeout(Duration(seconds: 15), onTimeout: () { // Increased timeout
         throw TimeoutException('Client did not receive echo in time');
      });
      print('Client Host received ${echoedToClient.length} echoed data over stream ${clientStream.id()}');
      expect(echoedToClient, orderedEquals(pingData));

      print('Host-to-Host Ping successful.');

      await clientStream.close(); // Close client-side of stream
      print('Client Host closed stream ${clientStream.id()}');
      
      await serverHandlerFinishedProcessing.future.timeout(Duration(seconds:15), onTimeout: () { // Increased timeout
        throw TimeoutException('Server handler did not finish processing in time');
      });
      print('Server Host handler finished processing.');

      serverHost.removeStreamHandler(testProtocolID);
      print('Server Host removed stream handler for $testProtocolID');

    }, timeout: Timeout(Duration(seconds: 60))); // Increased overall test timeout
  });
}
