import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';

import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: YamuxConstants.protocolId,
          muxerFactory: (Conn secureConn, bool isClient) {
            return YamuxSession(secureConn as TransportConn, yamuxConfig, isClient);
          },
        );
}

void main() {
  group('BasicHost Address Filtering Test', () {
    late BasicHost host;
    late UDX udxInstance;

    setUp(() async {
      udxInstance = UDX();
    });

    tearDown(() async {
      await host.close();
    });

    test('advertised addresses should not contain unspecified addresses', () async {
      final keyPair = await crypto_ed25519.generateEd25519KeyPair();
      final muxerDef = _TestYamuxMuxerProvider(yamuxConfig: MultiplexerConfig());
      final connMgr = ConnectionManager();
      final config = p2p_config.Config()
        ..peerKey = keyPair
        ..listenAddrs = [MultiAddr('/ip4/0.0.0.0/udp/0/udx')]
        ..securityProtocols = [await NoiseSecurity.create(keyPair)]
        ..muxers = [muxerDef]
        ..transports = [UDXTransport(connManager: connMgr, udxInstance: udxInstance)]
        ..connManager = connMgr;

      host = await config.newNode() as BasicHost;
      await host.start();

      final addrs = host.addrs;
      print('Advertised addresses: $addrs');

      expect(addrs, isNotEmpty, reason: 'Host should have at least one resolved address.');

      for (final addr in addrs) {
        final addrStr = addr.toString();
        expect(addrStr.contains('0.0.0.0'), isFalse, reason: 'Address "$addrStr" should not be unspecified.');
        expect(addr.isPublic() || addr.isPrivate(), isTrue, reason: 'Address "$addrStr" should be a valid public or private address.');
      }
    });

    test('connect should filter addresses from AddrInfo', () async {
      // Setup client host
      final clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      final clientMuxerDef = _TestYamuxMuxerProvider(yamuxConfig: MultiplexerConfig());
      final clientConnMgr = ConnectionManager();
      final clientConfig = p2p_config.Config()
        ..peerKey = clientKeyPair
        ..securityProtocols = [await NoiseSecurity.create(clientKeyPair)]
        ..muxers = [clientMuxerDef]
        ..transports = [UDXTransport(connManager: clientConnMgr, udxInstance: udxInstance)]
        ..connManager = clientConnMgr
        ..addrsFactory = (addrs) => addrs;
      final clientHost = await clientConfig.newNode() as BasicHost;
      await clientHost.start();

      // Setup server host
      final serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      final serverMuxerDef = _TestYamuxMuxerProvider(yamuxConfig: MultiplexerConfig());
      final serverConnMgr = ConnectionManager();
      final serverConfig = p2p_config.Config()
        ..peerKey = serverKeyPair
        ..listenAddrs = [MultiAddr('/ip4/127.0.0.1/udp/0/udx')]
        ..securityProtocols = [await NoiseSecurity.create(serverKeyPair)]
        ..muxers = [serverMuxerDef]
        ..transports = [UDXTransport(connManager: serverConnMgr, udxInstance: udxInstance)]
        ..connManager = serverConnMgr
        ..addrsFactory = (addrs) => addrs;
      host = await serverConfig.newNode() as BasicHost; // Assign to host for teardown
      await host.start();

      final serverListenAddr = host.addrs.first;
      final invalidAddr = MultiAddr('/ip4/0.0.0.0/udp/12345/udx');
      
      final addrInfoWithInvalid = AddrInfo(host.id, [invalidAddr, serverListenAddr]);

      // This connect call will add the addresses to the peerstore
      // We expect it to fail because it will try to dial 0.0.0.0, but that's ok for this test.
      // The main point is to check the peerstore content *after* the connect call.

      // The connect call should now complete without throwing an exception about dialing,
      // because the dialer will gracefully handle the invalid address.
      await expectLater(
          clientHost.connect(addrInfoWithInvalid),
          completes
      );

      // Now, verify the peerstore content.
      final storedAddrs = await clientHost.peerStore.addrBook.addrs(host.id);
      print('Stored addresses for server: $storedAddrs');

      // The peerstore SHOULD contain the invalid address because the clientHost's
      // addrsFactory is configured to be a no-op. This is correct.
      expect(
        storedAddrs.any((addr) => addr.toString().contains('0.0.0.0')),
        isTrue,
        reason: 'Peerstore should contain the invalid address as per the permissive factory.',
      );

      // It should also contain the valid address.
      expect(
        storedAddrs.any((addr) => addr.toString() == serverListenAddr.toString()),
        isTrue,
        reason: 'Peerstore should contain the valid server address.',
      );

      await clientHost.close();

    });
  });
}
