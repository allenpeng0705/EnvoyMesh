import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm_dial.dart';

void main() {
  group('CapabilityAwarePriorityRanker', () {
    final ranker = CapabilityAwarePriorityRanker();
    
    test('ranks IPv6 first for dual-stack', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
        MultiAddr('/ip4/192.168.1.1/tcp/4001'),
      ];
      
      final scored = ranker.rank(addresses, capability);
      
      // Order should be: IPv6 public (1), IPv4 public (2), IPv4 private (3)
      expect(scored[0].addr.ip6, '2001:db8::1');
      expect(scored[0].priority, 1);
      
      expect(scored[1].addr.ip4, '1.2.3.4');
      expect(scored[1].priority, 2);
      
      expect(scored[2].addr.ip4, '192.168.1.1');
      expect(scored[2].priority, 3);
    });
    
    test('ranks IPv4 first for IPv4-only', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/192.168.1.1/tcp/4001'),
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
      ];
      
      final scored = ranker.rank(addresses, capability);
      
      // Order should be: IPv4 public (1), IPv4 private (5)
      expect(scored[0].addr.ip4, '1.2.3.4');
      expect(scored[0].priority, 1);
      
      expect(scored[1].addr.ip4, '192.168.1.1');
      expect(scored[1].priority, 5);
    });
    
    test('ranks relays last for direct connectivity', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001/p2p/QmRelay/p2p-circuit'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001'),
        MultiAddr('/p2p-circuit'),
      ];
      
      final scored = ranker.rank(addresses, capability);
      
      // Order should be: direct IPv4 (2), relay-specific (10), relay-generic (20)
      expect(scored[0].addr.ip4, '5.6.7.8');
      expect(scored[0].priority, 2);
      
      expect(scored[1].addr.toString(), contains('p2p-circuit'));
      expect(scored[1].priority, 10);
      
      expect(scored[2].addr.toString(), '/p2p-circuit');
      expect(scored[2].priority, 20);
    });
    
    test('ranks relays first for relay-only capability', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: false,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/p2p-circuit'),
        MultiAddr('/ip4/1.2.3.4/tcp/4001/p2p/QmRelay/p2p-circuit'),
      ];
      
      final scored = ranker.rank(addresses, capability);
      
      // Order should be: relay-specific (1), relay-generic (5)
      expect(scored[0].addr.toString(), contains('QmRelay'));
      expect(scored[0].priority, 1);
      
      expect(scored[1].addr.toString(), '/p2p-circuit');
      expect(scored[1].priority, 5);
    });
    
    test('assigns correct timeouts', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001/p2p/QmRelay/p2p-circuit'),
      ];
      
      final scored = ranker.rank(addresses, capability);
      
      // Direct connection should have 5s timeout
      expect(scored[0].timeout, Duration(seconds: 5));
      
      // Relay connection should have 10s timeout
      expect(scored[1].timeout, Duration(seconds: 10));
    });
  });
}

