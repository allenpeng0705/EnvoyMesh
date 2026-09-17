import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/network/swarm/address_filter.dart';

void main() {
  group('AddressFilter.filterReachable', () {
    test('filters IPv6 when IPv4-only', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001'),
      ];
      
      final filtered = AddressFilter.filterReachable(addresses, capability);
      
      expect(filtered.length, 2);
      expect(filtered[0].ip4, '1.2.3.4');
      expect(filtered[1].ip4, '5.6.7.8');
    });
    
    test('keeps IPv6 when dual-stack', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
      ];
      
      final filtered = AddressFilter.filterReachable(addresses, capability);
      
      expect(filtered.length, 2);
    });
    
    test('filters link-local IPv6', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip6/fe80::1/tcp/4001'),
        MultiAddr('/ip6/2001:db8::1/tcp/4001'),
      ];
      
      final filtered = AddressFilter.filterReachable(addresses, capability);
      
      expect(filtered.length, 1);
      expect(filtered[0].ip6, '2001:db8::1');
    });
    
    test('keeps relay addresses regardless of capability', () {
      final capability = OutboundCapabilityInfo(
        hasIPv4: false,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001/p2p/QmRelay/p2p-circuit'),
        MultiAddr('/p2p-circuit'),
      ];
      
      final filtered = AddressFilter.filterReachable(addresses, capability);
      
      expect(filtered.length, 2);
    });
  });
  
  group('AddressFilter.deduplicateIPv6', () {
    test('deduplicates addresses from same /64 prefix', () {
      final addresses = [
        MultiAddr('/ip6/2001:db8:abcd:1234:1111:2222:3333:4444/tcp/4001'),
        MultiAddr('/ip6/2001:db8:abcd:1234:5555:6666:7777:8888/tcp/4001'),
        MultiAddr('/ip6/2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd/tcp/4001'),
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
      ];
      
      final deduped = AddressFilter.deduplicateIPv6(addresses);
      
      // Should keep only one IPv6 from the /64 prefix and the IPv4
      expect(deduped.length, 2);
      
      // First IPv6 from the prefix should be kept
      expect(deduped[0].ip6, '2001:db8:abcd:1234:1111:2222:3333:4444');
      
      // IPv4 should be kept
      expect(deduped[1].ip4, '1.2.3.4');
    });
    
    test('keeps IPv6 addresses from different /64 prefixes', () {
      final addresses = [
        MultiAddr('/ip6/2001:db8:aaaa:1111::1/tcp/4001'),
        MultiAddr('/ip6/2001:db8:bbbb:2222::1/tcp/4001'),
        MultiAddr('/ip6/2001:db8:cccc:3333::1/tcp/4001'),
      ];
      
      final deduped = AddressFilter.deduplicateIPv6(addresses);
      
      // All three should be kept as they're from different /64 prefixes
      expect(deduped.length, 3);
    });
    
    test('keeps all non-IPv6 addresses', () {
      final addresses = [
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
        MultiAddr('/ip4/5.6.7.8/tcp/4001'),
        MultiAddr('/ip4/9.10.11.12/tcp/4001'),
      ];
      
      final deduped = AddressFilter.deduplicateIPv6(addresses);
      
      expect(deduped.length, 3);
    });
  });
}

