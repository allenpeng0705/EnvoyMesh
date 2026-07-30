import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ext_agent/ext_agent_presets.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/chat_thread.dart';
import '../services/node_service_client.dart';
import '../storage/local_database.dart';
import 'contact_provider.dart';
import 'node_provider.dart';
import 'terminal_provider.dart';

/// State for the chat subsystem.
class ChatState {
  final List<ChatThread> threads;
  final Map<String, List<ChatMessage>> messages;
  final bool isLoading;
  final int selectedTab;
  final String? syncError;

  const ChatState({
    this.threads = const [],
    this.messages = const {},
    this.isLoading = false,
    this.selectedTab = 0,
    this.syncError,
  });

  ChatState copyWith({
    List<ChatThread>? threads,
    Map<String, List<ChatMessage>>? messages,
    bool? isLoading,
    int? selectedTab,
    String? syncError,
  }) {
    return ChatState(
      threads: threads ?? this.threads,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      selectedTab: selectedTab ?? this.selectedTab,
      syncError: syncError,
    );
  }
}

/// Provider for chat state (threads, messages, tab index).
final chatProvider =
    StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(ref);
});

/// Tracks seen message IDs per thread to prevent double-adds from
/// multiple push events (chat:message + agent:activity).
final _seenMessageIds = <String>{};

/// Filter that decides whether a candidate thread peer (a contact
/// owner id, or a "the other party" id from an inbound message)
/// is the user themselves. Mirrors the rule used by
/// `filterSelfBonds` in `contact_provider.dart`:
///   - the owner's own `envoy:owner:<…>` id, or
///   - a `envoy_device_<…>` device key (the multi-device shared
///     identity).
///
/// A chat thread for either of these would show the user as a
/// conversation partner with themselves, which is never what we
/// want. Pure function so every entry point (loadThreads,
/// onChatMessage, createContactThreads, _upsertThread) can share
/// the same rule.
bool isSelfThreadPeer(String? peerId, String? selfOwnerId) {
  if (peerId == null || peerId.isEmpty) return false;
  if (selfOwnerId != null && peerId == selfOwnerId) return true;
  if (peerId.startsWith('envoy_device_')) return true;
  return false;
}

/// Peer / agent key after `nodeId:` in a thread id.
/// Handles `nodeId:envoyai`, `nodeId:external`, and `nodeId:envoy:owner:…`.
String? threadPeerSuffix(String threadId, String? nodeId) {
  if (nodeId != null && nodeId.isNotEmpty) {
    final prefix = '$nodeId:';
    if (threadId.startsWith(prefix) && threadId.length > prefix.length) {
      return threadId.substring(prefix.length);
    }
  }
  final i = threadId.indexOf(':');
  if (i < 0 || i + 1 >= threadId.length) return null;
  return threadId.substring(i + 1);
}

class ChatNotifier extends StateNotifier<ChatState> {
  final Ref _ref;
  final LocalDatabase _localDb = LocalDatabase();
  final _seenMessageIds = <String>{};

  ChatNotifier(this._ref) : super(const ChatState());

  /// Load cached threads from local storage. Self-threads (the
  /// owner's own ownerId, or any envoy_device_ key) are filtered
  /// out on load — this cleans up any stale self-thread that was
  /// persisted in a previous session before the filter existed.
  /// The DB row is left in place for now (cheap to leave); the
  /// in-memory state is what the UI renders.
  Future<void> loadThreads(String nodeId) async {
    final rows = await _localDb.getThreads(nodeId);
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final threads = <ChatThread>[];
    for (final row in rows) {
      final t = _stripLegacyAgentStatusSuffix(ChatThread.fromJson(row));
      if (isSelfThreadPeer(t.contactOwnerId, selfOwnerId)) continue;
      // Pi is a terminal session now — drop legacy AI-section Pi chat rows.
      // Also drop synthetic "envoy:pi" Contacts leaks from old Ext Agent pushes.
      if (t.type == ChatThreadType.pi ||
          t.contactOwnerId == 'envoy:pi' ||
          t.id.endsWith(':envoy:pi')) {
        await _localDb.deleteThread(t.id);
        continue;
      }
      threads.add(t);
    }
    state = state.copyWith(threads: threads);
  }

  /// Clear legacy " (Bridge Offline)" suffixes from Ext Agent display names.
  ChatThread _stripLegacyAgentStatusSuffix(ChatThread t) {
    if (t.type == ChatThreadType.externalAgent) {
      final cleaned = t.displayName
          .replaceFirst(RegExp(r'\s*\(Bridge (Online|Offline)\)$'), '')
          .trim();
      if (cleaned.isNotEmpty && cleaned != t.displayName) {
        return ChatThread(
          id: t.id,
          nodeId: t.nodeId,
          type: t.type,
          displayName: cleaned,
          contactOwnerId: t.contactOwnerId,
          chatRoomId: t.chatRoomId,
          agentType: t.agentType,
          lastMessageText: t.lastMessageText,
          lastMessageAt: t.lastMessageAt,
          unreadCount: t.unreadCount,
        );
      }
    }
    return t;
  }

  /// Sync threads from the home node on initial connect.
  Future<void> syncThreads() async {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Build threads from contacts.
    final contactNotifier = _ref.read(contactProvider.notifier);
    // Sync contacts first, then build threads.
    state = state.copyWith(isLoading: true);
    await contactNotifier.syncBonds();
    await loadThreads(nodeState.activeNode!.id);
    state = state.copyWith(isLoading: false);
  }

  /// Send a direct message. Optional [attachments] for audio/files (Phase 37).
  Future<void> sendMessage(String targetOwnerId, String text,
      {List<Map<String, dynamic>>? attachments}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Optimistic insert.
    final now = DateTime.now().toUtc().toIso8601String();
    final threadId = '${nodeState.activeNode!.id}:$targetOwnerId';
    final attModels = attachments
        ?.map((a) => ChatAttachment.fromJson(a))
        .toList();
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: now,
      isOutbound: true,
      attachments: attModels,
    );

    // Update in-memory state.
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          tempMsg,
          ...?state.messages[threadId],
        ],
      },
    );

    // Update thread — use contact's display name if available.
    var contactName = _ref.read(contactProvider.notifier).getContact(targetOwnerId)?.displayName;
    if (contactName == null || contactName!.isEmpty) {
      contactName = _ref.read(contactProvider).bonds
          .where((c) => c.ownerId == targetOwnerId)
          .firstOrNull
          ?.displayName;
    }
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.direct,
      displayName: (contactName != null && contactName!.isNotEmpty)
          ? contactName!
          : targetOwnerId,
      contactOwnerId: targetOwnerId,
      lastMessageText: text,
      lastMessageAt: DateTime.now(),
    );

    try {
      // Send via RPC.
      await nodeService.sendChat(targetOwnerId, text,
          attachments: attachments);
      // TODO(31D): Reconcile temp message with server response.
    } catch (e) {
      // Mark message as failed?
    }
  }

  /// Load chat history for a thread from the home node (remote).
  ///
  /// Direct chats use [contactOwnerId]. Group chats use [chatRoomId]
  /// (history is stored under thread key `room:{roomId}`).
  Future<void> loadHistory(
    String threadId, {
    String? contactOwnerId,
    String? chatRoomId,
  }) async {
    final peerKey = chatRoomId != null && chatRoomId.isNotEmpty
        ? 'room:$chatRoomId'
        : contactOwnerId;
    if (peerKey == null || peerKey.isEmpty) return;

    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    final selfOwnerId = _ref.read(nodeProvider).ownerId;

    // lastOrNull on a newest-first list = the chronologically oldest message.
    final earliestCached = state.messages[threadId]?.lastOrNull;
    final messages = await nodeService.listChatHistory(
      peerKey,
      before: earliestCached?.createdAt,
      threadId: threadId,
      selfOwnerId: selfOwnerId,
    );

    if (messages.isEmpty) return;

    // Deduplicate by messageId before appending.
    final existingIds = state.messages[threadId]
            ?.map((m) => m.messageId)
            .toSet() ??
        {};
    final newMessages = messages
        .where((m) => !existingIds.contains(m.messageId))
        .toList();

    // Cache new messages in local DB (strip unsupported columns).
    for (final msg in newMessages) {
      try {
        await _localDb.insertMessage(msg.toJson());
      } catch (_) {
        // Best-effort local cache — don't fail the open.
      }
    }

    if (newMessages.isEmpty) return;

    // Merge then sort newest-first (ListView reverse:true → newest at bottom).
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          ...?state.messages[threadId],
          ...newMessages,
        ],
      },
    );
    _sortThreadMessages(threadId);
  }

  /// Load chat history for EnvoyAI / Ext Agent threads.
  Future<void> loadAgentHistory(String threadId) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    // threadId is `nodeId:envoyai` or `nodeId:external` — NOT split on every `:`.
    final agentType =
        threadPeerSuffix(threadId, nodeState.activeNode!.id) ?? 'envoyai';
    if (agentType != 'envoyai' && agentType != 'external') return;

    final oldestCached = state.messages[threadId]?.lastOrNull;
    final messages = await nodeService.listChatHistory(
      agentType,
      before: oldestCached?.createdAt,
      threadId: threadId,
      selfOwnerId: nodeState.ownerId,
    );

    if (messages.isEmpty) return;

    // Deduplicate by messageId.
    final existingIds = state.messages[threadId]
            ?.map((m) => m.messageId)
            .toSet() ??
        {};
    final newMessages = messages
        .where((m) => !existingIds.contains(m.messageId))
        // Normalize thread_id to the UI thread key (not "envoyai"/"external").
        .map((m) => ChatMessage(
              id: m.id,
              threadId: threadId,
              senderOwnerId: m.senderOwnerId,
              senderDisplayName: m.senderDisplayName,
              text: m.text,
              createdAt: m.createdAt,
              isOutbound: m.isOutbound,
              attachments: m.attachments,
            ))
        .toList();

    for (final msg in newMessages) {
      await _localDb.insertMessage(msg.toJson());
    }

    if (newMessages.isEmpty) return;

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          ...?state.messages[threadId],
          ...newMessages,
        ],
      },
    );
    _sortThreadMessages(threadId);
  }

  /// Load messages from local DB into memory.
  /// Called when opening a thread that has no in-memory messages yet.
  Future<void> loadMessagesFromDb(String threadId) async {
    final rows = await _localDb.getMessages(threadId);
    if (rows.isEmpty) return;
    // getMessages returns newest-first (DESC). Merge with any in-memory
    // messages (e.g. history that raced ahead) then re-sort.
    final fromDb = rows.map((r) => ChatMessage.fromJson(r)).toList();
    final existing = state.messages[threadId] ?? const <ChatMessage>[];
    final seen = fromDb.map((m) => m.id).toSet();
    final merged = [
      ...fromDb,
      ...existing.where((m) => !seen.contains(m.id)),
    ];
    state = state.copyWith(
      messages: {...state.messages, threadId: merged},
    );
    _sortThreadMessages(threadId);
  }

  /// Sort a thread's message list by createdAt descending (newest first).
  /// The ListView uses reverse:true, which expects index 0 = newest
  /// (rendered at the bottom).
  void _sortThreadMessages(String threadId) {
    final msgs = state.messages[threadId];
    if (msgs == null || msgs.length <= 1) return;
    final sorted = List<ChatMessage>.from(msgs)
      ..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
    state = state.copyWith(
      messages: {...state.messages, threadId: sorted},
    );
  }

  /// Mark a thread as read.
  Future<void> markRead(String threadId,
      {String? contactOwnerId}) async {
    if (contactOwnerId == null) return;

    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    await nodeService.markRead(contactOwnerId);

    // Update local unread count.
    final threads = state.threads.map((t) {
      if (t.id == threadId) {
        return ChatThread.fromJson({
          ...t.toJson(),
          'unread_count': 0,
        });
      }
      return t;
    }).toList();
    state = state.copyWith(threads: threads);
  }

  /// Handle a chat:message push event.
  ///
  /// Accepts both the home node's nested ChatMessage format
  /// (sender.ownerId, content.text, metadata.timestamp) and the
  /// flat serialized format (senderOwnerId, text, createdAt).
  void onChatMessage(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Normalize: the home node emits ChatMessage with nested structure.
    final sender = data['sender'] as Map<String, dynamic>?;
    final content = data['content'] as Map<String, dynamic>?;
    final metadata = data['metadata'] as Map<String, dynamic>?;

    final senderOwnerId = ((data['senderOwnerId'] ?? sender?['ownerId']) as String?)?.trim();
    final text = (data['text'] ?? content?['text']) as String?;
    final messageId = data['messageId'] as String?;
    final createdAt = (data['createdAt'] ?? metadata?['timestamp']) as String?;
    final senderDisplayName = (data['senderDisplayName'] ?? sender?['displayName']) as String?;
    final attachmentsRaw = data['attachments'] as List<dynamic>? ??
        content?['attachments'] as List<dynamic>?;

    if (senderOwnerId == null) return;

    // Skip messages with no text AND no audio attachments — empty bubbles.
    final hasAudio = attachmentsRaw?.any((a) {
      final mime = (a is Map) ? (a['mimeType'] ?? a['mime_type']) as String? : null;
      return mime != null && mime.startsWith('audio/');
    }) ?? false;
    if ((text == null || text.isEmpty) && !hasAudio) return;

    // Skip intro messages for contacts that are already bonded — they
    // have no pending intro request so showing "Wants to connect" is wrong.
    if (messageId != null && messageId!.startsWith('intro_')) {
      final bonds = _ref.read(contactProvider).bonds;
      if (bonds.any((c) => c.ownerId == senderOwnerId)) {
        return; // Already bonded — skip intro message.
      }
    }

    // --- Identify the parties ---
    final selfOwnerId = nodeState.ownerId;
    final recipient = data['recipient'] as Map<String, dynamic>?;
    final recipientOwnerId = recipient?['ownerId'] as String?;
    final actorRole = sender?['actorRole'] as String?;

    // Is this message sent by the owner, by an agent, or by someone else?
    final sentBySelf = selfOwnerId != null && senderOwnerId == selfOwnerId;
    // Synthetic agent senders must never become Contacts rows.
    final isSyntheticAgent = senderOwnerId == 'envoy:pi' ||
        senderOwnerId == '__envoy_ai__' ||
        senderOwnerId.startsWith('envoy_agent_') ||
        senderOwnerId.startsWith('envoy:agent:');
    final isAgent = !(senderOwnerId == 'terminal') &&
        (isSyntheticAgent || (sentBySelf && actorRole == 'agent'));
    final isTerminal = senderOwnerId == 'terminal';

    // Figure out the "other party" — which contact's thread this goes to.
    final String peerId;
    if (sentBySelf && actorRole == 'human') {
      // Owner sent to a contact → thread is the recipient.
      peerId = recipientOwnerId ?? senderOwnerId;
    } else if (isAgent && recipientOwnerId != null && recipientOwnerId.isNotEmpty) {
      // Agent sent to a contact → thread is the recipient.
      peerId = recipientOwnerId;
    } else {
      // Inbound from a contact → thread is the sender.
      peerId = senderOwnerId;
    }

    // Filter self-threads: if the resolved "other party" is the
    // user themselves (a self-echo with no recipient, or a
    // self-bond / envoy_device_ entry that slipped through), drop
    // the message entirely. This is the bug that surfaced a
    // "chat with yourself" thread in the list — see the
    // [isSelfThreadPeer] helper for the rule.
    // Do NOT filter agent messages — the AI replies to the owner,
    // so recipientOwnerId == selfOwnerId is expected and correct.
    if (!isAgent && isSelfThreadPeer(peerId, selfOwnerId)) {
      return;
    }

    // Dedup: skip if we've already seen this messageId (dual delivery).
    final msgId = messageId ?? '';
    if (msgId.isNotEmpty && _seenMessageIds.contains(msgId)) return;
    if (msgId.isNotEmpty) {
      _seenMessageIds.add(msgId);
      if (_seenMessageIds.length > 200) {
        _seenMessageIds
            .removeAll(_seenMessageIds.take(_seenMessageIds.length - 200));
      }
    }

    // --- Determine which thread to put the message in ---
    // Route strictly by deliveryChannel when present — never let bridge
    // metadata or agentType bleed EnvoyAI into Ext Agent (or the reverse).
    final terminalId = data['terminalId'] as String?;
    final terminalName = data['terminalName'] as String?;
    final deliveryChannel = metadata?['deliveryChannel'] as String?;
    final deliverySource = metadata?['deliverySource'] as String?;
    final isBuiltinAi = deliveryChannel == 'ai' ||
        senderOwnerId == '__envoy_ai__';
    final isBridgeAgent = !isBuiltinAi &&
        ((deliveryChannel == 'agent' && deliverySource == 'bridge') ||
            senderOwnerId == 'envoy:pi');
    final agentType = isBridgeAgent
        ? 'external'
        : 'envoyai';

    // Agent messages: if the recipient is a known contact → contact's thread.
    // If the recipient is the owner (chatting with EnvoyAI) → envoyai thread.
    final agentTalkToContact = isAgent &&
        !isBridgeAgent &&
        !isBuiltinAi &&
        recipientOwnerId != null &&
        recipientOwnerId.isNotEmpty &&
        recipientOwnerId != selfOwnerId;

    final String threadId;
    if (isTerminal) {
      threadId = '${nodeState.activeNode!.id}:term:${terminalId ?? senderOwnerId}';
    } else if (isBuiltinAi) {
      threadId = '${nodeState.activeNode!.id}:envoyai';
    } else if (isBridgeAgent) {
      threadId = '${nodeState.activeNode!.id}:external';
    } else if (agentTalkToContact) {
      threadId = '${nodeState.activeNode!.id}:$recipientOwnerId';
    } else if (isAgent) {
      // Agent without channel metadata → EnvoyAI (safer than Ext Agent).
      threadId = '${nodeState.activeNode!.id}:envoyai';
    } else {
      threadId = '${nodeState.activeNode!.id}:$peerId';
    }

    // --- Display names ---
    // Thread name: ONLY use the contact's display name for direct threads.
    // Never use senderDisplayName — that changes with every message.
    String? threadDisplayName;
    if (!isTerminal && (agentTalkToContact || !isAgent)) {
      final contactNotifier = _ref.read(contactProvider.notifier);
      final contact = contactNotifier.getContact(peerId);
      threadDisplayName = contact?.displayName;
      // Fall back to bonds list.
      if ((threadDisplayName == null || threadDisplayName!.isEmpty) && peerId.isNotEmpty) {
        final contacts = _ref.read(contactProvider).bonds;
        threadDisplayName = contacts
            .where((c) => c.ownerId == peerId)
            .firstOrNull
            ?.displayName;
      }
    }
    if (threadDisplayName == null || threadDisplayName!.isEmpty || threadDisplayName!.startsWith('envoy:owner:')) {
      threadDisplayName = peerId;
    }

    // Message sender display:
    // - Sent by self (human) → "You", right side
    // - AI reply for a contact → "You", right side (agent acts as owner)
    // - Sent by agent (EnvoyAI chat) → agent name, left side
    // - Sent by peer → peer's name, left side
    final bool showAsMine = (sentBySelf && actorRole == 'human') || agentTalkToContact;
    final msgSenderDisplay = showAsMine
        ? 'You'
        : (isBridgeAgent
            ? (senderDisplayName ?? 'Ext Agent')
            : (isBuiltinAi || (isAgent && !agentTalkToContact)
                ? (senderDisplayName ?? 'EnvoyAI')
                : (senderDisplayName ?? senderOwnerId)));

    List<ChatAttachment>? attachments;
    try {
      attachments = attachmentsRaw
          ?.map((a) => ChatAttachment.fromJson(a as Map<String, dynamic>))
          .toList();
    } catch (_) {
      attachments = null;
    }
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: msgSenderDisplay,
      text: text,
      createdAt: createdAt,
      isOutbound: showAsMine,
      attachments: attachments,
    );

    // Cache in local DB.
    _localDb.insertMessage(msg.toJson());

    final isAiThread = isBridgeAgent ||
        isBuiltinAi ||
        (isAgent && !agentTalkToContact);
    // Update thread.
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: isTerminal
          ? ChatThreadType.terminal
          : isAiThread
              ? (isBridgeAgent
                  ? ChatThreadType.externalAgent
                  : ChatThreadType.envoyai)
              : ChatThreadType.direct,
      displayName: isTerminal
          ? 'Terminal: ${terminalName ?? terminalId ?? ''}'
          : agentTalkToContact
              ? (threadDisplayName ?? peerId)
              : isAiThread
                  ? (isBridgeAgent
                      ? (senderDisplayName ?? 'Ext Agent')
                      : 'EnvoyAI')
                  : threadDisplayName ?? peerId,
      contactOwnerId: (isAiThread || (isAgent && !agentTalkToContact))
          ? null
          : peerId,
      agentType: isAiThread ? agentType : null,
      lastMessageText: text ?? '',
      lastMessageAt: createdAt != null
          ? DateTime.tryParse(createdAt)
          : DateTime.now(),
      unreadIncrement: true,
    );

    // Dedup: check by messageId first, then by text content match.
    // Covers both double-push (chat:message + agent:activity) and
    // optimistic temp messages. A Set makes duplicate checks O(1).
    final existingMessages = state.messages[threadId] ?? [];
    if (messageId != null) {
      if (_seenMessageIds.add('$threadId:$messageId')) {
        // New messageId — proceed.
      } else {
        return; // Duplicate messageId — skip.
      }
    } else if (existingMessages.any((m) => m.text == text)) {
      return; // Duplicate content — skip.
    }
    final optimisticIdx =
        existingMessages.indexWhere((m) => m.text == text && m.id.startsWith('temp_'));
    if (optimisticIdx >= 0) {
      // Replace the optimistic message with the server version.
      final updated = List<ChatMessage>.from(existingMessages);
      final oldMsg = updated[optimisticIdx];
      updated[optimisticIdx] = msg;
      // Also update the DB so re-loads use the correct (server) timestamp.
      if (oldMsg.id.startsWith('temp_')) {
        // Replace with server version (canonical server timestamp).
        // Fire-and-forget: the method isn't async but the DB write
        // is serialised on sqflite's queue so the row is safe.
        _localDb.replaceMessage(oldMsg.id, msg.toJson());
      }
      state = state.copyWith(
        messages: {...state.messages, threadId: updated},
      );
      _sortThreadMessages(threadId);
    } else {
      // New message — prepend so newest is at index 0 (bottom with reverse:true).
      state = state.copyWith(
        messages: {
          ...state.messages,
          threadId: [msg, ...existingMessages],
        },
      );
    }

    // Dual-route agent messages: if the AI reply is addressed to a
    // known contact, also show it in that contact's thread (same as
    // the Social app behaviour). Never dual-route Ext Agent / EnvoyAI
    // owner-assistant turns.
    if (!isBridgeAgent &&
        !isBuiltinAi &&
        isAgent &&
        recipientOwnerId != null &&
        recipientOwnerId.isNotEmpty &&
        recipientOwnerId != selfOwnerId) {
      final contactThreadId = '${nodeState.activeNode!.id}:$recipientOwnerId';
      final contactMsg = ChatMessage(
        id: '${messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}'}_contact',
        threadId: contactThreadId,
        senderOwnerId: senderOwnerId,
        senderDisplayName: 'You',
        text: text,
        createdAt: createdAt,
        isOutbound: true,
      );
      final contactNotifier = _ref.read(contactProvider.notifier);
      final contactName = contactNotifier.getContact(recipientOwnerId)?.displayName ??
          recipientOwnerId;
      _upsertThread(
        threadId: contactThreadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.direct,
        displayName: contactName,
        contactOwnerId: recipientOwnerId,
        lastMessageText: text ?? '',
        lastMessageAt: createdAt != null
            ? DateTime.tryParse(createdAt)
            : DateTime.now(),
        unreadIncrement: true,
      );
      final contactExisting = state.messages[contactThreadId] ?? [];
      state = state.copyWith(
        messages: {
          ...state.messages,
          contactThreadId: [contactMsg, ...contactExisting],
        },
      );
    }
  }

  // -- Room operations --

  /// Sync chat rooms from the home node.
  Future<void> syncRooms({NodeServiceClient? client}) async {
    final nodeService = client ?? _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    try {
      final rooms = await nodeService.listChatRooms();
      final nodeId = nodeState.activeNode!.id;
      await _localDb.upsertRooms(
        nodeId,
        rooms
            .map(
              (r) => ChatRoom(
                id: r.id,
                nodeId: nodeId,
                name: r.name,
                memberCount: r.memberCount,
                lastMessageText: r.lastMessageText,
                lastMessageAt: r.lastMessageAt,
              ).toJson(),
            )
            .toList(),
      );

      // Create threads for rooms.
      for (final room in rooms) {
        final threadId = '$nodeId:room:${room.id}';
        _upsertThread(
          threadId: threadId,
          nodeId: nodeId,
          type: ChatThreadType.group,
          displayName: room.name.isNotEmpty ? room.name : 'Group',
          chatRoomId: room.id,
          lastMessageText: room.lastMessageText,
          lastMessageAt: room.lastMessageAt,
        );
      }
    } catch (e) {
      // Log the error so we can diagnose sync issues.
      debugPrint('syncRooms failed: $e');
    }
  }

  /// Send a message to a group chat room.
  Future<void> sendRoomMessage(String roomId, String text) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final now = DateTime.now().toUtc().toIso8601String();
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: now,
      isOutbound: true,
    );

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          tempMsg,
          ...?state.messages[threadId],
        ],
      },
    );

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.group,
      displayName: 'Room', // Fallback; existing thread data overrides.
      chatRoomId: roomId,
      lastMessageText: text,
      lastMessageAt: DateTime.now(),
    );

    await nodeService.sendChatRoomMessage(roomId, text);
  }

  /// Handle a chat:room-message push event.
  void onRoomMessage(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Two formats for chat:room-message:
    //   Wrapped: { roomId, message: { sender, content, ... } }
    //   Direct:  ChatMessage { sender, content, recipient, ... }
    final message = data['message'] as Map<String, dynamic>?;
    final inner = message ?? data; // Unwrap if wrapped.

    final sender = inner['sender'] as Map<String, dynamic>?;
    final content = inner['content'] as Map<String, dynamic>?;
    final metadata = inner['metadata'] as Map<String, dynamic>?;
    final recipient = inner['recipient'] as Map<String, dynamic>?;

    var roomId = (data['roomId'] ?? recipient?['ownerId']) as String?;
    if (roomId != null && roomId.startsWith('room:')) {
      roomId = roomId.substring('room:'.length);
    }
    final senderOwnerId = ((inner['senderOwnerId'] ?? sender?['ownerId']) as String?)?.trim();
    final text = (inner['text'] ?? content?['text']) as String?;
    final messageId = inner['messageId'] as String?;
    final createdAt = (inner['createdAt'] ?? metadata?['timestamp']) as String?;
    final roomName = (data['roomName'] ?? data['title'] ?? recipient?['displayName']) as String?;
    final senderDisplayName = (inner['senderDisplayName'] ?? sender?['displayName']) as String?;

    if (roomId == null || roomId.isEmpty) return;

    // Skip messages with no text — they would render as empty bubbles.
    if (text == null || text.isEmpty) return;

    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: senderDisplayName,
      text: text,
      createdAt: createdAt,
      isOutbound: false,
    );

    _localDb.insertMessage(msg.toJson());

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.group,
      displayName: roomName ?? 'Group',
      chatRoomId: roomId,
      lastMessageText: text ?? '',
      lastMessageAt: createdAt != null
          ? DateTime.tryParse(createdAt)
          : DateTime.now(),
      unreadIncrement: true,
    );

    // Dedup room messages by messageId OR by temp optimistic match.
    final existing = state.messages[threadId] ?? [];
    if (messageId != null && existing.any((m) => m.id == messageId)) return;
    if (existing.any((m) => m.text == text && m.id.startsWith('temp_'))) return;

    // Prepend so newest is at index 0 (bottom with reverse:true).
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [msg, ...existing],
      },
    );
  }

  /// Handle a chat:room-updated push (invite / rename / membership).
  void onRoomUpdated(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final room = ChatRoom.fromJson({
      ...data,
      'nodeId': nodeState.activeNode!.id,
    });
    if (room.id.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:room:${room.id}';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.group,
      displayName: room.name.isNotEmpty ? room.name : 'Group',
      chatRoomId: room.id,
      lastMessageText: room.lastMessageText,
      lastMessageAt: room.lastMessageAt,
    );
    _localDb.upsertRooms(nodeState.activeNode!.id, [room.toJson()]).catchError((_) {});
  }

  /// Handle a chat:room-removed push (leave / dismiss).
  void onRoomRemoved(String roomId) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null || roomId.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final threads = state.threads.where((t) => t.id != threadId).toList();
    final messages = Map<String, List<ChatMessage>>.from(state.messages)
      ..remove(threadId);
    state = state.copyWith(threads: threads, messages: messages);
    _localDb.deleteThread(threadId).catchError((_) {});
  }

  /// Create a new chat room.
  Future<void> createRoom(String name) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    await nodeService.createChatRoom(name);
    await syncRooms();
  }

  /// Invite a contact to a room.
  Future<void> inviteToRoom(String roomId, String ownerId) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    await nodeService.inviteToChatRoom(roomId, ownerId);
  }

  // -- AI Chat --

  /// Send a message to an AI agent.
  /// [agentType] is "envoyai" for the built-in OpenClaw assistant,
  /// or "external" for the bridge HTTP agent.
  Future<void> sendAgentMessage(String text, {String agentType = 'envoyai'}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final threadId = '${nodeState.activeNode!.id}:$agentType';
    final now = DateTime.now().toUtc().toIso8601String();
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: now,
      isOutbound: true,
    );

    // Persist to local DB immediately so the message survives app restarts
    // and re-entry to the chat screen (which loads from DB, not memory).
    _localDb.insertMessage(tempMsg.toJson());

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          tempMsg,
          ...?state.messages[threadId],
        ],
      },
    );

    final isEnvoyAi = agentType == 'envoyai';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: isEnvoyAi ? ChatThreadType.envoyai : ChatThreadType.externalAgent,
      displayName: isEnvoyAi ? 'EnvoyAI' : 'Ext Agent',
      agentType: agentType,
      lastMessageText: text,
      lastMessageAt: DateTime.now(),
    );

    // Branch: built-in EnvoyAI uses sendToOpenClaw; external bridge uses sendToBridge.
    if (agentType == 'external') {
      await nodeService.sendToBridge(text);
    } else {
      await nodeService.sendToOpenClaw(text);
    }
  }

  /// Resolve Ext Agent display name from bridge status (active preset name).
  /// Matches Social: show the current agent name, never Online/Offline suffixes.
  static String resolveExtAgentDisplayName(Map<String, dynamic> data) {
    final activeId = (data['activeExtAgentId'] as String?)?.trim();
    final extAgents = data['extAgents'];
    if (activeId != null && activeId.isNotEmpty && extAgents is List) {
      for (final raw in extAgents) {
        if (raw is! Map) continue;
        if (raw['id']?.toString() != activeId) continue;
        final n = (raw['name'] as String?)?.trim();
        if (n != null && n.isNotEmpty) return n;
        break;
      }
    }
    final rawName = (data['agentName'] as String?)?.trim() ?? '';
    if (rawName.isNotEmpty) return rawName;
    if (activeId != null && activeId.isNotEmpty) {
      for (final preset in defaultExtAgents) {
        if (preset.id == activeId) return preset.name;
      }
    }
    return 'Ext Agent';
  }

  /// Handle a bridge:status push event.
  void onBridgeStatus(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Use explicit agentType from BridgeStatus if present.
    // Fall back to name-based heuristic only when the node hasn't yet
    // sent agentType (backward compat with older nodes).
    final explicitType = data['agentType'] as String?;
    final displayName = resolveExtAgentDisplayName(data);
    final nameIsExternal = displayName.toLowerCase().contains('claw') ||
        displayName.toLowerCase().contains('open') ||
        displayName.toLowerCase().contains('external') ||
        displayName.toLowerCase() == 'pi' ||
        displayName.toLowerCase() == 'hermes' ||
        (data['activeExtAgentId'] as String?)?.isNotEmpty == true;
    final agentType = explicitType ??
        (nameIsExternal ? 'external' : 'envoyai');
    final threadId = '${nodeState.activeNode!.id}:$agentType';

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: agentType == 'external'
          ? ChatThreadType.externalAgent
          : ChatThreadType.envoyai,
      // Ext Agent row: current agent name only (offline is the chat banner).
      displayName: agentType == 'external' ? displayName : (displayName.isNotEmpty ? displayName : 'EnvoyAI'),
      agentType: agentType,
    );
  }

  /// Sync terminal sessions from the home node as threads.
  Future<void> syncTerminals() async {
    final termNotifier = _ref.read(terminalProvider.notifier);
    await termNotifier.loadSessions();

    final termState = _ref.read(terminalProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    for (final session in termState.sessions) {
      final threadId =
          '${nodeState.activeNode!.id}:term:${session.id}';
      final displayName = session.isPi
          ? (session.name.startsWith('π') ? session.name : 'π ${session.name}')
          : 'Terminal: ${session.name}';
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.terminal,
        displayName: displayName,
        lastMessageText:
            '${session.runningProcess ?? (session.isPi ? 'pi' : 'shell')} — ${session.cwd ?? '~'}',
      );
    }
  }

  /// Create a new terminal session on the home node.
  Future<void> createTerminal(
      {required String name, String? cwd}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final result =
        await nodeService.createTerminalSession(command: name, cwd: cwd);
    final sessionId = result['sessionId'] as String?;
    if (sessionId == null) return;

    // Create a terminal thread.
    final threadId = '${nodeState.activeNode!.id}:term:$sessionId';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.terminal,
      displayName: 'Terminal: $name',
      lastMessageAt: DateTime.now(),
    );
  }

  /// Start a Pi coding TUI on the home node (same as Social “π Pi”).
  ///
  /// Returns `sessionId` on success, or throws with the home-node reason.
  Future<String> createPiTerminal({required String projectPath}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }

    final path = projectPath.trim();
    if (path.isEmpty) {
      throw ArgumentError('Choose a project folder to open Pi.');
    }

    final result = await nodeService.ensurePiTerminalSession(
      projectPath: path,
    );
    if (result['ok'] != true) {
      throw StateError(
        (result['reason'] as String?)?.trim().isNotEmpty == true
            ? result['reason'] as String
            : 'Failed to start Pi',
      );
    }

    final session = result['session'];
    Map<String, dynamic>? sessionMap;
    if (session is Map<String, dynamic>) {
      sessionMap = session;
    } else if (session is Map) {
      sessionMap = session.cast<String, dynamic>();
    }
    final sessionId = sessionMap?['sessionId'] as String?;
    if (sessionId == null || sessionId.isEmpty) {
      throw StateError('Pi started but session id was missing');
    }

    final title = (sessionMap?['title'] as String?)?.trim();
    final displayName = (title != null && title.isNotEmpty)
        ? (title.startsWith('π') ? title : 'π $title')
        : 'π Pi';

    final threadId = '${nodeState.activeNode!.id}:term:$sessionId';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.terminal,
      displayName: displayName,
      lastMessageText: path,
      lastMessageAt: DateTime.now(),
    );

    // Refresh full terminal list so role/cwd stay in sync.
    await syncTerminals();
    return sessionId;
  }

  /// Delete a single message from a thread.
  Future<void> deleteMessage(String threadId, ChatMessage msg) async {
    await _localDb.deleteMessage(msg.id);
    final existing = state.messages[threadId] ?? [];
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: existing.where((m) => m.id != msg.id).toList(),
      },
    );
  }

  /// Clear all messages in a thread.
  Future<void> clearMessages(String threadId) async {
    await _localDb.deleteMessagesForThread(threadId);
    state = state.copyWith(
      messages: {...state.messages, threadId: []},
      threads: state.threads.map((t) {
        if (t.id == threadId) {
          return ChatThread.fromJson({
            ...t.toJson(),
            'last_message_text': null,
            'last_message_at': null,
          });
        }
        return t;
      }).toList(),
    );
  }

  /// Delete a thread and all its messages.
  Future<void> deleteThread(String threadId) async {
    // Remove from local DB.
    await _localDb.deleteThread(threadId);
    // Remove from in-memory state.
    final threads = state.threads.where((t) => t.id != threadId).toList();
    final messages = Map<String, List<ChatMessage>>.from(state.messages);
    messages.remove(threadId);
    state = state.copyWith(threads: threads, messages: messages);
  }

  /// Select a tab.
  void selectTab(int index) {
    state = state.copyWith(selectedTab: index);
  }

  /// Create chat threads for all bonded contacts that don't have one yet.
  /// Called after bonds sync so all contacts appear in the Chats tab.
  /// Self-bonds (the user's own ownerId, or any envoy_device_ key)
  /// are skipped — see [isSelfThreadPeer].
  void createContactThreads() {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final selfOwnerId = nodeState.ownerId;
    final contacts = _ref.read(contactProvider).bonds;
    final existingThreadIds = state.threads
        .where((t) => t.type == ChatThreadType.direct)
        .map((t) => t.contactOwnerId)
        .toSet();

    for (final contact in contacts) {
      // Defensive: the contact_provider bond filter already
      // excludes self, but if a stale contact list arrives
      // (e.g. from the local DB before the bond filter was
      // applied) this keeps the chat list clean.
      if (isSelfThreadPeer(contact.ownerId, selfOwnerId)) continue;
      if (existingThreadIds.contains(contact.ownerId)) continue;
      final threadId = '${nodeState.activeNode!.id}:${contact.ownerId}';
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.direct,
        displayName: contact.displayName ?? contact.ownerId,
        contactOwnerId: contact.ownerId,
      );
    }
  }

  /// Refresh thread display names from contact data.
  /// Called after bonds sync so threads with raw owner IDs get real names.
  void refreshThreadDisplayNames() {
    final contacts = _ref.read(contactProvider).bonds;
    if (contacts.isEmpty) return;
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final contactMap = <String, String>{};
    for (final c in contacts) {
      if (c.displayName != null && c.displayName!.isNotEmpty) {
        contactMap[c.ownerId] = c.displayName!;
      }
    }
    if (contactMap.isEmpty) return;

    var changed = false;
    final updated = state.threads.map((t) {
      if (t.type == ChatThreadType.direct &&
          t.contactOwnerId != null &&
          contactMap.containsKey(t.contactOwnerId) &&
          t.displayName.startsWith('envoy:owner:')) {
        changed = true;
        return ChatThread.fromJson({
          ...t.toJson(),
          'display_name': contactMap[t.contactOwnerId]!,
        });
      }
      return t;
    })
        // Filter self-threads (the user themselves, in either
        // owner-id or device-key form) so the chat list never
        // shows a thread for the active user. Defensive: this is
        // also enforced in [loadThreads] and [onChatMessage], but
        // refreshing display names is another place a stale
        // self-thread could survive.
        .where((t) => !isSelfThreadPeer(t.contactOwnerId, selfOwnerId))
        .toList();

    if (changed) {
      state = state.copyWith(threads: updated);
    }
  }

  /// Resolve the display name for a thread, preventing overwrites
  /// on direct threads (where the name should be static).
  String _resolveThreadName(ChatThreadType type, String newName, String? existingName) {
    if (newName.isEmpty) return existingName ?? '';
    // Direct/group: keep a human display name once resolved (avoid raw owner IDs
    // bouncing back in). Ext Agent titles update when bridge status changes
    // (e.g. HomeClaw → Hermes) or to clear legacy " (Bridge Offline)".
    if (existingName != null && existingName.isNotEmpty) {
      if (type == ChatThreadType.direct || type == ChatThreadType.group) {
        if (!existingName.startsWith('envoy:owner:') && existingName != 'Group') {
          return existingName;
        }
      } else if (type == ChatThreadType.envoyai) {
        // Built-in assistant name is stable.
        return existingName;
      } else if (type == ChatThreadType.externalAgent) {
        return newName;
      } else {
        return existingName;
      }
    }
    return newName;
  }

  /// Create or update a thread in memory and local DB.
  void _upsertThread({
    required String threadId,
    required String nodeId,
    required ChatThreadType type,
    required String displayName,
    String? contactOwnerId,
    String? chatRoomId,
    String? agentType,
    String? lastMessageText,
    DateTime? lastMessageAt,
    bool unreadIncrement = false,
  }) {
    // Choke-point filter: never create or update a thread for
    // the user themselves (the owner's own ownerId, or a
    // envoy_device_ key). This is the central place every
    // entry point funnels through, so the chat list can never
    // re-acquire a self-thread from any future code path.
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    if (isSelfThreadPeer(contactOwnerId, selfOwnerId)) return;
    final existing = state.threads
        .where((t) => t.id == threadId)
        .firstOrNull;

    final newThread = ChatThread(
      id: threadId,
      nodeId: nodeId,
      // For agent threads (envoyai, externalAgent), preserve the existing type
      // once set — it is determined at creation time and must not be
      // overwritten by a misclassified incoming message.
      type: existing != null &&
             (existing.type == ChatThreadType.envoyai ||
              existing.type == ChatThreadType.externalAgent)
          ? existing.type
          : type,
      displayName: _resolveThreadName(
          type, displayName, existing?.displayName),
      contactOwnerId: contactOwnerId ?? existing?.contactOwnerId,
      chatRoomId: chatRoomId ?? existing?.chatRoomId,
      agentType: agentType ?? existing?.agentType,
      lastMessageText: lastMessageText ?? existing?.lastMessageText,
      lastMessageAt: lastMessageAt ?? existing?.lastMessageAt,
      unreadCount: (existing?.unreadCount ?? 0) +
          (unreadIncrement ? 1 : 0),
    );

    _localDb.upsertThread(newThread.toJson());

    final threads = [
      newThread,
      ...state.threads.where((t) => t.id != threadId),
    ];

    state = state.copyWith(threads: threads);
  }
}
