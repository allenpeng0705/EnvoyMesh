/// Foreground phone discovery: DHT + relay + LAN mDNS (S6/S7).
library;

import 'dart:async';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'dart:developer' as developer;

import 'libp2p_node.dart';
import 'libp2p_mesh_envelope_transport.dart';

void _log(String message) => developer.log(message, name: 'PhoneDiscoverySession');

/// Runs advertise + periodic checkin + mDNS while phone Social is active.
class PhoneDiscoverySession implements PhoneDiscoveryHost {
  PhoneDiscoverySession({
    required Libp2pNode node,
    required PhoneSocialBackend backend,
    List<String> relayBootstrapAddrs =
        defaultEnvoyCommunityRelayBootstrapAddrs,
    Duration checkinInterval = const Duration(seconds: 30),
    bool enableMdns = true,
  })  : _node = node,
        _backend = backend,
        _relayBootstrapAddrs = List.unmodifiable(relayBootstrapAddrs),
        _checkinInterval = checkinInterval,
        _enableMdns = enableMdns {
    _runtime = PhoneDiscoveryRuntime(
      host: this,
      relayBootstrapAddrs: _relayBootstrapAddrs,
    );
  }

  final Libp2pNode _node;
  final PhoneSocialBackend _backend;
  final List<String> _relayBootstrapAddrs;
  final Duration _checkinInterval;
  final bool _enableMdns;

  late final PhoneDiscoveryRuntime _runtime;
  Timer? _checkinTimer;
  bool _active = false;
  int? _boundEpoch;
  MeshEnvelopeTransport? _transport;

  bool get isActive =>
      _active && _boundEpoch != null && _boundEpoch == _node.hostEpoch;
  bool get mdnsActive => _node.mdnsActive;
  PhoneDiscoveryRuntime get runtime => _runtime;

  @override
  String? get libp2pPeerId => _node.peerId?.toString();

  @override
  List<String> relayAdvertisedMultiaddrs() =>
      _node.relayAdvertisedMultiaddrs();

  @override
  Future<void> provideCapabilityTopic(String topic) =>
      _node.provideCapabilityTopic(topic);

  @override
  Future<List<PhoneDiscoveryProvider>> findCapabilityTopicProviders(
    String topic, {
    int maxResults = 20,
  }) =>
      _node.findCapabilityTopicProviders(topic, maxResults: maxResults);

  Future<void> start() async {
    if (_active) return;
    if (!_node.isStarted || _node.peerId == null) {
      throw StateError('Libp2pNode must be started before discovery');
    }
    // TCP listen is ensured by NodeNotifier.ensureLibp2pStarted / ensureTcpListen.
    _boundEpoch = _node.hostEpoch;
    _active = true;
    _transport = Libp2pMeshEnvelopeTransport(_node);
    _backend.replaceWanSearch(_wanSearch);

    if (_enableMdns) {
      // mDNS can be slow / flaky on cellular — do not block discovery "active".
      unawaited(() async {
        try {
          await _node.enableMdns();
        } catch (e) {
          _log('[PhoneDiscoverySession] mDNS start failed: $e');
        }
      }());
    }

    // First DHT/checkin can hang on WAN — keep discovery "active" and retry
    // on the timer without blocking the phone-mesh status UI.
    unawaited(_advertiseAndCheckin());
    _checkinTimer?.cancel();
    _checkinTimer = Timer.periodic(_checkinInterval, (_) {
      unawaited(_advertiseAndCheckin());
    });
  }

  Future<void> stop() async {
    _checkinTimer?.cancel();
    _checkinTimer = null;
    _backend.replaceWanSearch(null);
    _transport = null;
    try {
      await _node.disableMdns();
    } catch (e) {
      _log('[PhoneDiscoverySession] mDNS stop failed: $e');
    }
    _boundEpoch = null;
    _active = false;
  }

  PhoneDiscoveryAdvertisement _ad() {
    final peerId = _node.peerId!.toString();
    final profile = Map<String, dynamic>.from(_backend.store.profile);
    return PhoneDiscoveryAdvertisement(
      ownerId: _backend.ownerId,
      libp2pPeerId: peerId,
      displayName: profile['displayName'] as String?,
      profile: profile,
    );
  }

  Future<void> _advertiseAndCheckin() async {
    if (!_active) return;
    final ad = _ad();
    try {
      await _runtime.advertise(ad);
    } catch (e) {
      _log('[PhoneDiscoverySession] DHT provide failed: $e');
    }
    final payload = _runtime.buildCheckinPayload(ad: ad);
    final unsigned = buildUnsignedSystemEnvelope(
      device: _backend.persona.device,
      intent: 'relay.checkin',
      payload: payload,
    );
    final signed =
        signEnvoyEnvelope(unsigned, _backend.persona.device.privateKeyPem);
    final transport = _transport;
    if (transport == null) return;
    for (final relayAddr in _relayBootstrapAddrs) {
      try {
        final result = await transport.sendEnvelope(
          dialTarget: relayAddr,
          protocolId: envoyMessageProtocol,
          envelope: signed,
          expectReply: false,
        );
        if (!result.ok) {
          _log(
            '[PhoneDiscoverySession] checkin failed $relayAddr: ${result.error}',
          );
        }
      } catch (e) {
        _log('[PhoneDiscoverySession] checkin error $relayAddr: $e');
      }
    }
  }

  Map<String, PhonePeerRecord> _knownByLibp2p() {
    final map = <String, PhonePeerRecord>{};
    for (final peer in _backend.store.peersByOwner.values) {
      if (peer.libp2pPeerId.isNotEmpty) {
        map[peer.libp2pPeerId] = peer;
      }
    }
    return map;
  }

  List<MeshPeerHit> _lanHits({
    required String selfPeer,
    int maxResults = 20,
  }) {
    final known = _knownByLibp2p();
    final hits = <MeshPeerHit>[];
    for (final p in _node.lanDiscoveredPeers(maxResults: maxResults)) {
      if (p.peerId.isEmpty || p.peerId == selfPeer) continue;
      final remembered = known[p.peerId];
      final ownerId = (remembered != null && remembered.ownerId.isNotEmpty)
          ? remembered.ownerId
          : provisionalLanOwnerId(p.peerId);
      hits.add(MeshPeerHit(
        nodeId: p.peerId,
        ownerId: ownerId,
        displayName: remembered?.displayName ??
            (isProvisionalLanOwnerId(ownerId)
                ? 'Nearby (${shortLanPeerLabel(p.peerId)})'
                : null),
        multiaddrs: p.multiaddrs.isNotEmpty
            ? p.multiaddrs
            : (remembered?.multiaddrs ?? const []),
        interests: const ['lan'],
        profileVisibility: 'public',
      ));
    }
    return hits;
  }

  Future<List<MeshPeerHit>> _wanSearch({
    String? topic,
    List<String>? interests,
    String? peerId,
    int maxResults = 20,
  }) async {
    final selfPeer = _node.peerId?.toString() ?? '';
    final selfOwner = _backend.ownerId;
    final needle = (peerId ?? '').trim();
    if (needle.isNotEmpty) {
      // Direct peer lookup: local LAN first, then DHT findPeer if available.
      final lan = _lanHits(selfPeer: selfPeer, maxResults: maxResults)
          .where((h) => h.nodeId == needle || h.ownerId == needle)
          .toList();
      if (lan.isNotEmpty) return lan;
      return [
        MeshPeerHit(
          nodeId: needle,
          ownerId: provisionalLanOwnerId(needle),
          displayName: 'Peer (${shortLanPeerLabel(needle)})',
          multiaddrs: ['/p2p/$needle'],
          profileVisibility: 'public',
        ),
      ];
    }

    final queries = _runtime.queryTopics(topic: topic, interests: interests);

    // LAN is instant. DHT + relay can stall — bound each leg so Discover UI
    // never waits forever when the tower already shows Connected.
    final lanHits = _lanHits(selfPeer: selfPeer, maxResults: maxResults);

    final dhtFuture = _runtime
        .searchDht(
          selfLibp2pPeerId: selfPeer,
          queryTopics: queries,
          maxResults: maxResults,
        )
        .timeout(
          const Duration(seconds: 8),
          onTimeout: () {
            _log('[PhoneDiscoverySession] DHT search timed out');
            return const <MeshPeerHit>[];
          },
        );

    final relayFuture = _relayLookupHits(
      queries: queries,
      selfPeer: selfPeer,
      selfOwner: selfOwner,
      maxResults: maxResults,
    ).timeout(
      const Duration(seconds: 12),
      onTimeout: () {
        _log('[PhoneDiscoverySession] relay lookup timed out');
        return const <MeshPeerHit>[];
      },
    );

    final parts = await Future.wait([dhtFuture, relayFuture]);
    final dhtHits = parts[0];
    final relayHits = parts[1];

    final merged = PhoneDiscoveryRuntime.mergeHits(
      [...lanHits, ...dhtHits, ...relayHits],
      selfLibp2pPeerId: selfPeer,
      selfOwnerId: selfOwner,
      maxResults: maxResults,
    ).map((hit) {
      // DHT-only providers have no owner DID — invent a provisional one so
      // Discover UI can show the hit (empty ownerId is otherwise filtered).
      if (hit.ownerId.isNotEmpty || hit.nodeId.isEmpty) return hit;
      return MeshPeerHit(
        nodeId: hit.nodeId,
        ownerId: provisionalLanOwnerId(hit.nodeId),
        displayName: hit.displayName ??
            'Nearby (${shortLanPeerLabel(hit.nodeId)})',
        interests: hit.interests,
        profileVisibility: hit.profileVisibility,
        trustLevel: hit.trustLevel,
        multiaddrs: hit.multiaddrs,
      );
    }).toList();

    // Persist dial hints for hello (WAN + provisional LAN owners).
    for (final hit in merged) {
      if (hit.ownerId.isEmpty) continue;
      if (hit.multiaddrs.isEmpty && !isProvisionalLanOwnerId(hit.ownerId)) {
        continue;
      }
      try {
        await _backend.rememberPeer(PhonePeerRecord(
          ownerId: hit.ownerId,
          libp2pPeerId: hit.nodeId,
          displayName: hit.displayName,
          multiaddrs: hit.multiaddrs,
        ));
      } catch (_) {}
    }

    return merged;
  }

  Future<List<MeshPeerHit>> _relayLookupHits({
    required List<String> queries,
    required String selfPeer,
    required String selfOwner,
    required int maxResults,
  }) async {
    final relayHits = <MeshPeerHit>[];
    final transport = _transport;
    if (transport == null) return relayHits;

    // Prefer the primary community relay for search latency; skip extras
    // unless the primary fails every query.
    final primary = _relayBootstrapAddrs.contains(
          defaultEnvoyCommunityRelayBootstrapAddr,
        )
        ? defaultEnvoyCommunityRelayBootstrapAddr
        : _relayBootstrapAddrs.first;
    final fallback = [
      for (final a in _relayBootstrapAddrs)
        if (a != primary) a,
    ];

    // Run query topics in parallel — sequential lookups burned the Discover
    // sample budget when a slug expands to 4+ topic keys.
    final batches = await Future.wait([
      for (final q in queries)
        () async {
          final payload = _runtime.buildLookupPayload(
            queryTopic: q,
            maxResults: maxResults,
          );
          final unsigned = buildUnsignedSystemEnvelope(
            device: _backend.persona.device,
            intent: 'relay.lookup',
            payload: payload,
          );
          final signed = signEnvoyEnvelope(
            unsigned,
            _backend.persona.device.privateKeyPem,
          );
          for (final relayAddr in [primary, ...fallback]) {
            try {
              final result = await transport.sendEnvelope(
                dialTarget: relayAddr,
                protocolId: envoyMessageProtocol,
                envelope: signed,
                expectReply: true,
              );
              if (!result.ok || result.replyEnvelope == null) continue;
              final reply = Map<String, Object?>.from(result.replyEnvelope!);
              if (!isAcceptableRelayLookupResponse(
                reply,
                dialedTrustedRelay: true,
              )) {
                _log(
                  '[PhoneDiscoverySession] lookup rejected (untrusted reply) $relayAddr',
                );
                continue;
              }
              final peers = parseRelayLookupPeers(reply['payload']);
              final candidates = [
                for (final p in peers) RelayLookupCandidate.fromJson(p),
              ];
              final batch = _runtime.hitsFromRelayCandidates(
                candidates,
                selfLibp2pPeerId: selfPeer,
                selfOwnerId: selfOwner,
              );
              if (batch.isNotEmpty) return batch;
            } catch (e) {
              _log(
                '[PhoneDiscoverySession] lookup error $relayAddr: $e',
              );
            }
          }
          _log('[PhoneDiscoverySession] no relay hits for query=$q');
          return const <MeshPeerHit>[];
        }(),
    ]);
    for (final batch in batches) {
      relayHits.addAll(batch);
    }
    return relayHits;
  }
}
