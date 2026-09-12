import '../../../models/chat_message.dart';
import '../../../models/chat_room.dart';
import '../../../models/library_read.dart';
import '../../home_rpc_session.dart';

/// Chat bindings: direct messages, group rooms, drafts and the AI-chat bridges.
mixin ChatRpcs on HomeRpcSession {
  /// List AI chat drafts for a contact thread (owner Assist / Agent Mode).
  Future<List<Map<String, dynamic>>> getChatDrafts({
    String? threadPeerOwnerId,
  }) async {
    final result = await homeClient.call(
      'getChatDrafts',
      threadPeerOwnerId != null && threadPeerOwnerId.isNotEmpty
          ? {'threadPeerOwnerId': threadPeerOwnerId}
          : <String, dynamic>{},
    );
    if (result is! List) return const [];
    return result
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  /// Dismiss / delete a chat draft by id.
  Future<void> deleteChatDraft(String draftId) async {
    final id = draftId.trim();
    if (id.isEmpty) return;
    await homeClient.call('deleteChatDraft', {'draftId': id});
  }

  /// Create or replace the full `aiBots` list on the home node.
  Future<void> updateAiBots(List<Map<String, dynamic>> aiBots) async {
    await updateNodeConfig({'aiBots': aiBots});
  }

  Future<Map<String, dynamic>> sendChat(
    String targetOwnerId,
    String text, {
    List<Map<String, dynamic>>? attachments,
    String? listingId,
  }) async {
    final params = <String, dynamic>{
      'targetOwnerId': targetOwnerId,
      'text': text,
      if (attachments != null && attachments.isNotEmpty)
        'attachments': attachments,
      if (listingId != null && listingId.isNotEmpty) 'listingId': listingId,
    };
    return await homeClient.call('sendChat', params) as Map<String, dynamic>;
  }

  /// Read vault file bytes for inline previews (images/audio in chat). (Phase 37)
  ///
  /// Pass [offset] + [maxBytes] to fetch a slice (relay home-tunnel safe).
  /// When [offset] is set, [sizeBytes] in the result is the full file size and
  /// [truncated] is true when more bytes remain.
  Future<Map<String, dynamic>> readLibraryItemContent({
    required String relativePath,
    int? maxBytes,
    int? offset,
  }) async {
    return await homeClient.call('readLibraryItemContent', {
          'relativePath': relativePath,
          if (maxBytes != null) 'maxBytes': maxBytes,
          if (offset != null) 'offset': offset,
        })
        as Map<String, dynamic>;
  }

  /// Phase 45C — browse mesh web content via home `libraryRead`.
  ///
  /// EnvoyGo is a thin client: the home node dials the target owner using
  /// the home's bonds. The phone never sends `library.read` envelopes itself.
  Future<LibraryReadResult> libraryRead({
    required String targetOwnerId,
    required String path,
    Map<String, int>? range,
    String? ifNoneMatch,
    int? timeoutMs,
  }) async {
    final params = <String, dynamic>{
      'targetOwnerId': targetOwnerId,
      'path': path,
      if (range != null) 'range': range,
      if (ifNoneMatch != null) 'ifNoneMatch': ifNoneMatch,
      if (timeoutMs != null) 'timeoutMs': timeoutMs,
    };
    final result =
        await homeClient.call('libraryRead', params) as Map<String, dynamic>;
    return LibraryReadResult.fromJson(result);
  }

  /// Upload a file attachment to the vault and return its metadata (Phase 37).
  ///
  /// For voice notes, pass [chatText] (use `''` when there is no transcription).
  /// That matches Social: `sendChat` + attachment + share linked by message id,
  /// so home-node Social can play the note from the vault path.
  Future<Map<String, dynamic>> sendChatAttachment({
    required String targetOwnerId,
    required String filename,
    required String contentBase64,
    required String mimeType,
    String? caption,
    String? chatText,
  }) async {
    final params = <String, dynamic>{
      'targetOwnerId': targetOwnerId,
      'filename': filename,
      'contentBase64': contentBase64,
      'mimeType': mimeType,
      if (caption != null) 'caption': caption,
      if (chatText != null) 'chatText': chatText,
    };
    return await homeClient.call('sendChatAttachment', params)
        as Map<String, dynamic>;
  }

  Future<List<ChatMessage>> listChatHistory(
    String peerOwnerId, {
    String? before,
    int? limit,
    String? threadId,
    String? selfOwnerId,
    String? selfFamilyProfileId,
  }) async {
    final params = <String, dynamic>{
      // Router historically used peerOwnerId; thin-client docs use targetOwnerId.
      'peerOwnerId': peerOwnerId,
      'targetOwnerId': peerOwnerId,
      if (before != null) 'before': before,
      if (limit != null) 'limit': limit,
    };
    final result = await homeClient.call('listChatHistory', params);
    final list = result as List<dynamic>;
    final tid = threadId ?? peerOwnerId;
    return list.map((e) {
      final map = e as Map<String, dynamic>;
      // Local-DB shaped rows use snake_case id/thread_id; RPC uses nested ChatMessage.
      if (map.containsKey('thread_id') ||
          (map.containsKey('id') && map['sender'] == null)) {
        try {
          return ChatMessage.fromJson(map);
        } catch (_) {
          /* fall through to RPC parse */
        }
      }
      return ChatMessage.fromRpcJson(
        map,
        threadId: tid,
        selfOwnerId: selfOwnerId,
        selfFamilyProfileId: selfFamilyProfileId,
      );
    }).toList();
  }

  Future<void> markRead(String targetOwnerId) async {
    await homeClient.call('markRead', {'targetOwnerId': targetOwnerId});
  }

  // -- Chat — group rooms --

  Future<List<ChatRoom>> listChatRooms() async {
    final result = await homeClient.call('listChatRooms');
    final list = result as List<dynamic>;
    return list
        .map((e) => ChatRoom.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> sendChatRoomMessage(
    String roomId,
    String text,
  ) async {
    return await homeClient.call('sendChatRoomMessage', {
          'roomId': roomId,
          'text': text,
        })
        as Map<String, dynamic>;
  }

  /// Mesh group room file/voice attach (mirrors Social `sendChatRoomAttachment`).
  Future<Map<String, dynamic>> sendChatRoomAttachment({
    required String roomId,
    required String filename,
    required String contentBase64,
    String? mimeType,
    String? caption,
  }) async {
    return await homeClient.call(
          'sendChatRoomAttachment',
          {
            'roomId': roomId,
            'filename': filename,
            'contentBase64': contentBase64,
            if (mimeType != null) 'mimeType': mimeType,
            if (caption != null) 'caption': caption,
          },
          const Duration(seconds: 120),
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createChatRoom(
    String name, {
    List<String> memberOwnerIds = const [],
  }) async {
    return await homeClient.call('createChatRoom', {
          'title': name,
          'memberOwnerIds': memberOwnerIds,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> inviteToChatRoom(
    String roomId,
    String ownerId,
  ) async {
    return await homeClient.call('inviteToChatRoom', {
          'roomId': roomId,
          'memberOwnerIds': [ownerId],
        })
        as Map<String, dynamic>;
  }

  Future<void> leaveChatRoom(String roomId) async {
    await homeClient.call('leaveChatRoom', {'roomId': roomId});
  }

  Future<void> renameChatRoom(String roomId, String name) async {
    await homeClient.call('renameChatRoom', {'roomId': roomId, 'title': name});
  }

  // -- AI chat --

  /// Home node `sendToOpenClaw` returns void (`result: null`). Do not cast to Map.
  /// Timeout: home waits up to 180s for the OpenClaw reply, then persists —
  /// use 210s so mobile does not time out while the home is still finishing.
  Future<void> sendToOpenClaw(String text) async {
    await homeClient.call('sendToOpenClaw', {
      'text': text,
    }, const Duration(seconds: 210));
  }

  /// Dynamic AI bot — send a message to a character bot.
  Future<void> sendToAiBot(String botId, String text) async {
    await homeClient.call('sendToAiBot', {'botId': botId, 'text': text});
  }

  /// Home node `sendToBridge` returns void (`result: null`). Do not cast to Map.
  Future<void> sendToBridge(String text) async {
    await homeClient.call('sendToBridge', {
      'text': text,
    }, const Duration(seconds: 210));
  }

  Future<Map<String, dynamic>> getBridgeStatus() async {
    return await homeClient.call('getBridgeStatus') as Map<String, dynamic>;
  }

  /// Phase 32 — live status of the built-in OpenClaw agent (EnvoyAI) on the
  /// home node. Returns a map with `enabled`, `running`, and `url` keys.
  Future<Map<String, dynamic>> getOpenClawStatus() async {
    return await homeClient.call('getOpenClawStatus') as Map<String, dynamic>;
  }

  /// Update AI Engine settings on the home node. Syncs with the Social UI
  /// Settings → AI → AI Engine section via `updateNodeConfig`.
  Future<bool> updateAiEngineSettings({
    bool? bridgeEnabled,
    bool? openclawEnabled,
    String? activeExtAgentId,
    List<Map<String, dynamic>>? extAgents,
    int? bridgeListenPort,
  }) async {
    final patch = <String, dynamic>{};
    if (bridgeEnabled != null) patch['bridgeEnabled'] = bridgeEnabled;
    if (openclawEnabled != null) patch['openclawEnabled'] = openclawEnabled;
    if (activeExtAgentId != null) {
      patch['activeExtAgentId'] = activeExtAgentId;
    }
    if (extAgents != null) patch['extAgents'] = extAgents;
    if (bridgeListenPort != null) patch['bridgeListenPort'] = bridgeListenPort;
    if (patch.isEmpty) return true;
    await homeClient.call('updateNodeConfig', patch);
    return true;
  }
}
