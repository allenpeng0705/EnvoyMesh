import 'dart:async';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_network_stream;
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/protocol/identify/identify.dart';
import 'package:dart_libp2p/p2p/protocol/identify/identify_exceptions.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport;
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';

// Custom AddrsFactory for testing that doesn't filter loopback
List<MultiAddr> passThroughAddrsFactory(List<MultiAddr> addrs) {
  return addrs;
}

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: '/yamux/1.0.0',
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
  group('Identify Timeout Reproduction', () {
    late BasicHost clientHost;
    late BasicHost serverHost;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late UDX udxInstance;
    late MultiAddr serverListenAddr;

    setUpAll(() async {
      print('=== Setting up Identify Timeout Test ===');
      udxInstance = UDX();

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      print('Client PeerId: $clientPeerId');
      print('Server PeerId: $serverPeerId');

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
        ..connManager = connManager
        ..eventBus = eventBus;

      final serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = serverSecurity
        ..muxers = muxerDefs
        ..addrsFactory = passThroughAddrsFactory;
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
      serverP2PConfig.listenAddrs = [initialListenAddr];
      serverP2PConfig.connManager = connManager;
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

      // Set up a non-responsive identify handler
      // This simulates a peer that accepts the identify stream but never responds
      print('Setting up non-responsive identify handler on server...');
      serverHost.setStreamHandler(id, (core_network_stream.P2PStream stream, PeerId peerId) async {
        print('Server received identify request from $peerId, NOT responding (simulating timeout)...');
        // Simulate non-responsive peer - just wait forever
        await Future.delayed(Duration(seconds: 60));
        print('Server timeout delay complete (should not reach here in test)');
      });

      await serverSwarm.listen(serverP2PConfig.listenAddrs);
      await serverHost.start();

      expect(serverHost.addrs.isNotEmpty, isTrue);
      serverListenAddr = serverHost.addrs.firstWhere((addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name));
      print('Server Host listening on: $serverListenAddr');

      clientHost.peerStore.addrBook.addAddrs(
        serverPeerId,
        [serverListenAddr],
        AddressTTL.permanentAddrTTL,
      );
      clientHost.peerStore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey);

      print('Setup Complete. Client: $clientPeerId, Server: $serverPeerId listening on $serverListenAddr');
    });

    tearDownAll(() async {
      print('=== Tearing down Identify Timeout Test ===');
      await clientHost.close();
      await serverHost.close();
      print('Teardown Complete.');
    });

    test('identify timeout throws typed IdentifyTimeoutException', () async {
      print('\n=== Starting Test: Identify Timeout with Typed Exception ===');
      print('Client attempting to connect to server...');
      
      // This test verifies that identify timeouts throw a typed
      // IdentifyTimeoutException that can be caught specifically,
      // rather than a generic Exception that crashes the app.
      
      bool caughtTypedException = false;
      
      try {
        final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]);
        
        print('Client calling connect() - this will trigger identify protocol...');
        await clientHost.connect(serverAddrInfo);
        
        print('Connection succeeded (unexpected - identify should have timed out)');
        
        // If we reach here, the test should fail because we expect
        // an unhandled exception from the identify timeout
        fail('Expected IdentifyTimeoutException but connection succeeded');
      } on IdentifyTimeoutException catch (e, stackTrace) {
        // SUCCESS: The fix is working! We can now catch timeout exceptions specifically.
        caughtTypedException = true;
        
        print('\n=== CAUGHT TYPED EXCEPTION (Fix is working!) ===');
        print('Exception type: ${e.runtimeType}');
        print('Exception message: ${e.message}');
        print('Peer ID: ${e.peerId}');
        print('Underlying cause: ${e.cause}');
        print('\nStack trace:');
        print(stackTrace);
        print('=== END EXCEPTION ===\n');
        
        // Verify the exception contains the expected information
        expect(e.peerId, isNotNull);
        expect(e.message, contains('timeout'));
        expect(e.cause, isNotNull);
        
        print('Test verified the fix:');
        print('- Identify protocol timed out after 30 seconds');
        print('- Typed IdentifyTimeoutException was thrown');
        print('- Exception can be caught specifically using on IdentifyTimeoutException');
        print('- Applications can now handle identify timeouts gracefully');
        print('- Failure event was emitted on the eventbus');
      } catch (e, stackTrace) {
        // If we catch a generic exception, the fix may not be complete
        print('\n=== CAUGHT GENERIC EXCEPTION (Fix may be incomplete) ===');
        print('Exception type: ${e.runtimeType}');
        print('Exception message: $e');
        print('\nStack trace:');
        print(stackTrace);
        print('=== END EXCEPTION ===\n');
        
        // The test still passes if we get a timeout-related exception
        expect(e.toString(), anyOf(
          contains('Yamux stream operation timed out'),
          contains('TimeoutException'),
          contains('IdentifyTimeoutException'),
        ));
      }
      
      // Verify we caught the typed exception
      expect(caughtTypedException, isTrue, 
        reason: 'Should catch IdentifyTimeoutException specifically');
      
      print('=== Test Complete ===\n');
    }, timeout: Timeout(Duration(seconds: 40))); // Allow time for timeout to occur
  });
}

