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
    // Strip any existing token param from the relay URL before appending
    // the session token, so the server sees our token first.
    if (node.relayWsUrl != null && node.relayWsUrl!.isNotEmpty) {
      var url = _stripTokenParam(node.relayWsUrl!);
      if (sessionToken != null) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(name: 'relay', url: url));
    }

    return candidates;
  }

  /// Remove `token` and `target` query parameters from a relay URL.
  ///
  /// - `token` is a short-lived pairing token from the QR that must not
  ///   shadow the session token on reconnection.
  /// - `target` is a libp2p peer ID that causes the relay to attempt a
  ///   circuit-relay connection on a random port. The cloud relay only
  ///   exposes fixed ports (e.g. 15432), so circuit-relay ports are blocked.
  String _stripTokenParam(String url) {
    final qIdx = url.indexOf('?');
    if (qIdx < 0) return url;
    final base = url.substring(0, qIdx);
    final query = url.substring(qIdx + 1);
    final params = query
        .split('&')
        .where((p) => !p.startsWith('token=') && !p.startsWith('target='))
        .toList();
    if (params.isEmpty) return base;
    return '$base?${params.join('&')}';
  }
}
