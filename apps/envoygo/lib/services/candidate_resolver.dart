import '../models/stored_node.dart';
import 'home_remote_client.dart';

/// Builds transport candidate URLs from stored pairing data.
///
/// Priority order: LAN → public IP → p2p (libp2p circuit relay) → relay.
class CandidateResolver {
  /// Resolve transport candidates for a stored node.
  ///
  /// Called on every (re)connect so the resolver can return up-to-date URLs.
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

    // 3. libp2p circuit relay via the relay node's libp2p endpoint (port 4001).
    // This uses the dart_libp2p package for Noise handshake and circuit relay,
    // bypassing the WebSocket relay tunnel. No dynamic ports — the relay's
    // libp2p endpoint is on a fixed port (4001) already open in the firewall.
    if (node.relayWsUrl != null &&
        node.relayWsUrl!.isNotEmpty &&
        node.homePeerId.isNotEmpty) {
      // Extract the relay's host from the relayWsUrl for the libp2p multiaddr.
      // The relay's libp2p endpoint is on port 4001.
      final relayHost = _extractRelayHost(node.relayWsUrl!);
      if (relayHost != null) {
        final relayPeerId = _relayPeerId; // The relay's own libp2p peer ID
        var url = 'libp2p://${node.homePeerId}'
            '?relay=/ip4/$relayHost/tcp/4001/p2p/$relayPeerId';
        if (sessionToken != null) {
          url += '&token=$sessionToken';
        }
        candidates.add(HomeRemoteCandidate(name: 'p2p', url: url));
      }
    }

    // 4. Relay tunnel WebSocket (WAN fallback via fixed port 15432).
    if (node.relayWsUrl != null && node.relayWsUrl!.isNotEmpty) {
      var url = _stripTokenParam(node.relayWsUrl!);
      if (sessionToken != null) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(name: 'relay', url: url));
    }

    return candidates;
  }

  /// The relay's well-known libp2p peer ID. This must match what the relay
  /// advertises (/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo).
  static const _relayPeerId =
      '12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo';

  /// Extract the relay host from a relay WebSocket URL.
  /// E.g. ws://47.93.11.212:15432/ws → 47.93.11.212
  String? _extractRelayHost(String relayWsUrl) {
    try {
      final uri = Uri.parse(relayWsUrl);
      return uri.host;
    } catch (_) {
      return null;
    }
  }

  /// Remove any `token` query parameter from a URL.
  String _stripTokenParam(String url) {
    final qIdx = url.indexOf('?');
    if (qIdx < 0) return url;
    final base = url.substring(0, qIdx);
    final query = url.substring(qIdx + 1);
    final params =
        query.split('&').where((p) => !p.startsWith('token=')).toList();
    if (params.isEmpty) return base;
    return '$base?${params.join('&')}';
  }
}
