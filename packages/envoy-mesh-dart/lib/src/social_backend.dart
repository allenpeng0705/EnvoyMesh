/// Shared Social backend surface for home thin-client adapters and phone mesh.
library;

import 'models.dart';

/// Context id for the phone-local persona (SQLite `node_id` namespace).
const String phoneLocalContextId = 'phone-local';

/// Push-style events (same names as home WS where applicable).
class SocialPushEvent {
  const SocialPushEvent(this.type, [this.data = const {}]);

  final String type;
  final Map<String, dynamic> data;
}

abstract class SocialBackend {
  /// Home `StoredNode.id`, or [phoneLocalContextId].
  String get contextId;

  String get ownerId;

  Future<List<BondContact>> getBonds();

  Future<Map<String, dynamic>> sendChat(
    String targetOwnerId,
    String text, {
    List<Map<String, dynamic>>? attachments,
  });

  Future<List<MeshChatMessage>> listChatHistory(
    String peerOwnerId, {
    int limit = 50,
  });

  Future<List<MeshPeerHit>> searchPeers({
    String? topic,
    List<String>? interests,
    int maxResults = 20,
  });

  Future<Map<String, dynamic>> sendHello({
    required String targetOwnerId,
    required Map<String, dynamic> profile,
    required String message,
  });

  Future<Map<String, dynamic>> acceptBond({
    required String peerOwnerId,
    String? message,
  });

  Future<Map<String, dynamic>?> getHumanProfile();

  Future<Map<String, dynamic>> updateHumanProfile(Map<String, dynamic> patch);

  Future<Map<String, dynamic>?> getPeerProfile(String ownerId);

  Stream<SocialPushEvent> get events;
}
