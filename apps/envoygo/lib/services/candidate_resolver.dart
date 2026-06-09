import '../models/stored_node.dart';
import 'home_remote_client.dart';

/// Builds transport candidate URLs from stored pairing data.
///
/// Priority order: LAN → public IP → relay tunnel.
class CandidateResolver {
  /// Resolve transport candidates for a stored node.
  ///
  /// Called on every (re)connect so the resolver can return up-to-date URLs
  /// (e.g. a fresh relay session token, or a LAN URL discovered later).
  List<HomeRemoteCandidate> resolve(StoredNode node, {String? sessionToken}) {
    final candidates = <HomeRemoteCandidate>[];

    // 1. LAN WebSocket (always try first — lowest latency).
    if (node.lanIp != null && node.lanIp!.isNotEmpty) {
      var url = node.lanIp!;
      if (sessionToken != null) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(name: 'lan', url: url));
    }

    // 2. Public IP/domain (direct WAN access, no relay needed).
    if (node.publicHost != null && node.publicHost!.isNotEmpty) {
      var url = 'ws://${node.publicHost}:${node.publicPort}/ws';
      if (sessionToken != null) {
        url += '?token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(name: 'public', url: url));
    }

    // 3. Relay tunnel WebSocket (WAN fallback via fixed port 15432).
    // The relay's /ws endpoint REQUIRES a target parameter. The home
    // node registers a persistent tunnel at /ws/home. When the relay
    // sees a matching target, it forwards through the tunnel without
    // assigning dynamic circuit-relay ports.
    if (node.relayWsUrl != null && node.relayWsUrl!.isNotEmpty) {
      var url = _stripPairingToken(node.relayWsUrl!);
      if (node.homePeerId.isNotEmpty) {
        url += '${url.contains('?') ? '&' : '?'}target=${node.homePeerId}';
      }
      if (sessionToken != null) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(name: 'relay', url: url));
    }

    return candidates;
  }

  /// Remove only the `token` query parameter from a relay URL.
  ///
  /// The pairing QR includes a short-lived pairing token in the relay URL
  /// that must not shadow the session token on reconnection. We keep
  /// `target` because the relay's /ws endpoint requires it for routing.
  String _stripPairingToken(String url) {
    final qIdx = url.indexOf('?');
    if (qIdx < 0) return url;
    final base = url.substring(0, qIdx);
    final query = url.substring(qIdx + 1);
    final params = query
        .split('&')
        .where((p) => !p.startsWith('token='))
        .toList();
    if (params.isEmpty) return base;
    return '$base?${params.join('&')}';
  }
}
