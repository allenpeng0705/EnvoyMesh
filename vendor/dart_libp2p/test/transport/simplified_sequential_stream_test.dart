import 'dart:async';
import 'dart:typed_data';
import 'dart:convert'; // For utf8 encoding if needed for multistream

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // Added import for P2PStream
import 'package:dart_libp2p/core/network/mux.dart' as core_mux; // Added import for MuxedConn
import 'package:dart_libp2p/core/peer/peer_id.dart' as concrete_peer_id;
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart' as config_stream_muxer;
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart' as p2p_mux;
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';

import 'package:test/test.dart';
import 'package:logging/logging.dart';

void main() {
  // Setup logging
  hierarchicalLoggingEnabled = true;
  Logger.root.level = Level.INFO; // Start with INFO, can be changed to ALL for deep dive
  Logger('TCPConnection').level = Level.ALL; // Enable detailed TCP logs
  Logger('SecuredConnection').level = Level.ALL;
  Logger('YamuxSession').level = Level.ALL;
  Logger('YamuxStream').level = Level.ALL;
  Logger('multistream').level = Level.ALL;
  Logger('BasicUpgrader').level = Level.ALL;
  Logger('test').level = Level.ALL; // For test-specific logs

  Logger.root.onRecord.listen((record) {
    print('\${record.level.name}: \${record.time}: \${record.loggerName}: \${record.message}');
    if (record.error != null) {
      print('ERROR: \${record.error}');
    }
    if (record.stackTrace != null) {
      print('STACKTRACE: \${record.stackTrace}');
    }
  });

  final testLog = Logger('test');

  group('Simplified Sequential Stream Test (TCP -> Noise -> Yamux)', () {
    late TCPTransport clientTcpTransport;
    late TCPTransport serverTcpTransport;
    late ResourceManager resourceManager;
    late Listener serverListener;
    late MultiAddr serverListenAddr;
    
    late KeyPair clientKeyPair;
    late PeerId clientPeerId;
    late KeyPair serverKeyPair;
    late PeerId serverPeerId;

    late BasicUpgrader upgrader;
    late p2p_config.Config clientConfig;
    late p2p_config.Config serverConfig;

    TransportConn? rawClientConn;
    TransportConn? rawServerConn;
    Conn? upgradedClientConn;
    Conn? upgradedServerConn;

    setUp(() async {
      testLog.info('=== Test Setup Starting ===');
      resourceManager = NullResourceManager();
      final connManager = NullConnMgr(); // Not strictly needed for upgrader but TCPTransport takes it

      clientTcpTransport = TCPTransport(resourceManager: resourceManager, connManager: connManager);
      serverTcpTransport = TCPTransport(resourceManager: resourceManager, connManager: connManager);

      clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await concrete_peer_id.PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      serverPeerId = await concrete_peer_id.PeerId.fromPublicKey(serverKeyPair.publicKey);

      upgrader = BasicUpgrader(resourceManager: resourceManager);

      // Client Config
      clientConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = [await NoiseSecurity.create(clientKeyPair)]
        ..muxers = [
          config_stream_muxer.StreamMuxer(
            id: '/yamux/1.0.0',
            muxerFactory: (Conn secureConn, bool isClient) {
              final yamuxInternalConfig = p2p_mux.MultiplexerConfig(); // Default config
              return YamuxSession(secureConn as TransportConn, yamuxInternalConfig, isClient);
            }
          )
        ];

      // Server Config (similar, but with its own keypair)
      serverConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = [await NoiseSecurity.create(serverKeyPair)]
        ..muxers = [
          config_stream_muxer.StreamMuxer(
            id: '/yamux/1.0.0',
            muxerFactory: (Conn secureConn, bool isClient) {
              final yamuxInternalConfig = p2p_mux.MultiplexerConfig();
              return YamuxSession(secureConn as TransportConn, yamuxInternalConfig, isClient);
            }
          )
        ];
      
      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/tcp/0');
      serverListener = await serverTcpTransport.listen(initialListenAddr);
      serverListenAddr = serverListener.addr;
      testLog.info('Server listening on: \$serverListenAddr');

      final serverAcceptFuture = serverListener.accept();
      final clientDialFuture = clientTcpTransport.dial(serverListenAddr, timeout: Duration(seconds: 5));

      testLog.info('Waiting for raw TCP connection...');
      final results = await Future.wait([clientDialFuture, serverAcceptFuture]);
      rawClientConn = results[0];
      rawServerConn = results[1];
      testLog.info('Raw TCP connection established. Client: \${rawClientConn?.id}, Server: \${rawServerConn?.id}');

      expect(rawClientConn, isNotNull, reason: 'Raw client connection should be established.');
      expect(rawServerConn, isNotNull, reason: 'Raw server connection should be established.');

      // Upgrade connections
      testLog.info('Upgrading client connection outbound...');
      final clientUpgradeFuture = upgrader.upgradeOutbound(
        connection: rawClientConn!,
        remotePeerId: serverPeerId,
        config: clientConfig,
        remoteAddr: serverListenAddr,
      );
      testLog.info('Upgrading server connection inbound...');
      final serverUpgradeFuture = upgrader.upgradeInbound(
        connection: rawServerConn!,
        config: serverConfig,
      );

      final upgradedResults = await Future.wait([clientUpgradeFuture, serverUpgradeFuture]);
      upgradedClientConn = upgradedResults[0];
      upgradedServerConn = upgradedResults[1];
      testLog.info('Connections upgraded. Client: \${upgradedClientConn?.state.security}/\${upgradedClientConn?.state.streamMultiplexer}, Server: \${upgradedServerConn?.state.security}/\${upgradedServerConn?.state.streamMultiplexer}');
      
      expect(upgradedClientConn, isNotNull, reason: 'Upgraded client connection should not be null.');
      expect(upgradedServerConn, isNotNull, reason: 'Upgraded server connection should not be null.');
      await Future.delayed(Duration(milliseconds: 200)); // Allow Yamux sessions to fully init
      testLog.info('=== Test Setup Complete ===');
    });

    tearDown(() async {
      testLog.info('=== Test Teardown Starting ===');
      await upgradedClientConn?.close().catchError((e) => testLog.warning('Error closing upgradedClientConn: \$e'));
      await upgradedServerConn?.close().catchError((e) => testLog.warning('Error closing upgradedServerConn: \$e'));
      // Raw connections are closed by the upgrader or the Conn they are wrapped in.
      // Explicitly closing them again might be redundant or error if already closed by wrapper.
      // await rawClientConn?.close().catchError((e) => testLog.warning('Error closing rawClientConn: \$e'));
      // await rawServerConn?.close().catchError((e) => testLog.warning('Error closing rawServerConn: \$e'));
      await serverListener.close().catchError((e) => testLog.warning('Error closing serverListener: \$e'));
      testLog.info('=== Test Teardown Complete ===');
    });

    test('Open, use, and close first stream, then open and use second stream', () async {
      testLog.info('--- Test: Sequential Streams Starting ---');
      expect(upgradedClientConn, isNotNull);
      expect(upgradedServerConn, isNotNull);

      // 1. First Stream (Simulating Identify)
      testLog.info('Opening first stream (client)...');
      final clientStream1Future = upgradedClientConn!.newStream(Context()); // Placeholder streamID
      testLog.info('Accepting first stream (server)...');
      // upgradedServerConn is the MuxedConn (YamuxSession) instance, cast it.
      final serverMuxedConn1 = upgradedServerConn as core_mux.MuxedConn; 
      final serverStream1Future = serverMuxedConn1.acceptStream();

      final P2PStream clientStream1 = await clientStream1Future.timeout(Duration(seconds: 5)); // Explicit type P2PStream
      testLog.info('Client stream 1 opened. ID (Yamux): \${(clientStream1 as YamuxStream).id()}'); // Cast to YamuxStream for id()
      final core_mux.MuxedStream serverStream1 = await serverStream1Future.timeout(Duration(seconds: 5)); // Explicit type
      testLog.info('Server stream 1 accepted. ID (Yamux): \${(serverStream1 as YamuxStream).id()}'); // Cast to YamuxStream for id()

      testLog.info('Exchanging data on first stream...');
      final data1 = Uint8List.fromList(utf8.encode('hello from stream1'));
      await clientStream1.write(data1);
      // Attempting to satisfy linter: assume read(maxLength) -> List<int>
      final List<int> received1_list = await serverStream1.read(data1.length); 
      final Uint8List received1 = Uint8List.fromList(received1_list);
      expect(received1, equals(data1), reason: 'Data mismatch on stream 1');
      testLog.info('Data exchange on first stream successful.');

      testLog.info('Closing first stream...');
      await clientStream1.closeWrite(); // Client signals it's done writing
      // Server should see EOF after reading all data from client
      // For EOF, expect read to return empty list or throw.
      // Assuming it returns empty List<int> if it follows the pattern.
      final List<int> remainingFromServer1_list = await serverStream1.read(1); // Try to read 1 byte for EOF check
      final Uint8List remainingFromServer1 = Uint8List.fromList(remainingFromServer1_list);
      expect(remainingFromServer1.isEmpty, isTrue, reason: 'Server should read EOF after client closes write on stream 1');
      await serverStream1.close(); // Server closes its end
      await clientStream1.close(); // Client fully closes
      testLog.info('First stream closed.');
      
      // Add a small delay to ensure closure propagates and resources are settled
      await Future.delayed(Duration(milliseconds: 200));
      testLog.info('Delay after closing first stream.');


      // 2. Second Stream (Simulating Ping)
      testLog.info('Opening second stream (client)...');
      final clientStream2Future = upgradedClientConn!.newStream(Context());
      testLog.info('Accepting second stream (server)...');
      // upgradedServerConn is the MuxedConn (YamuxSession) instance, cast it.
      final serverMuxedConn2 = upgradedServerConn as core_mux.MuxedConn; 
      final serverStream2Future = serverMuxedConn2.acceptStream();
      
      final P2PStream clientStream2 = await clientStream2Future.timeout(Duration(seconds: 5)); // Explicit type P2PStream
      testLog.info('Client stream 2 opened. ID (Yamux): \${(clientStream2 as YamuxStream).id()}'); // Cast to YamuxStream for id()
      final core_mux.MuxedStream serverStream2 = await serverStream2Future.timeout(Duration(seconds: 5)); // Explicit type
      testLog.info('Server stream 2 accepted. ID (Yamux): \${(serverStream2 as YamuxStream).id()}'); // Cast to YamuxStream for id()
      
      testLog.info('Attempting to write on second stream...');
      final data2 = Uint8List.fromList(utf8.encode('ping data on stream2'));
      try {
        await clientStream2.write(data2);
        testLog.info('Write on second stream successful.');

        // Attempting to satisfy linter: assume read(maxLength) -> List<int>
        final List<int> received2_list = await serverStream2.read(data2.length);
        final Uint8List received2 = Uint8List.fromList(received2_list);
        expect(received2, equals(data2), reason: 'Data mismatch on stream 2');
        testLog.info('Read on second stream successful.');
      } catch (e, st) {
        testLog.severe('Error during second stream operation:', e, st);
        fail('Second stream operation failed: \$e');
      } finally {
        testLog.info('Closing second stream...');
        await clientStream2.close().catchError((e) => testLog.warning('Error closing clientStream2: \$e'));
        await serverStream2.close().catchError((e) => testLog.warning('Error closing serverStream2: \$e'));
        testLog.info('Second stream closed.');
      }
      testLog.info('--- Test: Sequential Streams Complete ---');
    });
  });
}
