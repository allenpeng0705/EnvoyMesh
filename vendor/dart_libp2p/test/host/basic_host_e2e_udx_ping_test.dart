import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart'; // Provides PeerId
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context; // Added for Context


import 'package:dart_libp2p/p2p/protocol/ping/ping.dart'; // This provides PingConstants and PingService
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';

import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;


  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: YamuxConstants.protocolId,
          muxerFactory: (Conn secureConn, bool isClient) {
            // YamuxSession.protocolId is a static const, should be fine.
            if (secureConn is! TransportConn) {
              throw ArgumentError(
                  'YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
            }
            return YamuxSession(secureConn, yamuxConfig, isClient);
          },
        );
}

void main() {
  group('BasicHost E2E UDX Noise Ping Test', () {
    late BasicHost clientHost;
    late BasicHost serverHost;
    late UDX udxInstance;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late KeyPair clientKeyPair;
    late KeyPair serverKeyPair;
    late MultiAddr serverListenAddr;

    setUpAll(() async {
      udxInstance = UDX(); // Shared UDX instance for this test group

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final yamuxMultiplexerConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024, // 1MB
        initialStreamWindowSize: 256 * 1024, // 256KB
        streamWriteTimeout: Duration(seconds: 10), // Reverted to original 10s
        maxStreams: 256,
      );
      final muxerDef = _TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig);
      
      // Create ConnectionManagers beforehand
      final clientConnMgr = ConnectionManager();
      final serverConnMgr = ConnectionManager();

      // Client Configuration
      final clientConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = [await NoiseSecurity.create(clientKeyPair)]
        ..muxers = [muxerDef]
        ..transports = [
          UDXTransport(
            connManager: clientConnMgr, // Use pre-created ConnManager
            udxInstance: udxInstance,
          )
        ]
        ..connManager = clientConnMgr // Assign pre-created ConnManager
        ..addrsFactory = (addrs) => addrs; // Allow loopback for testing

      // Server Configuration
      final serverConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..listenAddrs = [MultiAddr('/ip4/127.0.0.1/udp/0/udx')]
        ..securityProtocols = [await NoiseSecurity.create(serverKeyPair)]
        ..muxers = [muxerDef]
        ..transports = [
          UDXTransport(
            connManager: serverConnMgr, // Use pre-created ConnManager
            udxInstance: udxInstance,
          )
        ]
        ..connManager = serverConnMgr // Assign pre-created ConnManager
        ..addrsFactory = (addrs) => addrs; // Allow loopback for testing

      // Use Config.newNode() to create hosts
      clientHost = await clientConfig.newNode() as BasicHost;
      serverHost = await serverConfig.newNode() as BasicHost;
      
      // Start server first - BasicHost.start() is called by newNode if listenAddrs are present
      // For serverHost, newNode should have started listening.
      // For clientHost, we might need to call start explicitly if newNode doesn't.
      // However, BasicHost's start() is more about starting services like Identify, Relay, etc.
      // The network listening part is handled by Network.listen().
      // Config.newNode() calls _startListening which calls host.addrs.add().
      // This doesn't directly translate to Network.listen().
      // Let's assume BasicHost's constructor or an internal part of newNode's _createNetwork
      // or _createHost handles starting the network listening if listenAddrs are provided.
      // The `BasicHost.start()` method is for starting its own services.
      
      // The `newNode` method in `Config` calls `_startListening` which just adds to `host.addrs`.
      // The actual listening is typically initiated by `Network.listen(Multiaddr)`.
      // `BasicHost` itself doesn't directly call `_network.listen()`.
      // This implies `Network` (Swarm) must be started/told to listen.
      // Let's assume `BasicHost.start()` will ensure its network is listening.
      // Or, more accurately, `Network.listen` is called by `Swarm.listen` which is part of `Swarm.start`.
      // `BasicHost` constructor receives an already constructed (and possibly started) Network.
      // The `Config.newNode` path is a bit complex.
      // For this test, let's ensure `BasicHost.start()` is called.
      // `BasicHost.start()` will start its internal services (ID, Ping etc.)

      await serverHost.start(); // Start server host services
      print('Server Host services started. Listening on: ${serverHost.addrs}');
      if (serverHost.addrs.isEmpty) {
        throw Exception('Server host failed to listen on any address.');
      }
      serverListenAddr = serverHost.addrs.firstWhere(
        (addr) => addr.toString().contains('/udx'),
        orElse: () => throw Exception('Server did not listen on a UDX address.'),
      );
      print('Server Host UDX Listen Address: $serverListenAddr');

      // Set stream handler on server for Ping protocol
      serverHost.setStreamHandler(PingConstants.protocolId, (P2PStream stream, PeerId remotePeer) async {
        print('Server Host: Received stream for protocol ${stream.protocol} from $remotePeer');
        try {
          final data = await stream.read();
          print('Server Host: Read ${data.length} bytes from $remotePeer, echoing back.');
          await stream.write(data);
          await stream.closeWrite(); // Close write side after echoing
          print('Server Host: Echo sent to $remotePeer, stream write closed.');
        } catch (e, s) {
          print('Server Host: Error in stream handler with $remotePeer: $e\n$s');
          await stream.reset();
        }
      });
      
      await clientHost.start(); // Start client host services
      print('Client Host services started.');
    });

    tearDownAll(() async {
      print('Tearing down BasicHost E2E test...');
      await clientHost.close(); // Use close()
      print('Client host closed.');
      await serverHost.close(); // Use close()
      print('Server host closed.');
      // udxInstance does not have a dispose method in dart_udx
      print('BasicHost E2E test teardown complete.');
    });

    test('client connects to server, opens stream, and pings successfully', () async {
      print('Test: Attempting to connect client to server ($serverPeerId @ $serverListenAddr)');
      final serverAddrInfo = AddrInfo(serverPeerId, [serverListenAddr]);
      
      await clientHost.connect(serverAddrInfo, context: core_context.Context()); // Pass context
      print('Test: Client connected to server.');

      print('Test: Client opening new stream to server for protocol ${PingConstants.protocolId}');
      // Pass context to newStream
      final P2PStream stream = await clientHost.newStream(serverPeerId, [PingConstants.protocolId], core_context.Context());
      print('Test: Client stream opened with ID: ${stream.id()}, Protocol: ${stream.protocol()}');

      expect(stream.protocol(), PingConstants.protocolId); // This should be fine if PingConstants.protocolId is static const

      final random = Random();
      final pingData = Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));
      
      print('Test: Client writing ${pingData.length} bytes to stream ${stream.id()}');
      await stream.write(pingData);
      print('Test: Client data written. Closing write side of client stream.');
      await stream.closeWrite(); // Important to signal end of writing to the server

      print('Test: Client reading echoed data from stream ${stream.id()}');
      final echoedData = await stream.read();
      print('Test: Client received ${echoedData.length} bytes.');
      
      expect(echoedData, orderedEquals(pingData));
      print('Test: Ping data matches echoed data. Ping successful.');

      await stream.close(); // Fully close the stream
      print('Test: Client stream closed.');
    }, timeout: Timeout(Duration(seconds: 30))); // Increased timeout for network ops
  });
}
