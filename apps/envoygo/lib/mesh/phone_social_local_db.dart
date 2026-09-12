/// Sync [PhoneSocialStore] contacts/messages into [LocalDatabase] under
/// [phoneLocalContextId].
library;

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';

import '../storage/local_database.dart';

class PhoneSocialLocalDb {
  PhoneSocialLocalDb(this._db);

  final LocalDatabase _db;

  Future<void> syncFromStore(PhoneSocialStore store) async {
    await _db.upsertNode({
      'id': phoneLocalContextId,
      'name': 'On this phone',
      'owner_id': store.profile['ownerId'] ?? '',
      'home_peer_id': '',
      'paired_at': DateTime.now().toUtc().toIso8601String(),
    });

    final contactRows = store.bonds.values.map((c) => c.toJson()).toList();
    await _db.upsertContacts(phoneLocalContextId, contactRows);

    for (final entry in store.messagesByThread.entries) {
      final threadId = entry.key;
      final peerOwnerId = threadId.startsWith('$phoneLocalContextId:')
          ? threadId.substring(phoneLocalContextId.length + 1)
          : null;
      await _db.upsertThread({
        'id': threadId,
        'node_id': phoneLocalContextId,
        'type': 'direct',
        'display_name': peerOwnerId != null
            ? (store.peerFor(peerOwnerId)?.displayName ?? peerOwnerId)
            : threadId,
        'contact_owner_id': peerOwnerId,
        'last_message_text':
            entry.value.isNotEmpty ? entry.value.first.text : null,
        'last_message_at':
            entry.value.isNotEmpty ? entry.value.first.createdAt : null,
        'unread_count': 0,
      });
      for (final m in entry.value) {
        await _db.insertMessage(_messageRow(m));
      }
    }
  }

  Map<String, dynamic> _messageRow(MeshChatMessage m) => {
        'id': m.id,
        'thread_id': m.threadId,
        'sender_owner_id': m.senderOwnerId,
        'sender_display_name': m.senderDisplayName,
        'text': m.text,
        'created_at': m.createdAt,
        'is_outbound': m.isOutbound ? 1 : 0,
      };
}
