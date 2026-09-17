import 'package:test/test.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:logging/logging.dart';

void main() {
  group('Self-dial Prevention Tests', () {
    late BasicHost host;
    late Swarm swarm;
    late PeerId localPeerId;

    setUp(() async {
      // Set up logging for debugging
      Logger.root.level = Level.FINE;
      Logger.root.onRecord.listen((record) {
        print('${record.level.name}: ${record.time}: ${record.message}');
      });

      // Generate a test peer ID
      final keyPair = await generateEd25519KeyPair();
      localPeerId = PeerId.fromPublicKey(keyPair.publicKey);

      // Create a basic peerstore
      final peerstore = MemoryPeerstore();

      // Create a resource manager
      final resourceManager = NullResourceManager();

      // Create a basic upgrader
      final upgrader = BasicUpgrader(resourceManager: resourceManager);

      // Create a basic config
      final config = Config();

      // Create swarm
      swarm = Swarm(
        host: null, // Will be set later to avoid circular dependency
        localPeer: localPeerId,
        peerstore: peerstore,
        resourceManager: resourceManager,
        upgrader: upgrader,
        config: config,
      );

      // Create host
      host = await BasicHost.create(
        network: swarm,
        config: config,
      );

      // Set the host reference in swarm
      swarm.setHost(host);
    });

    tearDown(() async {
      await host.close();
    });

    test('BasicHost.connect should prevent self-dialing', () async {
      // Create an AddrInfo with the host's own peer ID
      final selfAddrInfo = AddrInfo(
        localPeerId,
        [MultiAddr('/ip4/127.0.0.1/tcp/8080')],
      );

      // This should complete without throwing an exception
      // The self-dial prevention should silently return
      await host.connect(selfAddrInfo);

      // Verify that no connection was actually established
      expect(host.network.connectedness(localPeerId), equals(Connectedness.notConnected));
    });

    test('Swarm.dialPeer should prevent self-dialing', () async {
      final context = Context();

      // This should throw an exception preventing self-dial
      expect(
        () async => await swarm.dialPeer(context, localPeerId),
        throwsA(isA<Exception>().having(
          (e) => e.toString(),
          'message',
          contains('Cannot dial self'),
        )),
      );
    });

    test('Self-dial prevention should log appropriate messages', () async {
      // Capture log messages
      final logMessages = <String>[];
      final subscription = Logger('basichost').onRecord.listen((record) {
        logMessages.add(record.message);
      });

      try {
        // Attempt self-dial via BasicHost.connect
        final selfAddrInfo = AddrInfo(
          localPeerId,
          [MultiAddr('/ip4/127.0.0.1/tcp/8080')],
        );

        await host.connect(selfAddrInfo);

        // Check that the prevention message was logged
        expect(
          logMessages.any((msg) => msg.contains('Preventing self-dial attempt')),
          isTrue,
          reason: 'Expected self-dial prevention log message',
        );
      } finally {
        await subscription.cancel();
      }
    });

    test('Self-dial prevention should work with different address formats', () async {
      // Test with various address formats that might be encountered
      final testAddresses = [
        '/ip4/0.0.0.0/udp/33220/udx',
        '/ip4/127.0.0.1/tcp/8080',
        '/ip6/::1/tcp/8080',
        '/ip4/192.168.1.100/udp/4001/udx',
      ];

      for (final addrStr in testAddresses) {
        final selfAddrInfo = AddrInfo(
          localPeerId,
          [MultiAddr(addrStr)],
        );

        // Should complete without error (self-dial prevention)
        await host.connect(selfAddrInfo);

        // Verify no connection was established
        expect(host.network.connectedness(localPeerId), equals(Connectedness.notConnected));
      }
    });
  });
}
