import 'dart:async';

import '../models/chain_active.dart';
import '../models/chain_report.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/contact.dart';
import '../models/library_read.dart';
import '../models/terminal_session.dart';
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

  /// Phase 42 — fetch the home's node config. Used to read the
  /// user-configured `iceServers` (STUN/TURN) so the phone can build its
  /// `RTCPeerConnection` with the right ICE config. The home injects the
  /// same list into the `call.invite` envelope for the callee, but the
  /// caller needs it locally before generating its offer.
  Future<Map<String, dynamic>> getNodeConfig() async {
    return await _client.call('getNodeConfig') as Map<String, dynamic>;
  }

  /// AI model settings (Phase EnvoyGo settings) — push a partial
  /// `modelProviders` update to the home node. The home node accepts
  /// any `Partial<NodeConfig>` shape; the partial-update contract
  /// means callers can ship only the fields they want to change and
  /// leave everything else untouched.
  ///
  /// Returns `true` on success. Throws on transport / RPC error.
  Future<bool> updateModelProviders(
      Map<String, dynamic> modelProvidersPatch) async {
    final result = await _client.call('updateNodeConfig', {
      'modelProviders': modelProvidersPatch,
    }) as Map<String, dynamic>;
    return result['ok'] == true;
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
  }) async {
    final result = await _client.call('sendCallInvite', {
      'targetOwnerId': targetOwnerId,
      'sdpOffer': sdpOffer,
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
