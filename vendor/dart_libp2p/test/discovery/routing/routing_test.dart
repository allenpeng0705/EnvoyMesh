import 'dart:async';

import 'package:dcid/dcid.dart';
import 'package:dart_libp2p/p2p/discovery/routing/routing.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/discovery.dart';
import 'package:dart_libp2p/core/routing/routing.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:test/test.dart';

// Mock implementation of ContentRouting for testing
class MockContentRouting implements ContentRouting {
  bool provideWasCalled = false;
  CID? lastProvidedCid;
  bool? lastAnnounce;
  bool shouldTimeout = false;
  bool shouldThrowError = false;

  @override
  Future<void> provide(CID cid, bool announce) async {
    provideWasCalled = true;
    lastProvidedCid = cid;
    lastAnnounce = announce;

    if (shouldTimeout) {
      await Future.delayed(const Duration(seconds: 61)); // Force a timeout
    }

    if (shouldThrowError) {
      throw Exception('Test error');
    }
  }

  @override
  Stream<AddrInfo> findProvidersAsync(CID cid, int count) async* {
    if (shouldTimeout) {
      await Future.delayed(const Duration(seconds: 61)); // Force a timeout
      return;
    }

    if (shouldThrowError) {
      throw Exception('Test error');
    }

    // Generate some test peers
    for (int i = 0; i < count && i < 3; i++) {
      final peerId = await PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx$i');
      yield AddrInfo(peerId, []);
    }
  }
}

// Mock implementation of Discovery for testing
class MockDiscovery implements Discovery {
  bool advertiseWasCalled = false;
  String? lastAdvertisedNs;
  List<DiscoveryOption>? lastOptions;
  bool shouldTimeout = false;
  bool shouldThrowError = false;

  @override
  Future<Duration> advertise(String ns, [List<DiscoveryOption> options = const []]) async {
    advertiseWasCalled = true;
    lastAdvertisedNs = ns;
    lastOptions = options;

    if (shouldTimeout) {
      await Future.delayed(const Duration(seconds: 61)); // Force a timeout
    }

    if (shouldThrowError) {
      throw Exception('Test error');
    }

    return const Duration(hours: 1);
  }

  @override
  Future<Stream<AddrInfo>> findPeers(String ns, [List<DiscoveryOption> options = const []]) async {
    final controller = StreamController<AddrInfo>();

    if (shouldTimeout) {
      // Simulate a timeout by not completing
      return controller.stream;
    }

    if (shouldThrowError) {
      controller.addError(Exception('Test error'));
      await controller.close();
      return controller.stream;
    }

    // Generate some test peers
    for (int i = 0; i < 3; i++) {
      final peerId = await PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx$i');
      controller.add(AddrInfo(peerId, []));
    }

    await controller.close();
    return controller.stream;
  }
}

void main() {
  group('RoutingDiscovery', () {
    late MockContentRouting mockRouter;
    late RoutingDiscovery routingDiscovery;

    setUp(() {
      mockRouter = MockContentRouting();
      routingDiscovery = RoutingDiscovery(mockRouter);
    });

    test('advertise calls provide on the router', () async {
      final duration = await routingDiscovery.advertise('test-namespace');

      expect(mockRouter.provideWasCalled, isTrue);
      expect(mockRouter.lastAnnounce, isTrue);
      expect(duration, equals(const Duration(hours: 3)));
    });

    test('advertise respects provided TTL', () async {
      // Create a custom TTL option
      final customTtl = const Duration(hours: 1);
      final options = [
        (DiscoveryOptions opts) => DiscoveryOptions(
          ttl: customTtl,
          limit: opts.limit,
          other: Map.from(opts.other),
        ),
      ];

      final duration = await routingDiscovery.advertise('test-namespace', options);

      expect(duration, equals(customTtl));
    });
  });
}
