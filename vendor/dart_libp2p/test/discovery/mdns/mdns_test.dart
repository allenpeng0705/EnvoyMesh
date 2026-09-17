import 'dart:async';

import 'package:dart_libp2p/p2p/discovery/mdns/mdns.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:test/test.dart';

// Mock implementation of Host for testing
class MockHost implements Host {
  final PeerId _peerId;
  final List<MultiAddr> _listenAddrs;

  MockHost(this._peerId, this._listenAddrs);

  @override
  PeerId get id => _peerId;

  @override
  List<MultiAddr> get addrs => _listenAddrs;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError('${invocation.memberName} is not implemented');
  }
}

// Implementation of MdnsNotifee for testing
class TestNotifee implements MdnsNotifee {
  final List<AddrInfo> discoveredPeers = [];

  @override
  void handlePeerFound(AddrInfo peer) {
    discoveredPeers.add(peer);
  }
}

void main() {
  late PeerId testPeerId;

  setUpAll(() {
    // Create the PeerId once before all tests
    testPeerId = PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N');
  });

  group('MdnsDiscovery', () {
    test('creates with default service name', () {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host);

      expect(mdns, isNotNull);
    });

    test('creates with custom service name', () {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host, serviceName: '_custom._tcp');

      expect(mdns, isNotNull);
    });

    test('creates with notifee', () {
      final host = MockHost(testPeerId, []);
      final notifee = TestNotifee();
      final mdns = MdnsDiscovery(host, notifee: notifee);

      expect(mdns, isNotNull);
    });

    test('advertise returns a duration', () async {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host);

      final duration = await mdns.advertise('test');

      expect(duration, isA<Duration>());
      expect(duration.inSeconds, greaterThan(0));

      await mdns.stop();
    });

    test('findPeers returns a stream', () async {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host);

      final stream = await mdns.findPeers('test');

      expect(stream, isA<Stream<AddrInfo>>());

      await mdns.stop();
    });

    test('start and stop work correctly', () async {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host);

      // Should be able to start
      await mdns.start();

      // Starting again should be safe (no-op)
      await mdns.start();

      // Should be able to stop
      await mdns.stop();

      // Stopping again should be safe (no-op)
      await mdns.stop();
    });

    test('notifee can be set and updated', () {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host);

      final notifee1 = TestNotifee();
      final notifee2 = TestNotifee();

      mdns.notifee = notifee1;
      mdns.notifee = notifee2;
      mdns.notifee = null;

      // No exceptions should be thrown
      expect(mdns, isNotNull);
    });

    test('debugInjectPeer notifies the notifee', () async {
      final host = MockHost(testPeerId, []);
      final notifee = TestNotifee();
      final mdns = MdnsDiscovery(host, notifee: notifee);

      final testAddr = MultiAddr('/ip4/127.0.0.1/udp/4001/udx/p2p/${testPeerId.toString()}');
      final testPeer = AddrInfo(testPeerId, [testAddr]);

      mdns.debugInjectPeer(testPeer);

      expect(notifee.discoveredPeers, hasLength(1));
      expect(notifee.discoveredPeers.first.id, equals(testPeerId));
      expect(notifee.discoveredPeers.first.addrs.first.toString(), equals(testAddr.toString()));
    });

    test('findPeers forwards discovered peers to returned stream', () async {
      final host = MockHost(testPeerId, []);
      final mdns = MdnsDiscovery(host);

      final testNotifee = TestNotifee();
      mdns.notifee = testNotifee;

      final stream = await mdns.findPeers('test');

      final completer = Completer<AddrInfo>();
      final sub = stream.listen((peer) {
        if (!completer.isCompleted) {
          completer.complete(peer);
        }
      });

      final discoveredAddr = MultiAddr('/ip4/127.0.0.1/udp/4001/udx/p2p/${testPeerId.toString()}');
      final discovered = AddrInfo(testPeerId, [discoveredAddr]);

      mdns.debugInjectPeer(discovered);

      final received = await completer.future.timeout(const Duration(seconds: 2));
      expect(received.id, equals(testPeerId));
      expect(received.addrs.first.toString(), equals(discoveredAddr.toString()));

      await sub.cancel();
      await mdns.stop();
    });

    test('handles host with no addresses gracefully', () async {
      final host = MockHost(testPeerId, []); // No addresses
      final mdns = MdnsDiscovery(host);

      // Should not throw even with no addresses
      await mdns.start();
      await mdns.stop();

      expect(mdns, isNotNull);
    });

    test('handles host with multiple addresses', () async {
      final addr1 = MultiAddr('/ip4/127.0.0.1/udp/4001/udx/p2p/${testPeerId.toString()}');
      final addr2 = MultiAddr('/ip4/192.168.1.100/udp/4002/udx/p2p/${testPeerId.toString()}');
      final host = MockHost(testPeerId, [addr1, addr2]);
      
      final mdns = MdnsDiscovery(host);

      // Should handle multiple addresses without issues
      await mdns.start();
      await mdns.stop();

      expect(mdns, isNotNull);
    });

    test('constants have expected values', () {
      expect(MdnsConstants.serviceName, equals('_p2p._udp'));
      expect(MdnsConstants.mdnsDomain, equals('local'));
      expect(MdnsConstants.dnsaddrPrefix, equals('dnsaddr='));
      expect(MdnsConstants.defaultPort, equals(4001));
    });
  });
}