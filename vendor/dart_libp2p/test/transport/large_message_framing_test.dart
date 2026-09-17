import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart' show Conn;
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types;
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport;
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';

/// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: '/yamux/1.0.0',
          muxerFactory: (Conn secureConn, bool isClient) {
            if (secureConn is! TransportConn) {
              throw ArgumentError('YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
            }
            return YamuxSession(secureConn, yamuxConfig, isClient);
          },
        );
}

void main() {
  group('Large Message Framing Test (UDX + Noise + Yamux)', () {
    test('validates SecuredConnection read/write locks fix framing issues with large messages', () async {
      // This test validates that the SecuredConnection read/write locks
      // properly fix the MAC authentication errors that occurred with large
      // messages (>50KB) over UDX transport.
      //
      // Without the locks, large messages would be fragmented into many UDP packets,
      // and concurrent operations could cause the receiver to read length prefixes
      // from the middle of encrypted data, causing MAC errors.
      //
      // With the locks, each encrypted message read/write is atomic, preventing
      // framing desynchronization.

      final udxInstance = UDX();
      final resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      final connManager = p2p_transport.ConnectionManager();

      // Create client and server peers
      final clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      final serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      final clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      final serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      // Configure Yamux with standard settings (no frame size limits!)
      final yamuxConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );

      final securityProtocolsClient = [await NoiseSecurity.create(clientKeyPair)];
      final securityProtocolsServer = [await NoiseSecurity.create(serverKeyPair)];
      final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxConfig)];

      final clientP2PConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = securityProtocolsClient
        ..muxers = muxerDefs;

      final serverP2PConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..securityProtocols = securityProtocolsServer
        ..muxers = muxerDefs;

      // Create transports
      final clientTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      final serverTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);

      final clientUpgrader = BasicUpgrader(resourceManager: resourceManager);
      final serverUpgrader = BasicUpgrader(resourceManager: resourceManager);

      try {
        // Start server
        final initialListenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        final listener = await serverTransport.listen(initialListenAddr);
        final actualListenAddr = listener.addr;
        print('Server listening on: $actualListenAddr');

        // Establish connection
        final serverAcceptFuture = listener.accept();
        final clientDialFuture = clientTransport.dial(actualListenAddr);

        final serverRawConn = (await serverAcceptFuture)!;
        final clientRawConn = await clientDialFuture;

        // Upgrade connections (Noise + Yamux)
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

        final upgradedConns = await Future.wait([clientUpgradedFuture, serverUpgradedFuture]);
        final clientUpgradedConn = upgradedConns[0] as core_mux_types.MuxedConn;
        final serverUpgradedConn = upgradedConns[1] as core_mux_types.MuxedConn;

        print('✅ Upgraded to Noise+Yamux');

        // Open a stream
        final serverAcceptStreamFuture = serverUpgradedConn.acceptStream();
        await Future.delayed(Duration(milliseconds: 100));
        final clientStream = await clientUpgradedConn.openStream(core_context.Context()) as YamuxStream;
        final serverStream = await serverAcceptStreamFuture as YamuxStream;

        print('✅ Stream opened');

        // Test message sizes that previously failed (>50KB with ~35+ UDP packets)
        final testSizes = [
          50 * 1024,   // 50KB - Would fail without SecuredConnection locks
          96 * 1024,   // 96KB - Original production bug size
          200 * 1024,  // 200KB - Extreme case (~145 UDP packets)
        ];

        for (final size in testSizes) {
          print('\n📤 Testing ${(size / 1024).toStringAsFixed(0)}KB message...');
          final testData = Uint8List.fromList(List.generate(size, (i) => i % 256));

          // Send large message
          await clientStream.write(testData);
          print('   Write completed');

          // Read large message - accumulate chunks since read() returns
          // whatever is available (typically 16KB Yamux segments)
          final chunks = <Uint8List>[];
          int totalReceived = 0;
          while (totalReceived < size) {
            final chunk = await serverStream.read();
            chunks.add(chunk);
            totalReceived += chunk.length;
          }
          final received = Uint8List(totalReceived);
          int offset = 0;
          for (final chunk in chunks) {
            received.setRange(offset, offset + chunk.length, chunk);
            offset += chunk.length;
          }
          print('   Read completed: ${received.length} bytes (${chunks.length} chunks)');

          // Verify
          expect(received.length, equals(size),
              reason: 'Should receive full ${(size / 1024).toStringAsFixed(0)}KB message');

          bool dataMatches = true;
          for (int i = 0; i < size; i++) {
            if (received[i] != testData[i]) {
              dataMatches = false;
              print('   ❌ Data mismatch at byte $i: expected ${testData[i]}, got ${received[i]}');
              break;
            }
          }

          expect(dataMatches, isTrue,
              reason: 'Data should be preserved for ${(size / 1024).toStringAsFixed(0)}KB message');

          print('   ✅ ${(size / 1024).toStringAsFixed(0)}KB message transferred successfully');
        }

        print('\n🎉 All large message tests PASSED - SecuredConnection locks work!');

        // Cleanup
        await clientStream.close();
        await serverStream.close();
        await clientUpgradedConn.close();
        await serverUpgradedConn.close();
        await listener.close();
      } finally {
        await clientTransport.dispose();
        await serverTransport.dispose();
        await connManager.dispose();
        await resourceManager.close();
      }
    }, timeout: Timeout(Duration(seconds: 60)));
  });
}

