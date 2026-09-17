import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';

void main() {
  group('OutboundCapabilityInfo', () {
    test('detects IPv4-only capability', () {
      final info = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      expect(info.capability, OutboundCapability.ipv4Only);
    });
    
    test('detects IPv6-only capability', () {
      final info = OutboundCapabilityInfo(
        hasIPv4: false,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      expect(info.capability, OutboundCapability.ipv6Only);
    });
    
    test('detects dual-stack capability', () {
      final info = OutboundCapabilityInfo(
        hasIPv4: true,
        hasIPv6: true,
        detectedAt: DateTime.now(),
      );
      
      expect(info.capability, OutboundCapability.dualStack);
    });
    
    test('detects relay-only capability', () {
      final info = OutboundCapabilityInfo(
        hasIPv4: false,
        hasIPv6: false,
        detectedAt: DateTime.now(),
      );
      
      expect(info.capability, OutboundCapability.relayOnly);
    });
  });
  
  group('Address Classification', () {
    test('classifies public IPv4 address', () {
      final addr = MultiAddr('/ip4/8.8.8.8/tcp/4001');
      expect(addr.addressType, AddressType.directIPv4Public);
    });
    
    test('classifies private IPv4 address', () {
      final addr = MultiAddr('/ip4/192.168.1.1/tcp/4001');
      expect(addr.addressType, AddressType.directIPv4Private);
    });
    
    test('classifies public IPv6 address', () {
      final addr = MultiAddr('/ip6/2001:db8::1/tcp/4001');
      expect(addr.addressType, AddressType.directIPv6Public);
    });
    
    test('classifies link-local IPv6 address', () {
      final addr = MultiAddr('/ip6/fe80::1/tcp/4001');
      expect(addr.addressType, AddressType.directIPv6LinkLocal);
    });
    
    test('classifies relay-specific address', () {
      final addr = MultiAddr('/ip4/1.2.3.4/tcp/4001/p2p/QmRelay/p2p-circuit');
      expect(addr.addressType, AddressType.relaySpecific);
    });
    
    test('classifies relay-generic address', () {
      final addr = MultiAddr('/p2p-circuit');
      expect(addr.addressType, AddressType.relayGeneric);
    });
  });
  
  group('IPv6 Prefix Extraction', () {
    test('extracts /64 prefix from IPv6 address', () {
      final addr = MultiAddr('/ip6/2001:db8:abcd:1234:5678:90ab:cdef:1234/tcp/4001');
      expect(addr.ipv6Prefix64, '2001:db8:abcd:1234');
    });
    
    test('returns null for IPv4 address', () {
      final addr = MultiAddr('/ip4/192.168.1.1/tcp/4001');
      expect(addr.ipv6Prefix64, isNull);
    });
    
    test('returns null for short IPv6 address', () {
      final addr = MultiAddr('/ip6/::1/tcp/4001');
      // IPv6 shorthand ::1 might have fewer than 4 parts when split
      expect(addr.ipv6Prefix64, isNull);
    });
  });
}

