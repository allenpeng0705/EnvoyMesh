import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart'; // For Protocols class
// From search: lib/p2p/protocol/holepunch/util.dart
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart' show isRelayAddress;


/// Cleans up a relay's address set to remove private addresses and curtail addrsplosion.
List<MultiAddr> cleanupAddressSet(List<MultiAddr> addrs) {
  List<MultiAddr> publicAddrs = [];
  List<MultiAddr> privateAddrs = [];

  for (var a in addrs) {
    if (isRelayAddress(a)) {
      continue;
    }

    if (a.isPublic() || isDNSAddr(a)) {
      publicAddrs.add(a);
      continue;
    }

    if (a.isPrivate()) {
      privateAddrs.add(a);
    }
  }

  if (!hasAddrsplosion(publicAddrs)) {
    return publicAddrs;
  }

  return sanitizeAddrsplodedSet(publicAddrs, privateAddrs);
}

bool isDNSAddr(MultiAddr a) {
  if (a.components.isEmpty) return false;
  final firstComponentProtocol = a.components.first.$1; // This is a Protocol object
  return firstComponentProtocol.code == Protocols.dns4.code ||
      firstComponentProtocol.code == Protocols.dns6.code ||
      firstComponentProtocol.code == Protocols.dnsaddr.code;
  // Note: Go's ma.P_DNS is not directly listed in the Dart Protocols class.
  // Assuming dns4, dns6, and dnsaddr cover the intended DNS types.
}

class _AddrKeyAndPort {
  final String key;
  final int port;
  _AddrKeyAndPort(this.key, this.port);
}

_AddrKeyAndPort getAddrKeyAndPort(MultiAddr a) {
  String key = '';
  int port = 0;

  for (var component in a.components) {
    final protocol = component.$1; // Protocol object
    final value = component.$2;   // String value of the component
    final pCode = protocol.code;

    if (pCode == Protocols.tcp.code || pCode == Protocols.udp.code) {
      try {
        port = int.parse(value);
      } catch (e) {
        // Handle parsing error if value is not a valid port number string
        // For now, keep port as 0 or throw, depending on desired strictness.
        // Example: log.warning('Could not parse port: $value for ${protocol.name}');
      }
      key += '/${protocol.name}'; // Add protocol name, not its value (which is the port)
    } else {
      // Mimic Go: if value is empty, use protocol name. Otherwise, use value.
      String valStr = value.isNotEmpty ? value : protocol.name;
      key += '/$valStr';
    }
  }
  return _AddrKeyAndPort(key, port);
}

bool hasAddrsplosion(List<MultiAddr> addrs) {
  Map<String, int> aset = {};

  for (var a in addrs) {
    var kap = getAddrKeyAndPort(a);
    if (aset.containsKey(kap.key) && aset[kap.key] != kap.port) {
      return true;
    }
    aset[kap.key] = kap.port;
  }
  return false;
}

class _PortAndAddr {
  final MultiAddr addr;
  final int port;
  _PortAndAddr(this.addr, this.port);
}

List<MultiAddr> sanitizeAddrsplodedSet(
    List<MultiAddr> publicAddrs, List<MultiAddr> privateAddrs) {
  Set<int> privports = {};
  Map<String, List<_PortAndAddr>> pubaddrGroups = {};

  for (var a in privateAddrs) {
    privports.add(getAddrKeyAndPort(a).port);
  }

  for (var a in publicAddrs) {
    var kap = getAddrKeyAndPort(a);
    pubaddrGroups.putIfAbsent(kap.key, () => []).add(_PortAndAddr(a, kap.port));
  }

  List<MultiAddr> result = [];
  pubaddrGroups.forEach((key, pas) {
    if (pas.length == 1) {
      result.add(pas[0].addr);
      return;
    }

    bool haveAddr = false;
    List<MultiAddr> selectedForThisKey = [];
    for (var pa in pas) {
      if (privports.contains(pa.port)) {
        selectedForThisKey.add(pa.addr);
        haveAddr = true;
      } else if (pa.port == 4001 || pa.port == 4002) { // Default libp2p ports
        // Only add if not already added via private port match for this key
        if (!selectedForThisKey.any((sa) => getAddrKeyAndPort(sa).port == pa.port)) {
             selectedForThisKey.add(pa.addr);
        }
        haveAddr = true;
      }
    }

    if (haveAddr) {
        result.addAll(selectedForThisKey.toSet().toList()); // toSet to remove duplicates if any
    } else {
      // We weren't able to select a preferred port; use them all for this key
      for (var pa in pas) {
        result.add(pa.addr);
      }
    }
  });

  return result;
}
