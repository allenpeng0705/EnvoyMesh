import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:envoy_thin_client/services/home_remote_client.dart';

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
  /// [communityRelayRequiresPeerId] makes the shared community relay a candidate **only** when the
  /// stored node names the home's peer id — the relay routes by peer id, so a candidate without one
  /// dials shared infrastructure with nothing to route to. The default keeps EnvoyGo's token-only
  /// fallback (see [_buildCommunityRelayCandidates]); a product whose daemon is reachable through the
  /// relay only as a peer sets it, so it never advertises a rung that cannot dial.
  const CandidateResolver({this.communityRelayRequiresPeerId = false});

  final bool communityRelayRequiresPeerId;

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
          print(
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
  /// (3 on Wi‑Fi, 2 otherwise). LAN is always tried first when known —
  /// unreachable private IPs fail fast via HomeRemoteClient. The off-LAN
  /// cap used to be 1 and was filled by the first direct address, which on
  /// a phone that left the LAN is `127.0.0.1` or a private IP: the circuit
  /// the QR carried was dropped and cellular could not connect.
  List<HomeRemoteCandidate> resolve(StoredNode node,
      {String? sessionToken, bool? isOnWifi}) {
    final p2pCandidates = _buildLibp2pCandidates(node, sessionToken);
    final relayWsCandidates = _buildRelayWsCandidates(node, sessionToken);
    final lanCandidates = _buildLanCandidates(node, sessionToken);
    final publicCandidates = _buildPublicCandidates(node, sessionToken);
    final bootstrapCandidates =
        _buildBootstrapPeerCandidates(node, sessionToken);

    final onWifi = isOnWifi ?? false;
    // Two off Wi‑Fi, not one. One slot was spent on the private direct address
    // and the circuit never ran. Wi‑Fi keeps one more so a same-LAN libp2p dial
    // can still sit beside the circuit.
    final p2pCap = onWifi ? 3 : 2;

    return [
      ...lanCandidates,
      ...publicCandidates,
      ..._limitLibp2p(p2pCandidates, max: p2pCap),
      ...bootstrapCandidates,
      ...relayWsCandidates,
    ];
  }

  /// Cap expensive libp2p candidates.
  ///
  /// Order under the cap, best first:
  ///   1. a **public** direct address — one hop, and it is reachable from cellular;
  ///   2. a relay circuit, **cn-relay first** — the hop that works once the phone
  ///      has left the LAN;
  ///   3. a private or loopback direct — only useful on the same network, and the
  ///      LAN WebSocket is already a separate rung tried before any of these.
  ///      Loopback is last: `127.0.0.1` on the phone is the phone, not the desktop.
  ///
  /// A private direct used to outrank every circuit. On cellular the cap was one,
  /// so the walk dialled `127.0.0.1` (or `192.168.x`) and never the circuit the
  /// QR had already published. Same-LAN still wins earlier, on the LAN WebSocket,
  /// so demoting these addresses does not slow the easy case.
  List<HomeRemoteCandidate> _limitLibp2p(
    List<HomeRemoteCandidate> all, {
    required int max,
  }) {
    if (all.length <= max) return all;
    final publicDirect = <HomeRemoteCandidate>[];
    final lanDirect = <HomeRemoteCandidate>[];
    final loopbackDirect = <HomeRemoteCandidate>[];
    final relays = <HomeRemoteCandidate>[];
    for (final candidate in all) {
      if (!candidate.name.startsWith('p2p-direct')) {
        relays.add(candidate);
        continue;
      }
      if (_isLoopbackMultiaddr(candidate.url)) {
        loopbackDirect.add(candidate);
      } else if (_multiaddrIsLanOnly(candidate.url)) {
        lanDirect.add(candidate);
      } else {
        publicDirect.add(candidate);
      }
    }
    final preferred =
        relays.where((c) => c.name.contains('cn-relay')).toList();
    final other =
        relays.where((c) => !c.name.contains('cn-relay')).toList();
    return <HomeRemoteCandidate>[
      ...publicDirect,
      ...preferred,
      ...other,
      ...lanDirect,
      ...loopbackDirect,
    ].take(max).toList();
  }

  /// A direct multiaddr the phone can only reach on the same network.
  ///
  /// Loopback, RFC1918, link-local, and carrier-grade NAT. A public address
  /// returns false so it keeps its place ahead of the circuit.
  bool _multiaddrIsLanOnly(String multiaddr) {
    final match =
        RegExp(r'^/ip4/(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}/').firstMatch(multiaddr);
    if (match == null) return _isLoopbackMultiaddr(multiaddr);
    final a = int.parse(match.group(1)!);
    final b = int.parse(match.group(2)!);
    if (a == 0 || a == 10 || a == 127) return true;
    if (a == 169 && b == 254) return true;
    if (a == 192 && b == 168) return true;
    if (a == 172 && b >= 16 && b <= 31) return true;
    if (a == 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  bool _isLoopbackMultiaddr(String multiaddr) =>
      multiaddr.startsWith('/ip4/127.') || multiaddr.startsWith('/ip6/::1/');

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

    // A "relay" base that is identical to the LAN WS URL is not a real
    // relay — it is the pairing QR's wsUrl fallback when no relay was
    // configured (relayWsUrl ?? wsUrl where wsUrl == lanWsUrl). Dialing it
    // with ?target= targets the home's own /ws server, which does not speak
    // the proxy protocol, so the attempt can only burn time (especially from
    // cellular, where the private IP is unreachable anyway).
    final lanBase = _stripTokenParam(node.lanIp ?? '');

    void addBase(String? raw) {
      if (raw == null || raw.isEmpty) return;
      final base = _stripTokenParam(raw);
      if (base.isEmpty) return;
      // Skip built-in community here — added last as community-relay.
      if (base.contains(_communityRelayHost)) return;
      if (lanBase.isNotEmpty && base == lanBase) return;
      if (!bases.contains(base)) bases.add(base);
    }

    addBase(node.relayWsUrl);
    for (final peer in node.bootstrapPeers) {
      if (peer.startsWith('/')) continue; // libp2p multiaddr → P2P path
      addBase(peer);
    }

    final homePeerId = node.homePeerId.trim();
    for (var i = 0; i < bases.length; i++) {
      final relayBase = bases[i];
      var relayUrl = relayBase;
      if (homePeerId.isNotEmpty) {
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

  /// The community relay's public IP (well-known).
  static const _communityRelayHost = '47.93.11.212';

  /// The community relay's WebSocket port.
  static const _communityRelayWsPort = 15432;

  /// The community relay's libp2p multiaddr prefix (for circuit relay dialing).
  /// Used to build libp2p candidates when WebSocket relay is unavailable.
  static const _communityRelayLibp2pMultiaddr =
      '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo';

  /// Build libp2p candidates: a **direct** dial to the home when the payload carried the home's own
  /// addresses, and a **circuit-relay** hop for every relay that can reach it.
  ///
  /// `node.bootstrapPeers` is documented by the pairing contract
  /// (`PairWithHomeNodeParams.bootstrapPeers`) as *the home node's dialable libp2p multiaddrs*, but
  /// the same list has always carried the home's relay/bootstrap peers too (EnvoyGo's relay hints).
  /// Three shapes are told apart by structure: a plain address ending in `/p2p/<home>` is a **direct**
  /// dial; a `/p2p-circuit/p2p/<home>` route is a **relay** route and is dialled as advertised but
  /// named by its first hop; any other address is a relay the home is dialled *through*.
  ///
  /// Before this, a home address was fed to the circuit builder and produced
  /// `/p2p/<home>/p2p-circuit/p2p/<home>`: the home used as its own relay. That is a dial which
  /// cannot work, and it made the field the contract documents for direct dialling useless.
  ///
  /// Uses [node.homePeerId] as the circuit relay destination. If unavailable, no candidate can be
  /// built at all: both a direct dial and a circuit address are addressed to a peer id.
  List<HomeRemoteCandidate> _buildLibp2pCandidates(
      StoredNode node, String? sessionToken) {
    final result = <HomeRemoteCandidate>[];

    final homePeerId = node.homePeerId.trim();
    if (homePeerId.isEmpty) {
      return result;
    }

    final directAddrs = <String>[];

    // Circuit routes the payload already carries whole, keyed by their first-hop relay's peer id.
    // A `/p2p-circuit/` address that terminates at the home is **not** a direct dial: the route is
    // the relay hop, so it is dialled as advertised but named by its relay below. Keeping it out of
    // `directAddrs` is what stops the label `p2p-direct` from being shown for a two-hop route.
    final advertisedCircuits = <String, String>{};

    // Build circuit relay candidates for ALL bootstrap relays (not just cn-relay).
    // Each candidate tries a different relay hop.
    final relayMultiaddrs = <String, String>{
      // cn-relay (community relay) — always available as fallback
      'cn-relay': _communityRelayLibp2pMultiaddr,
    };

    // Add all bootstrap relays from the stored node (synced from home node via QR).
    // node.bootstrapPeers may contain:
    // 1. Full libp2p multiaddrs — the home's own (direct dial), a relay's (circuit hop) or an
    //    already-built circuit route to the home (relay route)
    // 2. Preset names (e.g., "public-libp2p-am6") — resolve to multiaddrs
    // WebSocket entries are dialled by [_buildRelayWsCandidates], not here.
    for (final peer in node.bootstrapPeers) {
      if (peer.startsWith('/')) {
        if (_isCircuit(peer)) {
          // The relay is the first hop; a circuit that ends anywhere but the home cannot reach it,
          // so it builds no rung.
          final relayPeerId = _circuitRelayPeer(peer);
          if (relayPeerId != null && _addressedPeer(peer) == homePeerId) {
            advertisedCircuits.putIfAbsent(relayPeerId, () => peer);
          }
          continue;
        }
        if (_addressNamesHome(peer, homePeerId)) {
          if (!directAddrs.contains(peer)) directAddrs.add(peer);
          continue;
        }
        if (!relayMultiaddrs.containsValue(peer)) {
          final name = _extractRelayName(peer);
          relayMultiaddrs[name] = peer;
        }
      } else if (!peer.contains(':') && peer.isNotEmpty) {
        for (final addr in resolveBootstrapPresets([peer])) {
          if (!relayMultiaddrs.containsValue(addr)) {
            relayMultiaddrs[peer] = addr;
          }
        }
      }
    }

    // The direct addresses first: one hop instead of two, and no relay has to be up.
    for (var i = 0; i < directAddrs.length; i++) {
      result.add(HomeRemoteCandidate(
        name: i == 0 ? 'p2p-direct' : 'p2p-direct-$i',
        url: directAddrs[i],
        homePeerId: homePeerId,
        sessionToken: sessionToken,
        libp2pRelayAddr: directAddrs[i],
      ));
    }

    // Routes the payload handed us whole come before routes we build: the advertised circuit names
    // the exact relay transport, while our own hop names only the relay's peer id. Both are relay
    // rungs and are labelled as such.
    final advertisedNames = <String>{};
    for (final addr in advertisedCircuits.values) {
      final relayName = _extractRelayName(_circuitRelayPrefix(addr));
      advertisedNames.add(relayName);
      result.add(HomeRemoteCandidate(
        name: 'p2p-$relayName',
        url: addr,
        homePeerId: homePeerId,
        sessionToken: sessionToken,
        libp2pRelayAddr: addr,
      ));
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

      // The payload already carries a whole circuit route through this relay (or one with the same
      // name): dial that one instead of adding a second rung for the same hop.
      if (advertisedCircuits.containsKey(relayPeerId) ||
          advertisedNames.contains(relayName)) {
        continue;
      }

      // Build the circuit relay address: /p2p/<relayPeerId>/p2p-circuit/p2p/<homePeerId>
      final circuitAddr =
          '/p2p/$relayPeerId/p2p-circuit/p2p/$homePeerId';

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

  /// Whether [multiaddr] is a plain address that names [homePeerId] directly.
  ///
  /// Only the final `/p2p/` component counts. A `/p2p-circuit/` address therefore never names the
  /// home *directly*: its destination is the home, but its route is the relay at the first hop, and
  /// [_buildLibp2pCandidates] labels it as one. Comparing the id is what keeps a relay hop and a home
  /// address from being confused for one another — they are the same shape. The earlier version
  /// returned true for *any* address containing `/p2p-circuit/`, which is how a desktop-advertised
  /// `/ip4/…/p2p/<relay>/p2p-circuit/p2p/<home>` was shown to the user as `p2p-direct`.
  bool _addressNamesHome(String multiaddr, String homePeerId) {
    final addressed = _addressedPeer(multiaddr);
    return addressed != null && addressed == homePeerId;
  }

  /// Whether [multiaddr] is a `/p2p-circuit/` route rather than a plain address.
  bool _isCircuit(String multiaddr) => multiaddr.contains('/p2p-circuit/');

  /// The peer a multiaddr ultimately addresses: the final `/p2p/` component, or null. For
  /// `/ip4/…/p2p/<relay>/p2p-circuit/p2p/<home>` this is `<home>`; for `/ip4/…/p2p/<peer>` it is
  /// `<peer>`.
  String? _addressedPeer(String multiaddr) {
    final p2pIndex = multiaddr.lastIndexOf('/p2p/');
    return p2pIndex < 0 ? null : multiaddr.substring(p2pIndex + 5);
  }

  /// The first-hop relay of a circuit route: the `/p2p/` component immediately before
  /// `/p2p-circuit/`, or null. Deliberately not the final `/p2p/` component, which is the
  /// destination (the home).
  String? _circuitRelayPeer(String multiaddr) {
    final circuitIndex = multiaddr.indexOf('/p2p-circuit/');
    if (circuitIndex < 0) return null;
    final p2pIndex = multiaddr.lastIndexOf('/p2p/', circuitIndex);
    return p2pIndex < 0 ? null : multiaddr.substring(p2pIndex + 5, circuitIndex);
  }

  /// The relay's own address inside a circuit route: everything before `/p2p-circuit/`. Used to name
  /// the route, never to dial it.
  String _circuitRelayPrefix(String multiaddr) {
    final circuitIndex = multiaddr.indexOf('/p2p-circuit/');
    return circuitIndex < 0 ? multiaddr : multiaddr.substring(0, circuitIndex);
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
    // A product whose daemon is reachable through the community relay only as a peer: with no peer
    // id there is nothing for the relay to route to, so the token-only fallback below would be a
    // candidate that cannot dial. Omitted rather than offered (see the constructor).
    if (communityRelayRequiresPeerId &&
        (_communityHomePeerId == null || _communityHomePeerId!.isEmpty)) {
      return result;
    }
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
  static String? _communityHomePeerId;

  /// Set the community relay's home peer ID. Called by the node provider
  /// after loading the stored node so the community relay candidate
  /// includes the correct peer ID for peer routing.
  static void setCommunityHomePeerId(String? peerId) {
    _communityHomePeerId = peerId;
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
