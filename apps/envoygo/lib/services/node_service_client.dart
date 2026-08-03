import 'dart:async';

import '../models/chain_active.dart';
import '../models/chain_report.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/contact.dart';
import '../models/content_engage_notification.dart';
import '../models/feed_notification.dart';
import '../models/library_read.dart';
import '../models/peer_search_result.dart';
import '../models/terminal_session.dart';
import '../models/web_content.dart';
import 'home_remote_client.dart';

/// Typed wrappers around the home node's JSON-RPC methods.
///
/// Each method corresponds to an RPC in `ws-protocol.ts`.
class NodeServiceClient {
  final HomeRemoteClient _client;

  /// Phase 42 — real event stream. The home emits `call:*` events over the
  /// WebSocket; HomeRemoteClient fans them out via `.on(event, handler)`.
  /// This controller bridges every `call:*` event into a single broadcast
  /// stream that `CallProvider` subscribes to. The event payload (already
  /// the flat `{type, callId, ...}` shape) is forwarded unchanged.
  ///
  /// Previously this returned `const Stream.empty()` (a Phase 38 stub),
  /// which meant the entire callee flow (`call:incoming` → ring → accept)
  /// and every remote-end event (`call:ended`/`call:rejected`/`call:error`)
  /// silently never fired in production — the provider's `handleTestEvent`
  /// seam hid the gap in tests.
  final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  final List<void Function()> _unsubs = [];

  static const _callEvents = [
    'call:incoming',
    'call:answered',
    'call:rejected',
    'call:remote-mute',
    'call:ended',
    'call:error',
    'call:ice-candidate',
  ];

  NodeServiceClient(this._client) {
    for (final event in _callEvents) {
      _unsubs.add(
        _client.on(event, (data) {
          // Normalize: the home emits `{event, data}`; the provider expects
          // a flat map with a `type` field. Re-stamp `type` defensively.
          final payload = data is Map<String, dynamic>
              ? Map<String, dynamic>.from(data)
              : <String, dynamic>{};
          payload['type'] ??= event;
          _eventController.add(payload);
        }),
      );
    }
  }

  /// Release the HomeRemoteClient event subscriptions. Safe to call once
  /// on disposal; the stream closes with it.
  /// Subscribe to a push event from the home node. Returns an
  /// unsubscribe function. Re-exposes the underlying
  /// [HomeRemoteClient.on] so the settings screens can listen for
  /// `home:config-updated`.
  void Function() on(String event, void Function(dynamic) handler) {
    return _client.on(event, handler);
  }

  void dispose() {
    for (final unsub in _unsubs) {
      try {
        unsub();
      } catch (_) {
        // Swallow — best-effort cleanup.
      }
    }
    _unsubs.clear();
    _eventController.close();
  }

  /// Stream of unsolicited push events from the home node (`call:*` today;
  /// easily extended). Consumed by [CallProvider].
  Stream<Map<String, dynamic>> get eventStream => _eventController.stream;

  // -- Connection & pairing --

  Future<Map<String, dynamic>> pairWithHomeNode({
    required String pairingToken,
    required String deviceName,
    required String platform,
    String? deviceId,
    String? profileId,
    String? profileName,
    String? profileAvatarColor,
  }) async {
    return await _client.call('pairThinClient', {
      'pairingToken': pairingToken,
      'deviceName': deviceName,
      'platform': platform,
      if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
      if (profileId != null && profileId.isNotEmpty) 'profileId': profileId,
      if (profileName != null && profileName.isNotEmpty)
          'profileName': profileName,
      if (profileAvatarColor != null && profileAvatarColor.isNotEmpty)
          'profileAvatarColor': profileAvatarColor,
    }) as Map<String, dynamic>;
  }

  /// Re-bind session to a family profile when home thought we were owner.
  Future<Map<String, dynamic>> repairSessionProfile({
    required String profileId,
  }) async {
    return await _client.call('repairSessionProfile', {
      'profileId': profileId,
    }) as Map<String, dynamic>;
  }

  /// Phase 51 — list selectable profiles for a family invite (pre-auth).
  Future<List<Map<String, dynamic>>> previewFamilyInvite({
    required String pairingToken,
    String? deviceId,
  }) async {
    final result = await _client.call('previewFamilyInvite', {
      'pairingToken': pairingToken,
      if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
    }) as Map<String, dynamic>;
    final raw = result['profiles'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  // -- Phase 51 Family Network --

  Future<Map<String, dynamic>> listFamilyProfiles() async {
    return await _client.call('listFamilyProfiles') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createFamilyProfile({
    required String name,
    String? avatarColor,
  }) async {
    return await _client.call('createFamilyProfile', {
      'name': name,
      if (avatarColor != null) 'avatarColor': avatarColor,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateFamilyProfile({
    required String id,
    String? name,
    String? avatarColor,
    bool? active,
    List<Map<String, dynamic>>? aiBots,
  }) async {
    return await _client.call('updateFamilyProfile', {
      'id': id,
      if (name != null) 'name': name,
      if (avatarColor != null) 'avatarColor': avatarColor,
      if (active != null) 'active': active,
      if (aiBots != null) 'aiBots': aiBots,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteFamilyProfile(String id) async {
    return await _client.call('deleteFamilyProfile', {'id': id})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> generateFamilyInviteToken({
    int? expiresInHours,
    String? note,
  }) async {
    return await _client.call('generateFamilyInviteToken', {
      if (expiresInHours != null) 'expiresInHours': expiresInHours,
      if (note != null) 'note': note,
    }) as Map<String, dynamic>;
  }

  /// Phase 51C — local family DM (never leaves the home node).
  Future<Map<String, dynamic>> sendFamilyMessage({
    required String toProfileId,
    required String text,
  }) async {
    return await _client.call('sendFamilyMessage', {
      'toProfileId': toProfileId,
      'text': text,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> listFamilyRooms() async {
    return await _client.call('listFamilyRooms') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createFamilyRoom({
    required String title,
    required List<String> memberProfileIds,
  }) async {
    return await _client.call('createFamilyRoom', {
      'title': title,
      'memberProfileIds': memberProfileIds,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> sendFamilyRoomMessage({
    required String roomId,
    required String text,
  }) async {
    return await _client.call('sendFamilyRoomMessage', {
      'roomId': roomId,
      'text': text,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getConnectionStatus() async {
    return await _client.call('getConnectionStatus')
        as Map<String, dynamic>;
  }

  /// Phase 42 — fetch the home's node config. Used to read the
  /// user-configured `iceServers` (STUN/TURN) so the phone can build its
  /// `RTCPeerConnection` with the right ICE config. The home injects the
  /// same list into the `call.invite` envelope for the callee, but the
  /// caller needs it locally before generating its offer.
  Future<Map<String, dynamic>> getNodeConfig() async {
    return await _client.call('getNodeConfig') as Map<String, dynamic>;
  }

  /// AI model settings (Phase EnvoyGo settings) — push a `modelProviders`
  /// update to the home node. Caller should send a **full** merged
  /// `ModelProviderConfig` object (shallow replace on the server).
  ///
  /// Returns `true` on success. Throws on transport / RPC error.
  /// Note: `updateNodeConfig` returns void — do not expect `{ok:true}`.
  Future<bool> updateModelProviders(
      Map<String, dynamic> modelProviders) async {
    await _client.call('updateNodeConfig', {
      'modelProviders': modelProviders,
    });
    return true;
  }

  /// Patch home `node-config.json` (shallow merge on the server).
  Future<void> updateNodeConfig(Map<String, dynamic> patch) async {
    if (patch.isEmpty) return;
    await _client.call('updateNodeConfig', patch);
  }

  /// Create or replace the full `aiBots` list on the home node.
  Future<void> updateAiBots(List<Map<String, dynamic>> aiBots) async {
    await updateNodeConfig({'aiBots': aiBots});
  }

  /// Fetch the full pairing payload from the home node, including
  /// bootstrap peer addresses for multi-relay fallback.
  Future<Map<String, dynamic>> getPairingPayload() async {
    return await _client.call('getPairingPayload') as Map<String, dynamic>;
  }

  /// Share the mobile's reachable listen addresses (from UPnP) with the home node.
  /// This allows home to dial the mobile directly instead of requiring relay.
  Future<bool> updateMyListenAddrs(
      String peerId, List<String> listenAddrs,
      {String? ownerId}) async {
    final result = await _client.call('updateMyListenAddrs', {
      'peerId': peerId,
      'listenAddrs': listenAddrs,
      if (ownerId != null) 'ownerId': ownerId,
    }) as Map<String, dynamic>;
    return result['ok'] == true;
  }

  // -- Contacts & bonds --

  Future<List<Contact>> getBonds() async {
    final result = await _client.call('getBonds');
    final list = result as List<dynamic>;
    return list
        .map((e) => Contact.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> getPeerProfile(String ownerId) async {
    return await _client.call('getPeerProfile', {'ownerId': ownerId})
        as Map<String, dynamic>;
  }

  // -- Chat — direct messages --

  Future<Map<String, dynamic>> sendChat(
      String targetOwnerId, String text,
      {List<Map<String, dynamic>>? attachments}) async {
    final params = <String, dynamic>{
      'targetOwnerId': targetOwnerId,
      'text': text,
      if (attachments != null && attachments.isNotEmpty)
        'attachments': attachments,
    };
    return await _client.call('sendChat', params)
        as Map<String, dynamic>;
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
    return await _client.call('readLibraryItemContent', {
      'relativePath': relativePath,
      if (maxBytes != null) 'maxBytes': maxBytes,
      if (offset != null) 'offset': offset,
    }) as Map<String, dynamic>;
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
        await _client.call('libraryRead', params) as Map<String, dynamic>;
    return LibraryReadResult.fromJson(result);
  }

  /// Upload a file attachment to the vault and return its metadata (Phase 37).
  Future<Map<String, dynamic>> sendChatAttachment({
    required String targetOwnerId,
    required String filename,
    required String contentBase64,
    required String mimeType,
    String? caption,
  }) async {
    final params = <String, dynamic>{
      'targetOwnerId': targetOwnerId,
      'filename': filename,
      'contentBase64': contentBase64,
      'mimeType': mimeType,
      if (caption != null) 'caption': caption,
    };
    return await _client.call('sendChatAttachment', params)
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
    final result = await _client.call('listChatHistory', params);
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
    await _client.call('markRead', {'targetOwnerId': targetOwnerId});
  }

  // -- Chat — group rooms --

  Future<List<ChatRoom>> listChatRooms() async {
    final result = await _client.call('listChatRooms');
    final list = result as List<dynamic>;
    return list
        .map((e) => ChatRoom.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> sendChatRoomMessage(
      String roomId, String text) async {
    return await _client.call('sendChatRoomMessage', {
      'roomId': roomId,
      'text': text,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createChatRoom(
    String name, {
    List<String> memberOwnerIds = const [],
  }) async {
    return await _client.call('createChatRoom', {
      'title': name,
      'memberOwnerIds': memberOwnerIds,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> inviteToChatRoom(
      String roomId, String ownerId) async {
    return await _client.call('inviteToChatRoom', {
      'roomId': roomId,
      'memberOwnerIds': [ownerId],
    }) as Map<String, dynamic>;
  }

  Future<void> leaveChatRoom(String roomId) async {
    await _client.call('leaveChatRoom', {'roomId': roomId});
  }

  Future<void> renameChatRoom(String roomId, String name) async {
    await _client.call('renameChatRoom', {
      'roomId': roomId,
      'title': name,
    });
  }

  // -- AI chat --

  /// Home node `sendToOpenClaw` returns void (`result: null`). Do not cast to Map.
  /// Timeout: home waits up to 180s for the OpenClaw reply, then persists —
  /// use 210s so mobile does not time out while the home is still finishing.
  Future<void> sendToOpenClaw(String text) async {
    await _client.call(
      'sendToOpenClaw',
      {'text': text},
      const Duration(seconds: 210),
    );
  }

  /// Dynamic AI bot — send a message to a character bot.
  Future<void> sendToAiBot(String botId, String text) async {
    await _client.call('sendToAiBot', {'botId': botId, 'text': text});
  }

  /// Home node `sendToBridge` returns void (`result: null`). Do not cast to Map.
  Future<void> sendToBridge(String text) async {
    await _client.call(
      'sendToBridge',
      {'text': text},
      const Duration(seconds: 210),
    );
  }

  Future<Map<String, dynamic>> getBridgeStatus() async {
    return await _client.call('getBridgeStatus')
        as Map<String, dynamic>;
  }

  /// Phase 32 — live status of the built-in OpenClaw agent (EnvoyAI) on the
  /// home node. Returns a map with `enabled`, `running`, and `url` keys.
  Future<Map<String, dynamic>> getOpenClawStatus() async {
    return await _client.call('getOpenClawStatus')
        as Map<String, dynamic>;
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
    await _client.call('updateNodeConfig', patch);
    return true;
  }

  /// Soft probe of Ext Agent reachability (does not block switching).
  Future<Map<String, dynamic>> probeExtAgent({String? agentId}) async {
    return await _client.call('probeExtAgent', {
      if (agentId != null && agentId.trim().isNotEmpty) 'agentId': agentId.trim(),
    }) as Map<String, dynamic>;
  }

  /// Switch the active Ext Agent id only (existing agent URLs preserved).
  Future<bool> setActiveExtAgentId(String agentId) async {
    await _client.call('updateNodeConfig', {
      'activeExtAgentId': agentId.trim(),
    });
    return true;
  }

  // -- Pi (built-in coding agent) --

  Future<Map<String, dynamic>> getPiStatus() async {
    return await _client.call('getPiStatus') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> restartPi() async {
    return await _client.call('restartPi') as Map<String, dynamic>;
  }

  /// One-shot Pi prompt. May take up to ~2 minutes for long tool turns.
  Future<String> sendToPi(String text) async {
    final result = await _client.call(
      'sendToPi',
      {'text': text},
      const Duration(seconds: 120),
    );
    if (result is String) return result;
    if (result is Map && result['text'] is String) {
      return result['text'] as String;
    }
    return result?.toString() ?? '';
  }

  /// Persist Pi enable flag and/or full `piSettings` on the home node.
  ///
  /// [piSettings] replaces the persisted object (same as Social UI) — callers
  /// must merge with the current `piSettings` before sending.
  Future<bool> updatePiConfig({
    bool? piEnabled,
    Map<String, dynamic>? piSettings,
  }) async {
    final patch = <String, dynamic>{};
    if (piEnabled != null) patch['piEnabled'] = piEnabled;
    if (piSettings != null) patch['piSettings'] = piSettings;
    if (patch.isEmpty) return true;
    await _client.call('updateNodeConfig', patch);
    return true;
  }

  /// Start (or reuse) a Pi interactive TUI terminal for [projectPath] on the
  /// home node. Same RPC as Social “π Pi” / “Start Pi coding terminal”.
  Future<Map<String, dynamic>> ensurePiTerminalSession({
    required String projectPath,
    String? sessionId,
    bool forceRestart = false,
  }) async {
    return await _client.call('ensurePiTerminalSession', {
      'projectPath': projectPath,
      if (sessionId != null) 'sessionId': sessionId,
      'forceRestart': forceRestart,
    }) as Map<String, dynamic>;
  }

  // -- Terminals --

  Future<List<TerminalSession>> listTerminalSessions() async {
    final result = await _client.call('listTerminalSessions');
    final list = result as List<dynamic>;
    return list
        .map((e) =>
            TerminalSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> createTerminalSession(
      {String? cwd, String? command}) async {
    return await _client.call('createTerminalSession', {
      if (cwd != null) 'cwd': cwd,
      if (command != null) 'title': command,
    }) as Map<String, dynamic>;
  }

  Future<void> closeTerminalSession(String sessionId) async {
    await _client
        .call('closeTerminalSession', {'sessionId': sessionId});
  }

  // -- Inbox / Intro proposals --

  Future<List<Map<String, dynamic>>>
      listPendingSocialIntroProposals() async {
    final result =
        await _client.call('listPendingSocialIntroProposals');
    return (result as List<dynamic>)
        .map((e) => e as Map<String, dynamic>)
        .toList();
  }

  /// Phase 45E — list persisted inbound `feed.notify` rows from the home.
  Future<List<FeedNotification>> listFeedNotifications() async {
    final result = await _client.call('listFeedNotifications');
    return (result as List<dynamic>)
        .map((e) => FeedNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Phase 45E — dismiss one inbox row by id.
  Future<void> dismissFeedNotification(String id) async {
    await _client.call('dismissFeedNotification', {'id': id});
  }

  Future<void> dismissAllFeedNotifications() async {
    await _client.call('dismissAllFeedNotifications', {});
  }

  /// Unread stars/comments on the owner's Feed/Blog (Content badges).
  Future<List<ContentEngageNotification>> listContentEngageNotifications() async {
    final result = await _client.call('listContentEngageNotifications');
    return (result as List<dynamic>)
        .map((e) => ContentEngageNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Clear Content engagement badges for a surface or all.
  Future<void> dismissContentEngageNotifications({String surface = 'all'}) async {
    await _client.call('dismissContentEngageNotifications', {'surface': surface});
  }

  // -- Terminal PTY I/O --

  /// Execute a command in a terminal session and return output.
  /// Uses `writeStdin` + `getScrollbackTail` — no persistent
  /// WebSocket sub-channel needed.  For quick commands (ls, pwd, cd)
  /// the 500 ms wait inside the node is ample; for longer commands
  /// call this again later to poll.
  Future<Map<String, dynamic>> terminalExec(
      String sessionId, String command) async {
    return await _client.call('terminalExec', {
      'sessionId': sessionId,
      'command': command,
    }) as Map<String, dynamic>;
  }

  /// Request a terminal attach URL from the home node.
  /// Returns `{ sessionId, token, wsUrl, cols, rows }`.
  Future<Map<String, dynamic>> terminalAttach(String sessionId,
      {int? cols, int? rows}) async {
    return await _client.call('terminalAttach', {
      'sessionId': sessionId,
      if (cols != null) 'cols': cols,
      if (rows != null) 'rows': rows,
    }) as Map<String, dynamic>;
  }

  /// Open a PTY WebSocket sub-channel using the path from terminalAttach.
  Future<Map<String, dynamic>> homeTerminalWsOpen(
      String sessionId) async {
    // terminalAttach returns a full URL like:
    // ws://127.0.0.1:3032/ws/terminal/<id>?token=<t>
    // homeTerminalWsOpen expects just the path+query portion.
    final attachResult = await terminalAttach(sessionId);
    final wsUrl = attachResult['wsUrl'] as String?;
    if (wsUrl == null || wsUrl.isEmpty) {
      throw Exception('terminalAttach did not return wsUrl');
    }
    final uri = Uri.parse(wsUrl);
    final pathWithQuery = '${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}';
    return await _client.call('homeTerminalWsOpen', {
      'pathWithQuery': pathWithQuery,
    }) as Map<String, dynamic>;
  }

  /// Send keystrokes (base64-encoded) through the PTY WebSocket.
  /// [sessionId] routes the frame to the right per-session sub-channel
  /// when multiple sessions are open on the same companion.
  Future<Map<String, dynamic>> homeTerminalWsSend(
    String dataBase64, {
    String? sessionId,
  }) async {
    return await _client.call('homeTerminalWsSend', {
      'dataBase64': dataBase64,
      if (sessionId != null) 'sessionId': sessionId,
    }) as Map<String, dynamic>;
  }

  /// Close the PTY WebSocket sub-channel.  If [sessionId] is given,
  /// only that session's sub-channel is torn down; otherwise the
  /// home closes all sub-channels for this companion.
  Future<void> homeTerminalWsClose({String? sessionId}) async {
    await _client.call('homeTerminalWsClose', {
      if (sessionId != null) 'sessionId': sessionId,
    });
  }

  // -- Profile --

  Future<Map<String, dynamic>> getHumanProfile() async {
    return await _client.call('getHumanProfile')
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateHumanProfile(
      Map<String, dynamic> patch) async {
    return await _client.call('updateHumanProfile', patch)
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setPublicProfileThumbnail({
    required String contentBase64,
    required String mimeType,
  }) async {
    return await _client.call('setPublicProfileThumbnail', {
      'contentBase64': contentBase64,
      'mimeType': mimeType,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> upsertProfileGalleryPhoto({
    required String contentBase64,
    required String mimeType,
    String visibility = 'public',
    String? label,
    String? photoId,
  }) async {
    return await _client.call('upsertProfileGalleryPhoto', {
      'contentBase64': contentBase64,
      'mimeType': mimeType,
      'visibility': visibility,
      if (label != null) 'label': label,
      if (photoId != null) 'photoId': photoId,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> removeProfileGalleryPhoto({
    required String vaultRelativePath,
  }) async {
    return await _client.call('removeProfileGalleryPhoto', {
      'vaultRelativePath': vaultRelativePath,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProfileGalleryPhotoVisibility({
    required String vaultRelativePath,
    required String visibility,
  }) async {
    return await _client.call('updateProfileGalleryPhotoVisibility', {
      'vaultRelativePath': vaultRelativePath,
      'visibility': visibility,
    }) as Map<String, dynamic>;
  }

  Future<void> syncProfileToBonds() async {
    await _client.call('syncProfileToBonds');
  }

  // -- Discovery / People (Explore) --

  /// DHT / mesh peer search (topic, interests, geo topics).
  Future<List<PeerSearchResult>> searchPeers({
    String? topic,
    List<String>? topics,
    List<String>? interests,
    int maxResults = 20,
  }) async {
    final params = <String, dynamic>{
      'maxResults': maxResults,
      if (topic != null) 'topic': topic,
      if (topics != null) 'topics': topics,
      if (interests != null) 'interests': interests,
    };
    final result = await _client.call('searchPeers', params);
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .map((e) => PeerSearchResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Kick capability discovery so `searchPeers` has fresher publishers.
  Future<void> runCapabilityDiscovery({bool find = true}) async {
    await _client.call('runCapabilityDiscovery', {'find': find});
  }

  /// Send a Say Hello (bond request) to [targetOwnerId].
  Future<Map<String, dynamic>> sendHello({
    required String targetOwnerId,
    required Map<String, dynamic> profile,
    required String message,
  }) async {
    return await _client.call('sendHello', {
      'targetOwnerId': targetOwnerId,
      'profile': profile,
      'message': message,
    }) as Map<String, dynamic>;
  }

  // -- Web content (Phase 45 Content tab) --

  Future<EnsureDefaultWebSiteResult> ensureDefaultWebSite() async {
    final result =
        await _client.call('ensureDefaultWebSite') as Map<String, dynamic>;
    return EnsureDefaultWebSiteResult.fromJson(result);
  }

  Future<List<WebContentSectionSummary>> listWebContentSections() async {
    final result = await _client.call('listWebContentSections');
    final list = result as List<dynamic>;
    return list
        .map((e) =>
            WebContentSectionSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<FeedPostSummary>> listFeedPosts() async {
    final result = await _client.call('listFeedPosts');
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .map((e) => FeedPostSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<BlogPostSummary>> listBlogPosts() async {
    final result = await _client.call('listBlogPosts');
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .map((e) => BlogPostSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ContentEngagementSummary> getContentEngagement({
    required String url,
  }) async {
    final result = await _client.call('getContentEngagement', {'url': url})
        as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<ContentEngagementSummary> toggleContentStar({
    required String url,
  }) async {
    final result = await _client.call('toggleContentStar', {'url': url})
        as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<ContentEngagementSummary> addContentComment({
    required String url,
    required String text,
  }) async {
    final result = await _client.call('addContentComment', {
      'url': url,
      'text': text,
    }) as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<ContentEngagementSummary> removeContentComment({
    required String url,
    required String commentId,
  }) async {
    final result = await _client.call('removeContentComment', {
      'url': url,
      'commentId': commentId,
    }) as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<Map<String, dynamic>> deleteWebContentEntry({
    required String path,
    String? ownerId,
  }) async {
    final result = await _client.call('deleteWebContentEntry', {
      'path': path,
      if (ownerId != null) 'ownerId': ownerId,
    }) as Map<String, dynamic>;
    return result;
  }

  /// Draft site/Feed content via home AI (`draftAuthorContent`).
  /// Returns `{ ok: true, text }` or `{ ok: false, reason }`.
  Future<Map<String, dynamic>> draftAuthorContent({
    required String surface,
    required String mode,
    required String tone,
    String? hint,
    String? title,
    String? existingText,
    String? locale,
    Map<String, dynamic>? profileContext,
  }) async {
    return await _client.call('draftAuthorContent', {
      'surface': surface,
      'mode': mode,
      'tone': tone,
      if (hint != null && hint.isNotEmpty) 'hint': hint,
      if (title != null && title.isNotEmpty) 'title': title,
      if (existingText != null && existingText.isNotEmpty)
        'existingText': existingText,
      if (locale != null && locale.isNotEmpty) 'locale': locale,
      if (profileContext != null) 'profileContext': profileContext,
    }) as Map<String, dynamic>;
  }

  Future<PublishWebContentResult> publishWebContentEntry({
    required String template,
    required String title,
    required String visibility,
    String? body,
    List<String>? contactIds,
    List<String>? tags,
    String? contentBase64,
    String? mimeType,
    String? fileName,
    String? gallery,
    String? stablePath,
    String? sectionSlug,
    bool? advertiseTopic,
    List<Map<String, String>>? images,
  }) async {
    final result = await _client.call('publishWebContentEntry', {
      'template': template,
      'title': title,
      'visibility': visibility,
      if (body != null) 'body': body,
      if (contactIds != null) 'contactIds': contactIds,
      if (tags != null) 'tags': tags,
      if (contentBase64 != null) 'contentBase64': contentBase64,
      if (mimeType != null) 'mimeType': mimeType,
      if (fileName != null) 'fileName': fileName,
      if (gallery != null) 'gallery': gallery,
      if (stablePath != null) 'stablePath': stablePath,
      if (sectionSlug != null) 'sectionSlug': sectionSlug,
      if (advertiseTopic != null) 'advertiseTopic': advertiseTopic,
      if (images != null) 'images': images,
    }) as Map<String, dynamic>;
    return PublishWebContentResult.fromJson(result);
  }

  // -- My Files (home vault via thin client) --

  Future<ListAllLocalFilesResult> listAllLocalFiles({String? query}) async {
    final result = await _client.call('listAllLocalFiles', {
      if (query != null && query.isNotEmpty) 'query': query,
    }) as Map<String, dynamic>;
    return ListAllLocalFilesResult.fromJson(result);
  }

  Future<Map<String, dynamic>> importToLibrary({
    required String relativePath,
    required String contentBase64,
    String? mimeType,
  }) async {
    return await _client.call('importToLibrary', {
      'relativePath': relativePath,
      'contentBase64': contentBase64,
      if (mimeType != null) 'mimeType': mimeType,
    }) as Map<String, dynamic>;
  }

  Future<void> shareFile({
    required String targetOwnerId,
    required String path,
    String sensitivity = 'friends',
    String? deliveryChannel,
  }) async {
    await _client.call('shareFile', {
      'targetOwnerId': targetOwnerId,
      'file': {
        'path': path,
        'sensitivity': sensitivity,
        if (deliveryChannel != null) 'deliveryChannel': deliveryChannel,
      },
    });
  }

  // -- Chains (Phase 40 — read-only mobile mirror) --
  //
  // The mobile client is a thin status mirror: it lists published chain
  // reports and shows their detail. Mutations (pin/unpin, launch, cancel,
  // rebalance) live on the home node's Social UI. The home node already
  // serves all 15 chain RPCs through its JSON-RPC router; we only add the
  // two read-only ones the mobile surface needs.

  /// List published chain reports from the home node's chain-reports store.
  ///
  /// [limit] caps the response (default home-node cap is 50). [pinnedOnly]
  /// filters to reports the owner flagged as exempt from 90-day GC. The
  /// returned summaries carry just enough to render a list row; tap a row
  /// to fetch the full report via [getChainReport].
  Future<List<ChainReportSummary>> listChainReports({
    int? limit,
    bool? pinnedOnly,
  }) async {
    final result = await _client.call('chainListReports', {
      if (limit != null) 'limit': limit,
      if (pinnedOnly != null) 'pinnedOnly': pinnedOnly,
    }) as Map<String, dynamic>;
    final list = (result['reports'] as List<dynamic>?) ?? const [];
    return list
        .map((e) => ChainReportSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single chain report by id. Returns null when the home node
  /// has no record of [chainId] (e.g. the report was GC'd after 90 days
  /// and the owner hadn't pinned it).
  Future<ChainReport?> getChainReport(String chainId) async {
    final result = await _client.call('chainGetReport', {
      'chainId': chainId,
    }) as Map<String, dynamic>;
    final report = result['report'];
    if (report == null) return null;
    return ChainReport.fromJson(report as Map<String, dynamic>);
  }

  /// List in-progress chains from the home node runtime.
  Future<List<ChainActiveSummary>> listActiveChains() async {
    final result = await _client.call('chainListActive', {}) as Map<String, dynamic>;
    final list = (result['chains'] as List<dynamic>?) ?? const [];
    return list
        .map((e) => ChainActiveSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single chain's live state snapshot.
  Future<ChainActiveSummary?> getChainState(String chainId) async {
    final result = await _client.call('chainGetState', {
      'chainId': chainId,
    }) as Map<String, dynamic>;
    if (result['chainId'] == null) return null;
    return ChainActiveSummary.fromJson(result);
  }

  // -- Voice / video calls (Phase 42C) --
  //
  // Real JSON-RPC implementations for the five call.* RPCs. The home
  // node (apps/node) accepts the call.* schemas defined in
  // packages/protocol. The SDP/ICE fields are opaque to this layer —
  // they are produced by WebRtcCallTransport (Phase 42D) and passed
  // through unchanged.
  //
  // Push events (`call:*`) are bridged into [eventStream] by the
  // constructor above; `noop()` is unchanged from Phase 38.

  /// A no-op client used by [CallProvider.noop] when the device is
  /// disconnected from the home node.
  factory NodeServiceClient.noop() => NodeServiceClient(
        HomeRemoteClient(
          HomeRemoteClientOptions(
            resolveCandidates: () async => const [],
            createTransport: (_) => throw UnimplementedError(),
          ),
        ),
      );

  /// Send a call invite to [targetOwnerId]. Returns the call id on
  /// success, or null if the home node refused.
  Future<String?> sendCallInvite(
    String targetOwnerId,
    String sdpOffer, {
    List<Map<String, dynamic>>? iceServers,
    String callType = 'audio',
  }) async {
    final result = await _client.call('sendCallInvite', {
      'targetOwnerId': targetOwnerId,
      'sdpOffer': sdpOffer,
      'callType': callType,
      if (iceServers != null && iceServers.isNotEmpty) 'iceServers': iceServers,
    });
    // The home returns the callId as a JSON string (or null on refusal).
    if (result == null) return null;
    return result as String?;
  }

  /// Accept an incoming call invite. Returns true if accepted cleanly.
  Future<bool> acceptCallInvite(
    String callId,
    String sdpAnswer, {
    List<Map<String, dynamic>>? iceServers,
  }) async {
    final result = await _client.call('acceptCallInvite', {
      'callId': callId,
      'sdpAnswer': sdpAnswer,
      if (iceServers != null && iceServers.isNotEmpty) 'iceServers': iceServers,
    });
    return result == true;
  }

  /// Decline an incoming call invite.
  Future<bool> declineCallInvite(String callId, String reason) async {
    final result = await _client.call('declineCallInvite', {
      'callId': callId,
      'reason': reason,
    });
    return result == true;
  }

  /// End the active call.
  Future<bool> endCall(String callId) async {
    final result = await _client.call('endCall', {'callId': callId});
    return result == true;
  }

  /// Toggle the local mic muted state. Returns true if the home accepted
  /// the mute transition, false if the call was unknown or already ended
  /// (matching the API contract in packages/api/src/node-service.ts).
  Future<bool> setCallMuted(String callId, bool muted) async {
    final result = await _client.call('setCallMuted', {
      'callId': callId,
      'muted': muted,
    });
    return result == true;
  }

  /// Send a trickle ICE candidate to the remote peer for an active call.
  Future<bool> sendIceCandidate(
    String callId,
    Map<String, dynamic> candidate,
  ) async {
    final result = await _client.call('sendIceCandidate', {
      'callId': callId,
      'candidate': candidate,
    });
    return result == true;
  }
}
