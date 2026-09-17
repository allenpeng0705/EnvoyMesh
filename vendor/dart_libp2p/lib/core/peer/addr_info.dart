import 'dart:typed_data';
import 'peer_id.dart';
import '../multiaddr.dart';


/// Represents a peer with its addresses
class AddrInfo {
  /// The peer ID
  final PeerId id;

  /// The list of addresses for this peer
  final List<MultiAddr> addrs;

  /// Creates a new AddrInfo with the given peer ID and addresses
  AddrInfo(this.id, this.addrs);

  /// Creates a new AddrInfo with the given peer ID and no addresses
  AddrInfo.withId(this.id) : addrs = [];

  static AddrInfo fromMultiaddr(MultiAddr addr){

    // Extract the peer ID from the multiaddress string
    final addrStr = addr.toString();
    final parts = addrStr.split('/');

    // Find the p2p component and extract the peer ID
    int p2pIndex = parts.indexOf('p2p');
    if (p2pIndex == -1 || p2pIndex + 1 >= parts.length) {
      throw Exception('Failed to extract peer ID from address: $addrStr');
    }

    final peerIdStr = parts[p2pIndex + 1];

    // Create a PeerId from the string
    final peerId = PeerId.fromString(peerIdStr);

    // Create an AddrInfo with the peer ID and the multiaddress
    return AddrInfo(peerId, [addr]);
  }

  /// Creates a new AddrInfo by merging the addresses of two AddrInfo objects
  /// Returns null if no new addresses were added
  static AddrInfo? mergeAddrInfos(AddrInfo prevAi, AddrInfo newAi) {
    if (prevAi.id != newAi.id) {
      throw ArgumentError('Cannot merge AddrInfo with different peer IDs');
    }

    final seen = <String>{};
    final combinedAddrs = <MultiAddr>[];

    void addAddrs(List<MultiAddr> addrs) {
      for (final addr in addrs) {
        final addrStr = addr.toString();
        if (seen.contains(addrStr)) {
          continue;
        }
        seen.add(addrStr);
        combinedAddrs.add(addr);
      }
    }

    addAddrs(prevAi.addrs);
    addAddrs(newAi.addrs);

    if (combinedAddrs.length > prevAi.addrs.length) {
      return AddrInfo(prevAi.id, combinedAddrs);
    }
    return null;
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! AddrInfo) return false;
    if (id != other.id) return false;
    if (addrs.length != other.addrs.length) return false;
    
    final otherAddrsSet = other.addrs.map((a) => a.toString()).toSet();
    return addrs.every((addr) => otherAddrsSet.contains(addr.toString()));
  }

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() {
    return 'AddrInfo{id: $id, addrs: $addrs}';
  }
}