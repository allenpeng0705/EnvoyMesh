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
      String targetOwnerId, String text) async {
    return await _client.call('sendChat', {
      'targetOwnerId': targetOwnerId,
      'text': text,
    }) as Map<String, dynamic>;
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
    return await _client.call('createChatRoom', {'name': name})
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

  Future<Map<String, dynamic>> getBridgeStatus() async {
    return await _client.call('getBridgeStatus')
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
      if (command != null) 'command': command,
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

  /// Open a PTY WebSocket sub-channel and return the URL to connect to.
  Future<Map<String, dynamic>> homeTerminalWsOpen(
      String sessionId) async {
    return await _client.call('homeTerminalWsOpen', {
      'sessionId': sessionId,
    }) as Map<String, dynamic>;
  }

  /// Send keystrokes (base64-encoded) through the PTY WebSocket.
  Future<void> homeTerminalWsSend(String dataBase64) async {
    await _client.call('homeTerminalWsSend', {
      'data': dataBase64,
    });
  }

  /// Close the PTY WebSocket sub-channel.
  Future<void> homeTerminalWsClose() async {
    await _client.call('homeTerminalWsClose');
  }

  // -- Profile --

  Future<Map<String, dynamic>> getHumanProfile() async {
    return await _client.call('getHumanProfile')
        as Map<String, dynamic>;
  }
}
