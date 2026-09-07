/// Foreground phone discovery: DHT + relay + LAN mDNS (S6/S7).
library;

import 'dart:async';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter/foundation.dart';

import '../services/libp2p_node.dart';
import 'libp2p_mesh_envelope_transport.dart';

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
  MeshEnvelopeTransport? _transport;

  bool get isActive => _active;
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
    _active = true;
    _transport = Libp2pMeshEnvelopeTransport(_node);
    _backend.replaceWanSearch(_wanSearch);

    if (_enableMdns) {
      try {
        await _node.enableMdns();
      } catch (e) {
        // WAN discover still works without LAN multicast.
        debugPrint('[PhoneDiscoverySession] mDNS start failed: $e');
      }
    }

    await _advertiseAndCheckin();
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
      debugPrint('[PhoneDiscoverySession] mDNS stop failed: $e');
    }
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
      debugPrint('[PhoneDiscoverySession] DHT provide failed: $e');
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
          debugPrint(
            '[PhoneDiscoverySession] checkin failed $relayAddr: ${result.error}',
          );
        }
      } catch (e) {
        debugPrint('[PhoneDiscoverySession] checkin error $relayAddr: $e');
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
      hits.add(MeshPeerHit(
        nodeId: p.peerId,
        ownerId: remembered?.ownerId ?? '',
        displayName: remembered?.displayName,
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
    int maxResults = 20,
  }) async {
    final selfPeer = _node.peerId?.toString() ?? '';
    final selfOwner = _backend.ownerId;
    final queries = _runtime.queryTopics(topic: topic, interests: interests);

    final dhtHits = await _runtime.searchDht(
      selfLibp2pPeerId: selfPeer,
      queryTopics: queries,
      maxResults: maxResults,
    );

    final lanHits = _lanHits(selfPeer: selfPeer, maxResults: maxResults);

    final relayHits = <MeshPeerHit>[];
    final transport = _transport;
    if (transport != null) {
      for (final q in queries) {
        final payload =
            _runtime.buildLookupPayload(queryTopic: q, maxResults: maxResults);
        final unsigned = buildUnsignedSystemEnvelope(
          device: _backend.persona.device,
          intent: 'relay.lookup',
          payload: payload,
        );
        final signed = signEnvoyEnvelope(
          unsigned,
          _backend.persona.device.privateKeyPem,
        );
        for (final relayAddr in _relayBootstrapAddrs) {
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
              debugPrint(
                '[PhoneDiscoverySession] lookup rejected (untrusted reply) $relayAddr',
              );
              continue;
            }
            final peers = parseRelayLookupPeers(reply['payload']);
            final candidates = [
              for (final p in peers) RelayLookupCandidate.fromJson(p),
            ];
            relayHits.addAll(
              _runtime.hitsFromRelayCandidates(
                candidates,
                selfLibp2pPeerId: selfPeer,
                selfOwnerId: selfOwner,
              ),
            );
          } catch (e) {
            debugPrint(
              '[PhoneDiscoverySession] lookup error $relayAddr: $e',
            );
          }
        }
      }
    }

    // Persist dial hints for hello (owner-bearing WAN + LAN enrich).
    for (final hit in [...relayHits, ...dhtHits, ...lanHits]) {
      if (hit.ownerId.isEmpty || hit.multiaddrs.isEmpty) continue;
      try {
        await _backend.rememberPeer(PhonePeerRecord(
          ownerId: hit.ownerId,
          libp2pPeerId: hit.nodeId,
          displayName: hit.displayName,
          multiaddrs: hit.multiaddrs,
        ));
      } catch (_) {}
    }

    return PhoneDiscoveryRuntime.mergeHits(
      [...lanHits, ...dhtHits, ...relayHits],
      selfLibp2pPeerId: selfPeer,
      selfOwnerId: selfOwner,
      maxResults: maxResults,
    );
  }
}
