import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/contact.dart';
import '../models/terminal_session.dart';
import 'home_remote_client.dart';

/// Typed wrappers around the home node's JSON-RPC methods.
///
/// Each method corresponds to an RPC in `ws-protocol.ts`.
class NodeServiceClient {
  final HomeRemoteClient _client;

  NodeServiceClient(this._client);

  // -- Connection & pairing --

  Future<Map<String, dynamic>> pairWithHomeNode(
      String pairingToken, String deviceName, String platform) async {
    return await _client.call('pairThinClient', {
      'pairingToken': pairingToken,
      'deviceName': deviceName,
      'platform': platform,
    }) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getConnectionStatus() async {
    return await _client.call('getConnectionStatus')
        as Map<String, dynamic>;
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
  Future<Map<String, dynamic>> readLibraryItemContent({
    required String relativePath,
  }) async {
    return await _client.call('readLibraryItemContent', {
      'relativePath': relativePath,
    }) as Map<String, dynamic>;
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

  Future<List<ChatMessage>> listChatHistory(String targetOwnerId,
      {String? before, int? limit}) async {
    final params = <String, dynamic>{
      'targetOwnerId': targetOwnerId,
      if (before != null) 'before': before,
      if (limit != null) 'limit': limit,
    };
    final result = await _client.call('listChatHistory', params);
    final list = result as List<dynamic>;
    return list
        .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
        .toList();
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

  Future<Map<String, dynamic>> createChatRoom(String name) async {
    return await _client.call('createChatRoom', {'title': name})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> inviteToChatRoom(
      String roomId, String ownerId) async {
    return await _client.call('inviteToChatRoom', {
      'roomId': roomId,
      'ownerId': ownerId,
    }) as Map<String, dynamic>;
  }

  Future<void> leaveChatRoom(String roomId) async {
    await _client.call('leaveChatRoom', {'roomId': roomId});
  }

  Future<void> renameChatRoom(String roomId, String name) async {
    await _client.call('renameChatRoom', {
      'roomId': roomId,
      'name': name,
    });
  }

  // -- AI chat --

  Future<Map<String, dynamic>> sendToOpenClaw(String text) async {
    return await _client.call('sendToOpenClaw', {'text': text})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> sendToBridge(String text) async {
    return await _client.call('sendToBridge', {'text': text})
        as Map<String, dynamic>;
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
}
