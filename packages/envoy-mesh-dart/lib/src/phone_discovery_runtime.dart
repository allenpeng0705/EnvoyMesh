/// Phone WAN discovery: advertise topics + search via DHT/relay seams.
library;

import 'capability_topic_cid.dart';
import 'discovery_topics.dart';
import 'models.dart';
import 'relay_envelope_factory.dart';

/// Host surface needed by [PhoneDiscoveryRuntime] (implemented in EnvoyGo).
abstract class PhoneDiscoveryHost {
  /// Local libp2p PeerId string (transport face P).
  String? get libp2pPeerId;

  /// Multiaddrs safe for `relay.checkin` (prefer `/p2p-circuit/` paths).
  List<String> relayAdvertisedMultiaddrs();

  /// DHT provide for a capability topic (CID derived from [topic]).
  Future<void> provideCapabilityTopic(String topic);

  /// DHT findProviders for [topic]; returns peerId + multiaddrs.
  Future<List<PhoneDiscoveryProvider>> findCapabilityTopicProviders(
    String topic, {
    int maxResults = 20,
  });
}

class PhoneDiscoveryProvider {
  const PhoneDiscoveryProvider({
    required this.peerId,
    this.multiaddrs = const [],
  });

  final String peerId;
  final List<String> multiaddrs;
}

/// Profile + identity inputs for advertising.
class PhoneDiscoveryAdvertisement {
  const PhoneDiscoveryAdvertisement({
    required this.ownerId,
    required this.libp2pPeerId,
    this.displayName,
    this.profile = const {},
  });

  final String ownerId;
  final String libp2pPeerId;
  final String? displayName;
  final Map<String, dynamic> profile;
}

/// Candidate from a `relay.lookup` response peer entry.
class RelayLookupCandidate {
  const RelayLookupCandidate({
    required this.peerId,
    this.ownerId = '',
    this.displayName,
    this.multiaddrs = const [],
    this.capabilities = const [],
    this.visibility = 'public',
  });

  final String peerId;
  final String ownerId;
  final String? displayName;
  final List<String> multiaddrs;
  final List<String> capabilities;
  final String visibility;

  factory RelayLookupCandidate.fromJson(Map<String, dynamic> peer) {
    return RelayLookupCandidate(
      peerId: (peer['peerId'] as String?) ?? '',
      ownerId: (peer['ownerId'] as String?) ?? '',
      displayName: peer['displayName'] as String?,
      multiaddrs: (peer['multiaddrs'] is List)
          ? (peer['multiaddrs'] as List).map((e) => e.toString()).toList()
          : const [],
      capabilities: (peer['capabilities'] is List)
          ? (peer['capabilities'] as List).map((e) => e.toString()).toList()
          : const [],
      visibility: (peer['visibility'] as String?) ?? 'public',
    );
  }
}

/// Pure coordination over [PhoneDiscoveryHost] (testable without libp2p).
class PhoneDiscoveryRuntime {
  PhoneDiscoveryRuntime({
    required PhoneDiscoveryHost host,
    List<String> relayBootstrapAddrs = const [],
    Duration controlTtl = const Duration(minutes: 5),
  })  : _host = host,
        _relayBootstrapAddrs = List.unmodifiable(relayBootstrapAddrs),
        _controlTtl = controlTtl;

  final PhoneDiscoveryHost _host;
  final List<String> _relayBootstrapAddrs;
  final Duration _controlTtl;

  List<String> _lastTopics = const [];

  List<String> get lastAdvertisedTopics => _lastTopics;
  List<String> get relayBootstrapAddrs => _relayBootstrapAddrs;
  Duration get controlTtl => _controlTtl;

  /// Compute topics from profile and DHT-provide each.
  Future<List<String>> advertise(PhoneDiscoveryAdvertisement ad) async {
    final topics = computePhoneDiscoveryTopics({
      ...ad.profile,
      if (ad.displayName != null) 'displayName': ad.displayName,
    });
    _lastTopics = topics;
    for (final topic in topics) {
      try {
        await _host.provideCapabilityTopic(topic);
      } catch (_) {
        // Best-effort — relay checkin still mirrors topicHashes.
      }
    }
    return topics;
  }

  /// Refresh topic list from profile without DHT provide.
  List<String> refreshTopics(PhoneDiscoveryAdvertisement ad) {
    _lastTopics = computePhoneDiscoveryTopics({
      ...ad.profile,
      if (ad.displayName != null) 'displayName': ad.displayName,
    });
    return _lastTopics;
  }

  /// Build `relay.checkin` payload (caller signs + sends).
  Map<String, Object?> buildCheckinPayload({
    required PhoneDiscoveryAdvertisement ad,
    List<String>? topics,
  }) {
    final expiresAt = expiresAtFromNow(_controlTtl);
    final topicList = topics ??
        (_lastTopics.isNotEmpty
            ? _lastTopics
            : computePhoneDiscoveryTopics({
                ...ad.profile,
                if (ad.displayName != null) 'displayName': ad.displayName,
              }));
    if (_lastTopics.isEmpty) _lastTopics = topicList;

    final hashes = [
      for (final t in topicList) cidStringForCapabilityTopic(t),
    ];
    final ads = <Map<String, Object?>>[
      {
        'capability': 'mesh.discovery',
        'visibility': 'public',
        'expiresAt': expiresAt,
      },
      ...topicHashAdvertisements(topicHashes: hashes, expiresAt: expiresAt),
    ];
    final hints = [
      for (final addr in _relayBootstrapAddrs)
        {
          'relayId': peerIdTailFromMultiaddr(addr) ?? addr,
          'multiaddrs': [addr],
          'expiresAt': expiresAt,
        },
    ];
    return buildRelayCheckinPayload(
      peerId: ad.libp2pPeerId,
      ownerId: ad.ownerId,
      displayName: ad.displayName,
      relayReachableAddrs: _host.relayAdvertisedMultiaddrs(),
      capabilities: const ['mesh.discovery'],
      advertisements: ads,
      relayHints: hints,
      expiresAt: expiresAt,
    );
  }

  /// Build one `relay.lookup` payload for a discovery query topic.
  Map<String, Object?> buildLookupPayload({
    required String queryTopic,
    int maxResults = 20,
  }) {
    final expiresAt = expiresAtFromNow(_controlTtl);
    final queryId =
        'phone_lookup_${DateTime.now().toUtc().microsecondsSinceEpoch}';
    if (queryTopic == 'mesh.discovery') {
      return buildRelayLookupPayload(
        queryId: queryId,
        capability: 'mesh.discovery',
        maxResults: maxResults,
        expiresAt: expiresAt,
      );
    }
    return buildRelayLookupPayload(
      queryId: queryId,
      topicHash: cidStringForCapabilityTopic(queryTopic),
      maxResults: maxResults,
      expiresAt: expiresAt,
    );
  }

  /// Expand user search into topic keys for DHT + relay.
  List<String> queryTopics({
    String? topic,
    List<String>? interests,
  }) {
    final out = expandDiscoveryTopicQueries(
      topic: topic,
      interests: interests,
    );
    if (out.isEmpty) return const ['mesh.discovery'];
    return out;
  }

  /// DHT findProviders across [queryTopics].
  Future<List<MeshPeerHit>> searchDht({
    required String selfLibp2pPeerId,
    required List<String> queryTopics,
    int maxResults = 20,
  }) async {
    final hits = <MeshPeerHit>[];
    final seen = <String>{};
    for (final q in queryTopics) {
      if (q == 'mesh.discovery') continue; // not a capability CID topic
      try {
        final providers = await _host.findCapabilityTopicProviders(
          q,
          maxResults: maxResults,
        );
        for (final p in providers) {
          if (p.peerId == selfLibp2pPeerId) continue;
          if (!seen.add(p.peerId)) continue;
          hits.add(MeshPeerHit(
            nodeId: p.peerId,
            ownerId: '',
            multiaddrs: p.multiaddrs,
            profileVisibility: 'public',
          ));
          if (hits.length >= maxResults) return hits;
        }
      } catch (_) {}
    }
    return hits;
  }

  /// Convert relay lookup peer maps into hits.
  List<MeshPeerHit> hitsFromRelayCandidates(
    List<RelayLookupCandidate> candidates, {
    required String selfLibp2pPeerId,
    required String selfOwnerId,
  }) {
    final hits = <MeshPeerHit>[];
    for (final c in candidates) {
      if (c.peerId.isEmpty || c.peerId == selfLibp2pPeerId) continue;
      if (c.ownerId.isNotEmpty && c.ownerId == selfOwnerId) continue;
      hits.add(MeshPeerHit(
        nodeId: c.peerId,
        ownerId: c.ownerId,
        displayName: c.displayName,
        multiaddrs: c.multiaddrs,
        interests: c.capabilities,
        profileVisibility: c.visibility,
      ));
    }
    return hits;
  }

  /// Merge local + WAN hits (ownerId preferred; then peerId).
  static List<MeshPeerHit> mergeHits(
    Iterable<MeshPeerHit> parts, {
    required String selfLibp2pPeerId,
    required String selfOwnerId,
    int maxResults = 20,
  }) {
    final byOwner = <String, MeshPeerHit>{};
    final byPeer = <String, MeshPeerHit>{};
    for (final hit in parts) {
      if (hit.nodeId == selfLibp2pPeerId) continue;
      if (hit.ownerId.isNotEmpty && hit.ownerId == selfOwnerId) continue;
      if (hit.ownerId.isNotEmpty) {
        final prev = byOwner[hit.ownerId];
        byOwner[hit.ownerId] = prev == null
            ? hit
            : _preferRicher(prev, hit);
      } else if (hit.nodeId.isNotEmpty) {
        final prev = byPeer[hit.nodeId];
        byPeer[hit.nodeId] = prev == null ? hit : _preferRicher(prev, hit);
      }
    }
    // Fold peer-only entries into matching owner hits (keeps LAN dial hints).
    final ownerPeerIds = <String, String>{}; // peerId -> ownerId
    for (final entry in byOwner.entries) {
      if (entry.value.nodeId.isNotEmpty) {
        ownerPeerIds[entry.value.nodeId] = entry.key;
      }
    }
    for (final peerId in List<String>.from(byPeer.keys)) {
      final ownerKey = ownerPeerIds[peerId];
      if (ownerKey == null) continue;
      byOwner[ownerKey] = _preferRicher(byOwner[ownerKey]!, byPeer.remove(peerId)!);
    }
    final merged = [...byOwner.values, ...byPeer.values];
    if (merged.length <= maxResults) return merged;
    return merged.take(maxResults).toList(growable: false);
  }

  static MeshPeerHit _preferRicher(MeshPeerHit a, MeshPeerHit b) {
    final aScore = (a.ownerId.isNotEmpty ? 4 : 0) +
        (a.displayName != null && a.displayName!.isNotEmpty ? 2 : 0) +
        (a.multiaddrs.isNotEmpty ? 1 : 0);
    final bScore = (b.ownerId.isNotEmpty ? 4 : 0) +
        (b.displayName != null && b.displayName!.isNotEmpty ? 2 : 0) +
        (b.multiaddrs.isNotEmpty ? 1 : 0);
    // On a tie, prefer [b] (later / WAN) for fresher display metadata.
    final richer = bScore >= aScore ? b : a;
    final other = identical(richer, b) ? a : b;
    final addrs = {...richer.multiaddrs, ...other.multiaddrs}.toList();
    final interests = {...richer.interests, ...other.interests}.toList();
    return MeshPeerHit(
      nodeId: richer.nodeId.isNotEmpty ? richer.nodeId : other.nodeId,
      ownerId: richer.ownerId.isNotEmpty ? richer.ownerId : other.ownerId,
      displayName: richer.displayName ?? other.displayName,
      interests: interests,
      profileVisibility: richer.profileVisibility ?? other.profileVisibility,
      trustLevel: richer.trustLevel ?? other.trustLevel,
      multiaddrs: addrs,
    );
  }
}

String? peerIdTailFromMultiaddr(String addr) {
  final idx = addr.lastIndexOf('/p2p/');
  if (idx < 0) return null;
  final id = addr.substring(idx + 5);
  if (id.isEmpty || id.contains('/')) return null;
  return id;
}
