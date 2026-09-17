import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/network.dart'; // For Reachability, if needed, or other network consts
// Assuming DialPolicy abstract class is in options.dart or a common place
import './options.dart' show DialPolicy;


class DialPolicyImpl implements DialPolicy {
  final bool allowSelfDials;
  final Host host;

  DialPolicyImpl({required this.host, this.allowSelfDials = false});

  @override
  bool skipDial(MultiAddr addr) {
    // skip relay addresses
    if (addr.hasProtocol('p2p-circuit')) { // Check for circuit relay protocol
      return true;
    }

    if (allowSelfDials) {
      return false;
    }

    // skip private network (unroutable) addresses
    if (!addr.isPublic()) {
      return true;
    }
    
    final candidateIP = addr.toIP();
    if (candidateIP == null) {
      return true; // Not an IP address
    }

    // Skip dialing addresses we believe are the local node's
    for (final localAddr in host.addrs) {
      final localIP = localAddr.toIP();
      if (localIP != null && localIP.address == candidateIP.address) {
        return true;
      }
    }
    return false;
  }

  bool skipPeer(List<MultiAddr> addrs) {
    final List<String> localPublicIPs = [];
    for (final lAddr in host.addrs) {
      if (!lAddr.hasProtocol('p2p-circuit') && lAddr.isPublic()) {
        final lIP = lAddr.toIP();
        if (lIP != null) {
          localPublicIPs.add(lIP.address);
        }
      }
    }

    bool goodPublicFound = false;
    for (final addr in addrs) {
      if (!addr.hasProtocol('p2p-circuit') && addr.isPublic()) {
        final aIP = addr.toIP();
        if (aIP == null) {
          continue;
        }

        if (localPublicIPs.contains(aIP.address)) {
          return true; // Peer has one of our public IPs
        }
        goodPublicFound = true;
      }
    }

    if (allowSelfDials) {
      return false;
    }

    return !goodPublicFound; // Skip if no usable public address was found that isn't ours
  }
}
