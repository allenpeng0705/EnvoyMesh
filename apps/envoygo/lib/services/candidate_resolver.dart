import 'package:flutter/foundation.dart';
import '../models/stored_node.dart';
import 'home_remote_client.dart';

/// Builds transport candidate URLs from stored pairing data.
///
/// **Every connect / restart / reconnect** uses the same priority:
///   1. LAN (Wi‑Fi direct) — when `lanIp` was stored at pair time
///   2. Public IP direct — when configured
///   3. P2P (libp2p circuit / DHT) — capped so dials stay bounded
///   4. Bootstrap WS peers
///   5. Relay WebSocket (user + community) — **fallback last**
///
/// Relay must not win just because it was first in the list after a 5G
/// pairing; sequential dial stops at the first success.
class CandidateResolver {
  /// Resolve bootstrap preset names to full libp2p multiaddr strings.
  ///
  /// Maps preset names like "public-libp2p-am6" to their full multiaddr
  /// like "/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq".
  static List<String> resolveBootstrapPresets(List<String> presets) {
    final result = <String>[];
    for (final preset in presets) {
      switch (preset) {
        case 'public-libp2p-am6':
          result.add(
              '/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq');
          break;
        case 'public-libp2p-am7':
          result.add(
              '/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf');
          break;
        case 'public-libp2p':
          // bootstrap.libp2p.io has 4 peer IDs
          result.add(
              '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN');
          result.add(
              '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa');
          result.add(
              '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq');
          result.add(
              '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf');
          break;
        case 'cn-relay':
          result.add(
              '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo');
          break;
        default:
          debugPrint(
              '[CandidateResolver] Unknown bootstrap preset: $preset');
      }
    }
    return result;
  }

  /// Resolve transport candidates for a stored node.
  ///
  /// Called on every (re)connect / app restart. Order is always
  /// LAN → public → P2P → bootstrap → relay (fallback).
  ///
  /// [isOnWifi] only affects how many expensive libp2p candidates we keep
  /// (more on Wi‑Fi, fewer on cellular). LAN is always tried first when
  /// known — unreachable private IPs fail fast via HomeRemoteClient.
  List<HomeRemoteCandidate> resolve(StoredNode node,
      {String? sessionToken, bool? isOnWifi}) {
    final p2pCandidates = _buildLibp2pCandidates(node, sessionToken);
    final relayWsCandidates = _buildRelayWsCandidates(node, sessionToken);
    final lanCandidates = _buildLanCandidates(node, sessionToken);
    final publicCandidates = _buildPublicCandidates(node, sessionToken);
    final bootstrapCandidates =
        _buildBootstrapPeerCandidates(node, sessionToken);

    final onWifi = isOnWifi ?? false;
    final p2pCap = onWifi ? 2 : 1;

    return [
      ...lanCandidates,
      ...publicCandidates,
      ..._limitLibp2p(p2pCandidates, max: p2pCap),
      ...bootstrapCandidates,
      ...relayWsCandidates,
    ];
  }

  /// Cap expensive libp2p candidates (prefer cn-relay / community when present).
  List<HomeRemoteCandidate> _limitLibp2p(
    List<HomeRemoteCandidate> all, {
    required int max,
  }) {
    if (all.length <= max) return all;
    final preferred = all.where((c) => c.name.contains('cn-relay')).toList();
    if (preferred.isNotEmpty) {
      return preferred.take(max).toList();
    }
    return all.take(max).toList();
  }

  /// Build LAN WebSocket candidates.
  List<HomeRemoteCandidate> _buildLanCandidates(
      StoredNode node, String? sessionToken) {
    if (node.lanIp == null || node.lanIp!.isEmpty) return [];
    var url = node.lanIp!;
    final hasScheme = url.startsWith('ws://') || url.startsWith('wss://');
    final hasPath =
        hasScheme ? url.contains('/', url.indexOf('://') + 3) : url.contains('/');
    if (!hasScheme) {
      url = hasPath ? 'ws://$url' : 'ws://$url/ws';
    } else if (!hasPath) {
      url = '$url/ws';
    }
    if (sessionToken != null) {
      url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
    }
    return [
      HomeRemoteCandidate(
          name: 'lan', url: url, homePeerId: null, sessionToken: null)
    ];
  }

  /// Build public IP WebSocket candidates.
  List<HomeRemoteCandidate> _buildPublicCandidates(
      StoredNode node, String? sessionToken) {
    if (node.publicHost == null || node.publicHost!.isEmpty) return [];
    var url = 'ws://${node.publicHost}:${node.publicPort}/ws';
    if (sessionToken != null) {
      url += '?token=$sessionToken';
    }
    return [
      HomeRemoteCandidate(
          name: 'public', url: url, homePeerId: null, sessionToken: null)
    ];
  }

  /// Build relay WebSocket candidates (primary + QR extras + community).
  List<HomeRemoteCandidate> _buildRelayWsCandidates(
      StoredNode node, String? sessionToken) {
    final result = <HomeRemoteCandidate>[];
    final bases = <String>[];

    void addBase(String? raw) {
      if (raw == null || raw.isEmpty) return;
      final base = _stripTokenParam(raw);
      if (base.isEmpty) return;
      // Skip built-in community here — added last as community-relay.
      if (base.contains(_communityRelayHost)) return;
      if (!bases.contains(base)) bases.add(base);
    }

    addBase(node.relayWsUrl);
    for (final peer in node.bootstrapPeers) {
      if (peer.startsWith('/')) continue; // libp2p multiaddr → P2P path
      addBase(peer);
    }

    final homePeerId = node.homePeerId?.trim();
    for (var i = 0; i < bases.length; i++) {
      final relayBase = bases[i];
      var relayUrl = relayBase;
      if (homePeerId != null && homePeerId.isNotEmpty) {
        relayUrl = '$relayBase?target=$homePeerId';
        if (sessionToken != null) {
          relayUrl += '&token=$sessionToken';
        }
      } else if (sessionToken != null) {
        relayUrl =
            '$relayBase${relayBase.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      result.add(HomeRemoteCandidate(
        name: i == 0 ? 'relay' : 'relay-$i',
        url: relayUrl,
        homePeerId: homePeerId,
        sessionToken: sessionToken,
      ));
    }

    // Community relay WebSocket (final WebSocket fallback).
    result.addAll(_buildCommunityRelayCandidates(sessionToken));

    return result;
  }

  /// The relay's well-known libp2p peer ID. This must match what the relay
  /// advertises (/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo).
  static const _relayPeerId =
      '12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo';

  /// The community relay's public IP (well-known).
  static const _communityRelayHost = '47.93.11.212';

  /// The community relay's WebSocket port.
  static const _communityRelayWsPort = 15432;

  /// The community relay's libp2p multiaddr prefix (for circuit relay dialing).
  /// Used to build libp2p candidates when WebSocket relay is unavailable.
  static const _communityRelayLibp2pMultiaddr =
      '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo';

  /// Build libp2p circuit relay candidates.
  ///
  /// Uses the community relay's libp2p address to dial the home node
  /// via circuit relay v2. This works when the relay WebSocket is down
  /// but the libp2p circuit relay is still operational.
  ///
  /// The circuit address format is:
  ///   /p2p/<relayPeerId>/p2p-circuit/p2p/<homePeerId>
  /// Build libp2p circuit relay candidates from all bootstrap relays.
  ///
  /// Tries circuit relay via each bootstrap relay (cn-relay, am6, am7, etc.)
  /// so mobile can fall back to any relay that works.
  List<HomeRemoteCandidate> _buildLibp2pCandidates(
      StoredNode node, String? sessionToken) {
    final result = <HomeRemoteCandidate>[];

    // Use node.homePeerId as the circuit relay destination. This is the
    // home node's libp2p peer ID — required for building /p2p-circuit/p2p/<home>
    // addresses. If unavailable, we cannot build circuit relay candidates.
    debugPrint(
        '[_buildLibp2pCandidates] ENTERING — _communityHomePeerId=$_communityHomePeerId, node.homePeerId=${node.homePeerId}, node.bootstrapPeers=${node.bootstrapPeers}');
    final homePeerId = node.homePeerId?.trim();
    if (homePeerId == null || homePeerId.isEmpty) {
      debugPrint(
          '[_buildLibp2pCandidates] node.homePeerId is null/empty, cannot build circuit relay candidates');
      return result;
    }

    // Build circuit relay candidates for ALL bootstrap relays (not just cn-relay).
    // Each candidate tries a different relay hop.
    final relayMultiaddrs = <String, String>{
      // cn-relay (community relay) — always available as fallback
      'cn-relay': _communityRelayLibp2pMultiaddr,
    };

    // Add all bootstrap relays from the stored node (synced from home node via QR).
    // node.bootstrapPeers may contain either:
    // 1. Full libp2p multiaddrs (e.g., /dnsaddr/am6.bootstrap.libp2p.io/p2p/...)
    // 2. Preset names (e.g., "public-libp2p-am6") — resolve to multiaddrs
    debugPrint(
        '[_buildLibp2pCandidates] node.bootstrapPeers: ${node.bootstrapPeers}');
    for (final peer in node.bootstrapPeers) {
      if (peer.startsWith('/')) {
        // Full multiaddr — use directly
        debugPrint(
            '[_buildLibp2pCandidates] full multiaddr: $peer');
        if (!relayMultiaddrs.containsValue(peer)) {
          final name = _extractRelayName(peer);
          relayMultiaddrs[name] = peer;
        }
      } else {
        // Preset name — resolve to multiaddrs
        final resolved = resolveBootstrapPresets([peer]);
        debugPrint(
            '[_buildLibp2pCandidates] preset "$peer" resolved to: $resolved');
        for (final addr in resolved) {
          if (!relayMultiaddrs.containsValue(addr)) {
            relayMultiaddrs[peer] = addr;
          }
        }
      }
    }

    for (final entry in relayMultiaddrs.entries) {
      final relayName = entry.key;
      final relayMultiaddr = entry.value;

      // Extract relay peer ID from the multiaddr.
      // Format: /ip4/X.X.X.X/tcp/N/p2p/<peerId> or /dnsaddr/.../p2p/<peerId>
      final p2pIndex = relayMultiaddr.lastIndexOf('/p2p/');
      if (p2pIndex < 0) continue;

      final relayPeerId = relayMultiaddr.substring(p2pIndex + 5);
      if (relayPeerId.isEmpty) continue;

      // Build the circuit relay address: /p2p/<relayPeerId>/p2p-circuit/p2p/<homePeerId>
      final circuitAddr =
          '/p2p/$relayPeerId/p2p-circuit/p2p/$homePeerId';

      debugPrint(
          '[_buildLibp2pCandidates] adding relay candidate: name=$relayName, addr=$circuitAddr');

      result.add(HomeRemoteCandidate(
        name: 'p2p-$relayName',
        url: circuitAddr,
        homePeerId: homePeerId,
        sessionToken: sessionToken,
        libp2pRelayAddr: relayMultiaddr,
      ));
    }

    return result;
  }

  /// Extract a readable name from a libp2p multiaddr.
  String _extractRelayName(String multiaddr) {
    if (multiaddr.contains('am6.bootstrap')) return 'am6';
    if (multiaddr.contains('am7.bootstrap')) return 'am7';
    if (multiaddr.contains('bootstrap.libp2p.io')) return 'bootstrap-libp2p';
    if (multiaddr.contains('47.93.11.212')) return 'cn-relay';
    // Extract from peer ID suffix
    final p2pIdx = multiaddr.lastIndexOf('/p2p/');
    if (p2pIdx >= 0) {
      final peerId = multiaddr.substring(p2pIdx + 5);
      return peerId.length > 8 ? peerId.substring(0, 8) : peerId;
    }
    return 'relay';
  }

  /// Build candidates from the bootstrap peers list in the stored node.
  ///
  /// WebSocket URLs are handled by [_buildRelayWsCandidates] (with
  /// `target=` routing). This path only keeps non-WS leftovers.
  List<HomeRemoteCandidate> _buildBootstrapPeerCandidates(
      StoredNode node, String? sessionToken) {
    final result = <HomeRemoteCandidate>[];
    for (final peer in node.bootstrapPeers) {
      // Skip libp2p multiaddrs (start with /ip4/, /ip6/, /dnsaddr/, etc.)
      // These are handled by _buildLibp2pCandidates() which creates proper
      // circuit relay candidates.
      if (peer.startsWith('/')) continue;
      // WS / host:port entries are tried as relay candidates (with target=).
      if (peer.startsWith('ws://') ||
          peer.startsWith('wss://') ||
          peer.contains(':')) {
        continue;
      }

      var url = peer;
      if (sessionToken != null && !url.contains('token=')) {
        url += '${url.contains('?') ? '&' : '?'}token=$sessionToken';
      }
      result.add(HomeRemoteCandidate(
        name: 'bootstrap',
        url: url,
        homePeerId: node.homePeerId,
        sessionToken: sessionToken,
      ));
    }
    return result;
  }

  /// Build candidates for the community relay.
  ///
  /// The community relay has two purposes:
  /// 1. As a circuit-relay v2 hop: mobile dials
  ///    `ws://47.93.11.212:15432/ws?target=<homePeerId>`
  ///    — requires knowing the home's peer ID (from pairing). Used when
  ///    `homePeerId` is available.
  /// 2. As a DHT bootstrap peer: mobile connects to the relay's WebSocket
  ///    (`ws://47.93.11.212:15432/ws`) and uses its DHT server to find
  ///    the home node's advertised addresses. Used when `homePeerId` is
  ///    unknown or all other candidates failed.
  List<HomeRemoteCandidate> _buildCommunityRelayCandidates(
      String? sessionToken) {
    final result = <HomeRemoteCandidate>[];
    // Port 15432 is plain HTTP WebSocket, not TLS. Using wss:// causes
    // "WRONG_VERSION_NUMBER" TLS handshake errors.
    final wsUrl = 'ws://$_communityRelayHost:$_communityRelayWsPort/ws';
    // Community relay with peer routing (requires homePeerId — from QR
    // code pairing). The relay's WebSocket accepts ?target=<homePeerId>
    // for circuit-relay routing.
    if (_communityHomePeerId != null && _communityHomePeerId!.isNotEmpty) {
      var url = '$wsUrl?target=$_communityHomePeerId';
      if (sessionToken != null) {
        url += '&token=$sessionToken';
      }
      result.add(HomeRemoteCandidate(
        name: 'community-relay',
        url: url,
        homePeerId: _communityHomePeerId,
        sessionToken: sessionToken,
      ));
    }
    // Only add the non-peer-routed fallback when homePeerId is unknown.
    // When homePeerId IS known, the peer-routed candidate above is
    // strictly better (specific routing vs token-only fallback).
    if (_communityHomePeerId == null || _communityHomePeerId!.isEmpty) {
      var relayUrl = wsUrl;
      if (sessionToken != null) {
        relayUrl += '?token=$sessionToken';
      }
      result.add(HomeRemoteCandidate(
        name: 'community-relay',
        url: relayUrl,
        homePeerId: _communityHomePeerId,
        sessionToken: sessionToken,
      ));
    }
    return result;
  }

  /// The community relay's well-known home peer ID (used for peer routing
  /// through the community relay). This is set from the stored
  /// node's homePeerId when available.
  /// NOTE: For Option B DHT bootstrap to work, the community relay needs to
  /// know about the home node (i.e., the home node must have connected to
  /// the community relay at least once). This is configured via the
  /// `--bootstrap-preset cn-relay` flag on the home node.
  static String? _communityHomePeerId = null;

  /// Set the community relay's home peer ID. Called by the node provider
  /// after loading the stored node so the community relay candidate
  /// includes the correct peer ID for peer routing.
  static void setCommunityHomePeerId(String? peerId) {
    _communityHomePeerId = peerId;
  }

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
