/// Phone-local social-lite backend (On this phone).
///
/// Signs bond/chat envelopes with the phone Envoy device key, persists to
/// [PhoneSocialStore] (`phone-local` namespace), and dials via
/// [MeshEnvelopeTransport]. Does not perform Home-persona actions.
library;

import 'dart:async';

import 'envelope_factory.dart';
import 'envoy_envelope.dart';
import 'mesh_envelope_transport.dart';
import 'mesh_protocols.dart';
import 'models.dart';
import 'phone_identity_store.dart';
import 'phone_social_store.dart';
import 'social_backend.dart';

typedef PhonePersistHook = Future<void> Function(PhoneSocialStore store);

class PhoneSocialBackend implements SocialBackend {
  PhoneSocialBackend({
    required PhonePersona persona,
    required MeshEnvelopeTransport transport,
    PhoneSocialStore? store,
    PhonePersistHook? onPersist,
  })  : _persona = persona,
        _transport = transport,
        _store = store ?? PhoneSocialStore(),
        _onPersist = onPersist;

  final PhonePersona _persona;
  MeshEnvelopeTransport _transport;
  final PhoneSocialStore _store;
  final PhonePersistHook? _onPersist;
  final _events = StreamController<SocialPushEvent>.broadcast();

  /// Swap dial transport (fake → live libp2p) without dropping store state.
  void replaceTransport(MeshEnvelopeTransport transport) {
    _transport = transport;
  }

  PhoneSocialStore get store => _store;
  PhonePersona get persona => _persona;

  @override
  String get contextId => phoneLocalContextId;

  @override
  String get ownerId => _persona.ownerId;

  @override
  Stream<SocialPushEvent> get events => _events.stream;

  Future<void> _persist() async {
    await _onPersist?.call(_store);
  }

  /// Remember a peer so hello/chat can dial (MVP discover / OOB).
  Future<void> rememberPeer(PhonePeerRecord peer) async {
    _store.upsertPeer(peer);
    await _persist();
  }

  @override
  Future<List<BondContact>> getBonds() async {
    return _store.bonds.values.toList(growable: false);
  }

  @override
  Future<Map<String, dynamic>?> getHumanProfile() async {
    if (_store.profile.isEmpty) {
      return {
        'ownerId': ownerId,
        'displayName': 'EnvoyGo',
        'profileVisibility': 'public',
      };
    }
    return {
      'ownerId': ownerId,
      ..._store.profile,
    };
  }

  @override
  Future<Map<String, dynamic>> updateHumanProfile(
    Map<String, dynamic> patch,
  ) async {
    _store.profile = {
      ..._store.profile,
      ...patch,
      'ownerId': ownerId,
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    };
    await _persist();
    return (await getHumanProfile())!;
  }

  @override
  Future<Map<String, dynamic>?> getPeerProfile(String peerOwnerId) async {
    final peer = _store.peerFor(peerOwnerId);
    if (peer == null) return null;
    return {
      'ownerId': peer.ownerId,
      'displayName': peer.displayName,
      ...peer.profile,
    };
  }

  @override
  Future<List<MeshPeerHit>> searchPeers({
    String? topic,
    List<String>? interests,
    int maxResults = 20,
  }) async {
    // MVP: local peer directory only (DHT topic provide comes with live mesh).
    final q = (topic ?? '').trim().toLowerCase();
    final interestSet =
        interests?.map((e) => e.toLowerCase()).toSet() ?? <String>{};
    final hits = <MeshPeerHit>[];
    for (final peer in _store.peersByOwner.values) {
      if (peer.ownerId == ownerId) continue;
      final name = (peer.displayName ?? '').toLowerCase();
      final matchesTopic = q.isEmpty ||
          name.contains(q) ||
          peer.ownerId.toLowerCase().contains(q);
      final peerInterests = (peer.profile['interests'] is List)
          ? (peer.profile['interests'] as List).map((e) => e.toString().toLowerCase())
          : const <String>[];
      final matchesInterest = interestSet.isEmpty ||
          peerInterests.any(interestSet.contains);
      if (!matchesTopic || !matchesInterest) continue;
      final bond = _store.bondFor(peer.ownerId);
      hits.add(MeshPeerHit(
        nodeId: peer.libp2pPeerId,
        ownerId: peer.ownerId,
        displayName: peer.displayName,
        interests: peerInterests.toList(),
        profileVisibility: 'public',
        trustLevel: bond?.bondLevel,
      ));
      if (hits.length >= maxResults) break;
    }
    return hits;
  }

  String _dialTargetFor(PhonePeerRecord peer) {
    if (peer.multiaddrs.isNotEmpty) return peer.multiaddrs.first;
    return '/p2p/${peer.libp2pPeerId}';
  }

  @override
  Future<Map<String, dynamic>> sendHello({
    required String targetOwnerId,
    required Map<String, dynamic> profile,
    required String message,
  }) async {
    final peer = _store.peerFor(targetOwnerId);
    if (peer == null) {
      return {'ok': false, 'error': 'Peer not found — rememberPeer first (MVP)'};
    }
    final displayName =
        (profile['displayName'] as String?)?.trim().isNotEmpty == true
            ? profile['displayName'] as String
            : (_store.profile['displayName'] as String?) ?? 'EnvoyGo';

    final unsigned = buildUnsignedEnvelope(
      device: _persona.device,
      intent: 'bond.request',
      recipientPeerId: peer.devicePeerId ?? peer.libp2pPeerId,
      payload: buildBondRequestPayload(
        requesterOwnerId: ownerId,
        requesterDisplayName: displayName,
        message: message,
      ),
    );
    final signed = signEnvoyEnvelope(unsigned, _persona.device.privateKeyPem);

    final result = await _transport.sendEnvelope(
      dialTarget: _dialTargetFor(peer),
      protocolId: envoyMessageProtocol,
      envelope: signed,
      expectReply: false,
    );
    if (!result.ok) {
      return {'ok': false, 'error': result.error ?? 'send failed'};
    }

    // Optimistic referred until accept (desktop may challenge; MVP treats send as pending).
    _store.upsertBond(BondContact(
      ownerId: targetOwnerId,
      displayName: peer.displayName ?? displayName,
      bondLevel: 'public',
    ));
    await _persist();
    return {'ok': true, 'decision': 'sent'};
  }

  @override
  Future<Map<String, dynamic>> acceptBond({
    required String peerOwnerId,
    String? message,
  }) async {
    final peer = _store.peerFor(peerOwnerId);
    if (peer == null) {
      return {'ok': false, 'error': 'Peer not found'};
    }

    final unsigned = buildUnsignedEnvelope(
      device: _persona.device,
      intent: 'bond.accept',
      recipientPeerId: peer.devicePeerId ?? peer.libp2pPeerId,
      payload: buildBondAcceptPayload(
        responderOwnerId: ownerId,
        requesterOwnerId: peerOwnerId,
        message: message,
      ),
    );
    final signed = signEnvoyEnvelope(unsigned, _persona.device.privateKeyPem);
    final result = await _transport.sendEnvelope(
      dialTarget: _dialTargetFor(peer),
      protocolId: envoyMessageProtocol,
      envelope: signed,
    );
    if (!result.ok) {
      return {'ok': false, 'error': result.error ?? 'send failed'};
    }

    _store.upsertBond(BondContact(
      ownerId: peerOwnerId,
      displayName: peer.displayName,
      bondLevel: 'direct',
    ));
    _store.clearPendingHello(peerOwnerId);
    await _persist();
    _events.add(SocialPushEvent('bond:established', {
      'peerOwnerId': peerOwnerId,
      'displayName': peer.displayName,
      'level': 'direct',
    }));
    return {'ok': true, 'decision': 'accepted'};
  }

  @override
  Future<Map<String, dynamic>> sendChat(
    String targetOwnerId,
    String text, {
    List<Map<String, dynamic>>? attachments,
  }) async {
    if (text.trim().isEmpty && (attachments == null || attachments.isEmpty)) {
      return {'ok': false, 'error': 'Empty message'};
    }
    final peer = _store.peerFor(targetOwnerId);
    if (peer == null) {
      return {'ok': false, 'error': 'Peer not found'};
    }

    final unsigned = buildUnsignedEnvelope(
      device: _persona.device,
      intent: 'chat.message',
      recipientPeerId: peer.devicePeerId,
      payload: buildChatMessagePayload(
        senderOwnerId: ownerId,
        text: text,
      ),
    );
    final signed = signEnvoyEnvelope(unsigned, _persona.device.privateKeyPem);
    final messageId = signed['messageId'] as String;

    final result = await _transport.sendEnvelope(
      dialTarget: _dialTargetFor(peer),
      protocolId: envoyChatProtocol,
      envelope: signed,
      expectReply: true,
    );
    if (!result.ok) {
      return {'ok': false, 'error': result.error ?? 'send failed'};
    }

    final createdAt = signed['createdAt'] as String? ??
        DateTime.now().toUtc().toIso8601String();
    final msg = MeshChatMessage(
      id: messageId,
      threadId: phoneDmThreadId(targetOwnerId),
      senderOwnerId: ownerId,
      senderDisplayName: _store.profile['displayName'] as String?,
      text: text,
      createdAt: createdAt,
      isOutbound: true,
    );
    _store.appendMessage(msg);
    await _persist();

    final replyIntent = result.replyEnvelope?['intent'];
    return {
      'ok': true,
      'messageId': messageId,
      'delivered': replyIntent == 'chat.delivered',
    };
  }

  @override
  Future<List<MeshChatMessage>> listChatHistory(
    String peerOwnerId, {
    int limit = 50,
  }) async {
    return _store.history(peerOwnerId, limit: limit);
  }

  /// Handle an inbound signed envelope (from [PhoneMeshSession] stream).
  ///
  /// Returns a reply envelope to write on the same stream, if any
  /// (`chat.delivered` for chat.message).
  Future<Map<String, Object?>?> handleInboundEnvelope({
    required String protocolId,
    required Map<String, Object?> envelope,
    required String remoteLibp2pPeerId,
  }) async {
    if (!verifyEnvoyEnvelope(envelope)) {
      return null;
    }
    if (!isIntentAllowedOnProtocol(protocolId, envelope['intent'] as String? ?? '')) {
      return null;
    }

    final intent = envelope['intent'] as String;
    final payload = (envelope['payload'] as Map?)?.cast<String, Object?>() ?? {};
    final senderDevicePeerId = envelope['senderPeerId'] as String?;

    if (intent == 'bond.request') {
      final fromOwnerId = payload['requesterOwnerId'] as String?;
      if (fromOwnerId == null || fromOwnerId.isEmpty) return null;
      final displayName = payload['requesterDisplayName'] as String?;
      _store.upsertPeer(PhonePeerRecord(
        ownerId: fromOwnerId,
        libp2pPeerId: remoteLibp2pPeerId,
        devicePeerId: senderDevicePeerId,
        displayName: displayName,
      ));
      _store.addPendingHello(PendingHello(
        fromOwnerId: fromOwnerId,
        fromDisplayName: displayName,
        message: (payload['message'] as String?) ?? '',
        libp2pPeerId: remoteLibp2pPeerId,
        devicePeerId: senderDevicePeerId,
        receivedAt: DateTime.now().toUtc(),
      ));
      await _persist();
      _events.add(SocialPushEvent('bond:request', {
        'peerOwnerId': fromOwnerId,
        'displayName': displayName,
        'message': payload['message'],
      }));
      return null;
    }

    if (intent == 'bond.accept') {
      final responderOwnerId = payload['responderOwnerId'] as String?;
      final requesterOwnerId = payload['requesterOwnerId'] as String?;
      if (responderOwnerId == null || requesterOwnerId == null) return null;
      // Counterparty is whoever is not us.
      final other = responderOwnerId == ownerId
          ? requesterOwnerId
          : responderOwnerId;
      if (other == ownerId) return null;
      _store.upsertPeer(PhonePeerRecord(
        ownerId: other,
        libp2pPeerId: remoteLibp2pPeerId,
        devicePeerId: senderDevicePeerId,
        displayName: _store.peerFor(other)?.displayName,
      ));
      _store.upsertBond(BondContact(
        ownerId: other,
        displayName: _store.peerFor(other)?.displayName,
        bondLevel: 'direct',
      ));
      await _persist();
      _events.add(SocialPushEvent('bond:established', {
        'peerOwnerId': other,
        'level': 'direct',
      }));
      return null;
    }

    if (intent == 'chat.message') {
      final fromOwnerId = payload['senderOwnerId'] as String?;
      final text = (payload['text'] as String?) ?? '';
      if (fromOwnerId == null) return null;

      _store.upsertPeer(PhonePeerRecord(
        ownerId: fromOwnerId,
        libp2pPeerId: remoteLibp2pPeerId,
        devicePeerId: senderDevicePeerId,
        displayName: _store.peerFor(fromOwnerId)?.displayName,
      ));

      final messageId = envelope['messageId'] as String? ?? _newId();
      final createdAt = envelope['createdAt'] as String? ??
          DateTime.now().toUtc().toIso8601String();
      final msg = MeshChatMessage(
        id: messageId,
        threadId: phoneDmThreadId(fromOwnerId),
        senderOwnerId: fromOwnerId,
        text: text,
        createdAt: createdAt,
        isOutbound: false,
      );
      _store.appendMessage(msg);
      await _persist();
      _events.add(SocialPushEvent('chat:message', {
        'messageId': messageId,
        'senderOwnerId': fromOwnerId,
        'text': text,
        'createdAt': createdAt,
        'threadId': msg.threadId,
      }));

      // Same-stream delivery ack
      final ackUnsigned = buildUnsignedEnvelope(
        device: _persona.device,
        intent: 'chat.delivered',
        recipientPeerId: senderDevicePeerId,
        correlationId: envelope['correlationId'] as String?,
        payload: buildChatDeliveredPayload(
          messageId: messageId,
          recipientOwnerId: ownerId,
        ),
      );
      return signEnvoyEnvelope(ackUnsigned, _persona.device.privateKeyPem);
    }

    return null;
  }

  String _newId() => 'msg-${DateTime.now().toUtc().microsecondsSinceEpoch}';

  Future<void> dispose() async {
    await _events.close();
  }
}
