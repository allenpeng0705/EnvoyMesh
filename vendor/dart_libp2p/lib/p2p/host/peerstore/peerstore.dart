/// Package peerstore provides utility functions for working with peerstores.

import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';

import '../../../core/peerstore.dart';

/// PeerInfos converts a slice of peer IDs to a slice of peer address information using a peerstore.
Future<List<AddrInfo>> peerInfos(Peerstore ps, List<PeerId> peers) async {
  final futures = <Future<AddrInfo>>[];
  for (final p in peers) {
    futures.add(ps.peerInfo(p));
  }
  return await Future.wait(futures);
}

/// PeerInfoIDs extracts peer IDs from a slice of peer address information.
List<PeerId> peerInfoIDs(List<AddrInfo> pis) {
  final ps = <PeerId>[];
  for (final pi in pis) {
    ps.add(pi.id);
  }
  return ps;
}
