import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';

/// Filters and processes addresses for connection establishment
class AddressFilter {
  /// Filter addresses based on outbound capability
  /// 
  /// Removes addresses that cannot be reached based on local network capabilities.
  /// For example, IPv6 addresses are filtered out when the local peer
  /// only has IPv4 connectivity.
  static List<MultiAddr> filterReachable(
    List<MultiAddr> addresses,
    OutboundCapabilityInfo capability,
  ) {
    return addresses.where((addr) {
      final type = addr.addressType;
      
      switch (type) {
        case AddressType.directIPv6Public:
          // Only attempt IPv6 if we can reach IPv6
          return capability.hasIPv6;
          
        case AddressType.directIPv6LinkLocal:
          // Link-local generally not useful for P2P connections
          return false;
          
        case AddressType.directIPv4Public:
        case AddressType.directIPv4Private:
          // Only attempt IPv4 if we can reach IPv4
          return capability.hasIPv4;
          
        case AddressType.relaySpecific:
        case AddressType.relayGeneric:
          // Relays are always reachable
          return true;
      }
    }).toList();
  }
  
  /// Deduplicate IPv6 addresses from same /64 prefix
  /// 
  /// IPv6 privacy extensions (RFC 4941) create multiple temporary addresses
  /// from the same /64 prefix. We only need to try one address per prefix
  /// to avoid wasting connection attempts.
  static List<MultiAddr> deduplicateIPv6(List<MultiAddr> addresses) {
    final seen = <String>{};
    return addresses.where((addr) {
      final prefix = addr.ipv6Prefix64;
      if (prefix == null) return true; // Not IPv6, keep it
      if (seen.contains(prefix)) return false; // Already have this prefix
      seen.add(prefix);
      return true;
    }).toList();
  }
}

