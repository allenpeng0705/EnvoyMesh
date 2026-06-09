import '../models/stored_node.dart';
import 'home_remote_client.dart';

/// Builds transport candidate URLs from stored pairing data.
///
/// Priority order: LAN → public IP → libp2p → relay.
class CandidateResolver {
  /// Resolve transport candidates for a stored node.
  ///
  /// Called on every (re)connect so the resolver can return up-to-date URLs
  /// (e.g. a fresh relay session token, or a LAN URL discovered later).
  List<HomeRemoteCandidate> resolve(StoredNode node, {String? sessionToken}) {
    final candidates = <HomeRemoteCandidate>[];

    // 1. LAN WebSocket (always try first — lowest latency).
    // The node stores the full lanWsUrl from the pairing QR.
    if (node.lanIp != null && node.lanIp!.isNotEmpty) {
      var url = node.lanIp!;
      if (sessionToken != null) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(
        name: 'lan',
        url: url,
      ));
    }

    // 2. Public IP/domain (direct WAN access, no relay needed).
    if (node.publicHost != null && node.publicHost!.isNotEmpty) {
      var url = 'ws://${node.publicHost}:${node.publicPort}/ws';
      if (sessionToken != null) {
        url += '?token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(
        name: 'public',
        url: url,
      ));
    }

    // 3. libp2p via relay circuit (Phase 31D).
    // Connects through the relay's libp2p routing using the client-proxy
    // handshake. The relay routes the stream to the home node, which
    // accepts it via createClientProxyHandler. This is more efficient
    // than the raw WebSocket relay tunnel.
    if (node.relayWsUrl != null &&
        node.relayWsUrl!.isNotEmpty &&
        node.homePeerId.isNotEmpty) {
      candidates.add(HomeRemoteCandidate(
        name: 'libp2p',
        url: 'libp2p://${node.homePeerId}?relay=${Uri.encodeComponent(node.relayWsUrl!)}'
            '${sessionToken != null ? '&token=$sessionToken' : ''}',
      ));
    }

    // 4. Relay tunnel WebSocket (WAN fallback).
    if (node.relayWsUrl != null && node.relayWsUrl!.isNotEmpty) {
      var url = node.relayWsUrl!;
      if (sessionToken != null) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      candidates.add(HomeRemoteCandidate(
        name: 'relay',
        url: url,
      ));
    }

    return candidates;
  }
}
