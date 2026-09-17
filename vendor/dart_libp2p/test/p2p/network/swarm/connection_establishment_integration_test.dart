import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/network/swarm/address_filter.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm_dial.dart';

void main() {
  group('Connection Establishment Integration', () {
    test('IPv4-only capability filters IPv6 addresses', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      // Peer has both IPv4 and IPv6 addresses
      final peerAddresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
        MultiAddr('/ip6/2001:db8::2/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001'),
      ];
      
      // Apply filtering
      final filtered = AddressFilter.filterReachable(peerAddresses, capability);
      
      // Should only have IPv4 addresses
      expect(filtered.length, 2);
      expect(filtered.every((addr) => addr.ip4 != null), isTrue);
      expect(filtered.every((addr) => addr.ip6 == null), isTrue);
    });
    
    test('deduplicates IPv6 privacy addresses from same /64 prefix', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      // Peer has 4 IPv6 privacy addresses from same /64 prefix
      final peerAddresses = [
        MultiAddr('/ip6/2001:db8:abcd:1234:1111:2222:3333:4444/tcp/4001'),
        MultiAddr('/ip6/2001:db8:abcd:1234:5555:6666:7777:8888/tcp/4001'),
        MultiAddr('/ip6/2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd/tcp/4001'),
        MultiAddr('/ip6/2001:db8:abcd:1234:eeee:ffff:0000:1111/tcp/4001'),
      ];
      
      // Apply filtering and deduplication
      var processedAddrs = AddressFilter.filterReachable(peerAddresses, capability);
      processedAddrs = AddressFilter.deduplicateIPv6(processedAddrs);
      
      // Should have only 1 address (deduplicated)
      expect(processedAddrs.length, 1);
      expect(processedAddrs[0].ipv6Prefix64, '2001:db8:abcd:1234');
    });
    
    test('relay addresses used as fallback when direct fails', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001/p2p/QmRelay/p2p-circuit'),
      ];
      
      final ranker = CapabilityAwarePriorityRanker();
      final scored = ranker.rank(addresses, capability);
      
      // Direct addresses should have higher priority (lower number)
      expect(scored[0].addr.toString(), contains('1.2.3.4'));
      expect(scored[0].priority, lessThan(scored[1].priority));
      
      // Relay should be fallback
      expect(scored[1].addr.toString(), contains('p2p-circuit'));
      expect(scored[1].priority, greaterThan(scored[0].priority));
    });
    
    test('relay-only capability uses only relay addresses', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: false,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001/p2p/QmRelay/p2p-circuit'),
      ];
      
      // Filter by capability
      final filtered = AddressFilter.filterReachable(addresses, capability);
      
      // Only relay addresses should remain
      expect(filtered.length, 1);
      expect(filtered[0].toString(), contains('p2p-circuit'));
    });
    
    test('dual-stack prefers IPv6 over IPv4', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
      ];
      
      final ranker = CapabilityAwarePriorityRanker();
      final scored = ranker.rank(addresses, capability);
      
      // IPv6 should be tried first for dual-stack
      expect(scored[0].addr.ip6, '2001:db8::1');
      expect(scored[0].priority, lessThan(scored[1].priority));
    });
    
    test('private IPv4 addresses have lower priority than public', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/192.168.1.1/tcp/4001'),
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip4/10.0.0.1/tcp/4001'),
      ];
      
      final ranker = CapabilityAwarePriorityRanker();
      final scored = ranker.rank(addresses, capability);
      
      // Public IPv4 should be first
      expect(scored[0].addr.ip4, '1.2.3.4');
      expect(scored[0].priority, 1);
      
      // Private addresses should be lower priority
      expect(scored[1].addr.isPrivate(), isTrue);
      expect(scored[1].priority, greaterThan(scored[0].priority));
      
      expect(scored[2].addr.isPrivate(), isTrue);
      expect(scored[2].priority, greaterThan(scored[0].priority));
    });
    
    test('link-local IPv6 addresses are filtered out', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip6/fe80::1/tcp/4001'),
        MultiAddr('/ip6/fe80::2/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
      ];
      
      final filtered = AddressFilter.filterReachable(addresses, capability);
      
      // Link-local addresses should be filtered
      expect(filtered.length, 1);
      expect(filtered[0].ip6, '2001:db8::1');
    });
    
    test('complete connection flow with filtering, dedup, and ranking', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      // Peer has mix of addresses
      final peerAddresses = [
        MultiAddr('/ip4/192.168.1.1/tcp/4001'),
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/fe80::1/tcp/4001'), // Link-local, should be filtered
        MultiAddr('/ip6/2001:db8:aaaa:1111:1111:2222:3333:4444/tcp/4001'),
        MultiAddr('/ip6/2001:db8:aaaa:1111:5555:6666:7777:8888/tcp/4001'), // Same /64, should be deduped
        MultiAddr('/ip4/5.6.7.8/tcp/4001/p2p/QmRelay/p2p-circuit'),
      ];
      
      // 1. Filter by reachability
      var processedAddrs = AddressFilter.filterReachable(peerAddresses, capability);
      expect(processedAddrs.length, 5); // Filtered out link-local
      
      // 2. Deduplicate IPv6
      processedAddrs = AddressFilter.deduplicateIPv6(processedAddrs);
      expect(processedAddrs.length, 4); // Deduplicated same /64 IPv6
      
      // 3. Rank by priority
      final ranker = CapabilityAwarePriorityRanker();
      final scored = ranker.rank(processedAddrs, capability);
      
      // Order should be: IPv6 public (1), IPv4 public (2), IPv4 private (3), relay (10)
      expect(scored[0].addr.ip6, isNotNull);
      expect(scored[0].priority, 1);
      
      expect(scored[1].addr.ip4, '1.2.3.4');
      expect(scored[1].priority, 2);
      
      expect(scored[2].addr.ip4, '192.168.1.1');
      expect(scored[2].priority, 3);
      
      expect(scored[3].addr.toString(), contains('p2p-circuit'));
      expect(scored[3].priority, 10);
    });
    
    test('timeouts are correctly assigned by address type', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001/p2p/QmRelay/p2p-circuit'),
        MultiAddr('/p2p-circuit'),
      ];
      
      final ranker = CapabilityAwarePriorityRanker();
      final scored = ranker.rank(addresses, capability);
      
      // Direct connection: 5s
      expect(scored[0].timeout, Duration(seconds: 5));
      
      // Relay connections: 10s
      expect(scored[1].timeout, Duration(seconds: 10));
      expect(scored[2].timeout, Duration(seconds: 10));
    });
  });
}

