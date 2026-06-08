import '../models/stored_node.dart';
import 'home_remote_client.dart';

/// Builds transport candidate URLs from stored pairing data.
///
/// Priority order: LAN (ws://) → relay tunnel (wss://) → libp2p (future).
class CandidateResolver {
  /// Resolve transport candidates for a stored node.
  ///
  /// Called on every (re)connect so the resolver can return up-to-date URLs
  /// (e.g. a fresh relay session token, or a LAN URL discovered later).
  List<HomeRemoteCandidate> resolve(StoredNode node, {String? sessionToken}) {
    final candidates = <HomeRemoteCandidate>[];

    // 1. LAN WebSocket (always try first — lowest latency)
    if (node.lanIp != null && node.lanIp!.isNotEmpty) {
      var url = 'ws://${node.lanIp}:${node.wsPort}/ws';
      if (sessionToken != null) {
        url += '?token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(
        name: 'lan',
        url: url,
      ));
    }

    // 2. Relay tunnel (WAN fallback via EnvoyMesh relay)
    if (node.relayWsUrl != null && node.relayWsUrl!.isNotEmpty) {
      var url = '${node.relayWsUrl}?peer=${node.homePeerId}';
      if (sessionToken != null) {
        url += '&token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(
        name: 'relay',
        url: url,
      ));
    }

    // 3. libp2p direct (Phase 31D)
    // candidates.add(HomeRemoteCandidate(
    //   name: 'libp2p',
    //   url: 'libp2p://${node.homePeerId}',
    // ));

    return candidates;
  }
}
