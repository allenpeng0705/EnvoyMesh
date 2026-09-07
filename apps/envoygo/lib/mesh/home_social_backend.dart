/// Home thin-client [SocialBackend] — all actions via [NodeServiceClient] RPC.
library;

import 'dart:async';

import 'package:envoy_mesh/envoy_mesh.dart';

import '../services/node_service_client.dart';
import 'social_model_adapters.dart';

class HomeSocialBackend implements SocialBackend {
  HomeSocialBackend({
    required this.nodeId,
    required NodeServiceClient client,
    required String Function() ownerIdReader,
  })  : _client = client,
        _ownerIdReader = ownerIdReader {
    _wirePush();
  }

  final String nodeId;
  final NodeServiceClient _client;
  final String Function() _ownerIdReader;
  final _events = StreamController<SocialPushEvent>.broadcast();
  final List<void Function()> _unsubs = [];

  @override
  String get contextId => nodeId;

  @override
  String get ownerId => _ownerIdReader();

  @override
  Stream<SocialPushEvent> get events => _events.stream;

  void _wirePush() {
    void forward(String type, dynamic data) {
      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      _events.add(SocialPushEvent(type, map));
    }

    _unsubs.add(_client.on('chat:message', (d) => forward('chat:message', d)));
    _unsubs.add(
        _client.on('bond:established', (d) => forward('bond:established', d)));
    _unsubs
        .add(_client.on('bond:revoked', (d) => forward('bond:revoked', d)));
  }

  @override
  Future<List<BondContact>> getBonds() async {
    final bonds = await _client.getBonds();
    return bonds.map(bondFromContact).toList();
  }

  @override
  Future<Map<String, dynamic>> sendChat(
    String targetOwnerId,
    String text, {
    List<Map<String, dynamic>>? attachments,
  }) {
    return _client.sendChat(
      targetOwnerId,
      text,
      attachments: attachments,
    );
  }

  @override
  Future<List<MeshChatMessage>> listChatHistory(
    String peerOwnerId, {
    int limit = 50,
  }) async {
    final rows = await _client.listChatHistory(peerOwnerId, limit: limit);
    return rows
        .map((m) => MeshChatMessage(
              id: m.id,
              threadId: m.threadId,
              senderOwnerId: m.senderOwnerId,
              senderDisplayName: m.senderDisplayName,
              text: m.text,
              createdAt: m.createdAt,
              isOutbound: m.isOutbound,
            ))
        .toList();
  }

  @override
  Future<List<MeshPeerHit>> searchPeers({
    String? topic,
    List<String>? interests,
    int maxResults = 20,
  }) async {
    final hits = await _client.searchPeers(
      topic: topic,
      interests: interests,
      maxResults: maxResults,
    );
    return hits
        .map((h) => MeshPeerHit(
              nodeId: h.nodeId,
              ownerId: h.ownerId,
              displayName: h.displayName,
              interests: h.interests,
              profileVisibility: h.profileVisibility,
              trustLevel: h.trustLevel,
            ))
        .toList();
  }

  @override
  Future<Map<String, dynamic>> sendHello({
    required String targetOwnerId,
    required Map<String, dynamic> profile,
    required String message,
  }) {
    return _client.sendHello(
      targetOwnerId: targetOwnerId,
      profile: profile,
      message: message,
    );
  }

  @override
  Future<Map<String, dynamic>> acceptBond({
    required String peerOwnerId,
    String? message,
  }) async {
    // Home path: accept via existing social intro / bond RPC if available.
    // Fallback: sendHello is outbound; inbound accept is usually UI on home.
    return {
      'ok': false,
      'error': 'acceptBond on Home — use home Social UI / inbox',
    };
  }

  @override
  Future<Map<String, dynamic>?> getHumanProfile() => _client.getHumanProfile();

  @override
  Future<Map<String, dynamic>> updateHumanProfile(Map<String, dynamic> patch) =>
      _client.updateHumanProfile(patch);

  @override
  Future<Map<String, dynamic>?> getPeerProfile(String ownerId) =>
      _client.getPeerProfile(ownerId);

  Future<void> dispose() async {
    for (final u in _unsubs) {
      u();
    }
    _unsubs.clear();
    await _events.close();
    _client.dispose();
  }
}
