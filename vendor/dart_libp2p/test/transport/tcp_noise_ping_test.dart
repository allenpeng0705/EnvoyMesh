import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
// import 'package:dart_libp2p/core/host/host.dart'; // For Context (though we use core.Context) - Not directly used
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types; // Aliased import
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart'; // For MultiplexerConfig
import 'package:dart_libp2p/config/stream_muxer.dart'; // For StreamMuxer base class
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart'; // Changed from UDXTransport
import 'package:test/test.dart';

// Helper class for providing YamuxMuxer to the config (remains the same)
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
  group('TCPTransport with Noise and Ping Integration Test', () { // Changed group description
    late TCPTransport clientTransport; // Changed from UDXTransport
    late TCPTransport serverTransport; // Changed from UDXTransport
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
    // late UDX udxInstance; // Removed UDX specific instance
    late ResourceManager resourceManager;
    late NullConnMgr connManager;

    setUpAll(() async {
      // udxInstance = UDX(); // Removed UDX specific instance
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

      // Changed to TCPTransport, removed udxInstance
      clientTransport = TCPTransport(connManager: connManager, resourceManager: resourceManager);
      serverTransport = TCPTransport(connManager: connManager, resourceManager: resourceManager);

      clientUpgrader = BasicUpgrader(resourceManager: resourceManager);
      serverUpgrader = BasicUpgrader(resourceManager: resourceManager);
    });

    tearDownAll(() async {
      await clientTransport.dispose();
      await serverTransport.dispose();
    });

    test('should establish TCP connection, upgrade to Noise/Yamux, and perform ping', () async { // Changed test description
      // 1. Server Listen
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/tcp/0'); // Changed to TCP
      listener = await serverTransport.listen(initialListenAddr);
      actualListenAddr = listener.addr;
      print('Server listening on: $actualListenAddr');

      // 2. Concurrently Dial and Accept Raw Connections
      late TransportConn clientRawConn;
      late TransportConn serverRawConn;

      final serverAcceptFuture = listener.accept().then((conn) {
        if (conn == null) throw Exception("Listener accepted null connection");
        serverRawConn = conn;
        print('Server accepted raw connection: ${serverRawConn.id}');
        return serverRawConn;
      });

      final clientDialFuture = clientTransport.dial(actualListenAddr).then((conn) {
        clientRawConn = conn;
        print('Client dialed raw connection: ${clientRawConn.id}');
        return clientRawConn;
      });

      await Future.wait([clientDialFuture, serverAcceptFuture]);
      expect(clientRawConn, isNotNull);
      expect(serverRawConn, isNotNull);

      // 3. Upgrade Connections
      print('Upgrading client connection outbound...');
      final clientUpgradedFuture = clientUpgrader.upgradeOutbound(
        connection: clientRawConn,
        remotePeerId: serverPeerId,
        config: clientP2PConfig,
        remoteAddr: actualListenAddr,
      );
      print('Upgrading server connection inbound...');
      final serverUpgradedFuture = serverUpgrader.upgradeInbound(
        connection: serverRawConn,
        config: serverP2PConfig,
      );

      final List<Conn> upgradedConns = await Future.wait([clientUpgradedFuture, serverUpgradedFuture]);
      final Conn clientUpgradedConn = upgradedConns[0];
      final Conn serverUpgradedConn = upgradedConns[1];

      print('Client upgraded. Remote peer: ${clientUpgradedConn.remotePeer}, Security: ${clientUpgradedConn.state.security}, Muxer: ${clientUpgradedConn.state.streamMultiplexer}');
      print('Server upgraded. Remote peer: ${serverUpgradedConn.remotePeer}, Security: ${serverUpgradedConn.state.security}, Muxer: ${serverUpgradedConn.state.streamMultiplexer}');

      expect(clientUpgradedConn.remotePeer.toString(), serverPeerId.toString());
      expect(serverUpgradedConn.remotePeer.toString(), clientPeerId.toString());
      expect(clientUpgradedConn.state.security, contains('noise'));
      expect(serverUpgradedConn.state.security, contains('noise'));
      expect(clientUpgradedConn.state.streamMultiplexer, contains('yamux'));
      expect(serverUpgradedConn.state.streamMultiplexer, contains('yamux'));

      // 4. Open/Accept Stream for Ping
      late YamuxStream clientStream;
      late YamuxStream serverStream;

      final serverAcceptStreamFuture = (serverUpgradedConn as core_mux_types.MuxedConn).acceptStream().then((stream) { 
        serverStream = stream as YamuxStream;
        print('Server accepted stream: ${serverStream.id()}'); 
        return serverStream;
      });

      await Future.delayed(Duration(milliseconds: 100));

      clientStream = await (clientUpgradedConn as core_mux_types.MuxedConn).openStream(core_context.Context()) as YamuxStream; 
      print('Client opened stream: ${clientStream.id()}'); 
      
      await serverAcceptStreamFuture;

      expect(clientStream, isNotNull);
      expect(serverStream, isNotNull);

      await clientStream.setProtocol(PingConstants.protocolId); 

      // 5. Perform Ping Manually
      final random = Random();
      final pingData = Uint8List.fromList(List.generate(32, (_) => random.nextInt(256)));
      print('Client sending ping data (${pingData.length} bytes) on stream ${clientStream.id()}');

      await clientStream.write(pingData);
      print('Client ping data sent.');

      final receivedOnServer = await serverStream.read(); 
      print('Server received data (${receivedOnServer.length} bytes) on stream ${serverStream.id()}');
      expect(receivedOnServer, orderedEquals(pingData));

      print('Server echoing data back on stream ${serverStream.id()}');
      await serverStream.write(receivedOnServer);
      print('Server data echoed.');

      final echoedToClient = await clientStream.read(); 
      print('Client received echoed data (${echoedToClient.length} bytes) on stream ${clientStream.id()}');
      expect(echoedToClient, orderedEquals(pingData));
      print('Ping successful.');

      // 6. Close Streams and Connections
      print('Closing client stream ${clientStream.id()}');
      await clientStream.close();
      print('Closing server stream ${serverStream.id()}');
      await serverStream.close();

      print('Closing client upgraded connection ${clientUpgradedConn.id}');
      await clientUpgradedConn.close();
      print('Closing server upgraded connection ${serverUpgradedConn.id}');
      await serverUpgradedConn.close();

      expect(clientRawConn.isClosed, isTrue, reason: "Client raw connection should be closed by upgrader/muxer");
      expect(serverRawConn.isClosed, isTrue, reason: "Server raw connection should be closed by upgrader/muxer");
      
      print('Closing listener');
      await listener.close();
      expect(listener.isClosed, isTrue);

      print('Test completed successfully.');
    }, timeout: Timeout(Duration(seconds: 20)));
  });
}
