/// Address filter for the holepunch protocol.

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepuncher.dart';
import 'package:dart_libp2p/core/multiaddr.dart';


/// Basic address filter implementation for the holepunch protocol
class BasicAddrFilter implements AddrFilter {
  /// Creates a new basic address filter
  BasicAddrFilter();

  @override
  List<MultiAddr> filterLocal(PeerId peerId, List<MultiAddr> addrs) {
    // Filter out non-public addresses
    return addrs.where((addr) => addr.isPublic()).toList();
  }

  @override
  List<MultiAddr> filterRemote(PeerId peerId, List<MultiAddr> addrs) {
    // Filter out non-public addresses
    return addrs.where((addr) => addr.isPublic()).toList();
  }
}

/// No-op address filter implementation for the holepunch protocol
class NoopAddrFilter implements AddrFilter {
  /// Creates a new no-op address filter
  NoopAddrFilter();

  @override
  List<MultiAddr> filterLocal(PeerId peerId, List<MultiAddr> addrs) {
    // No filtering
    return addrs;
  }

  @override
  List<MultiAddr> filterRemote(PeerId peerId, List<MultiAddr> addrs) {
    // No filtering
    return addrs;
  }
}