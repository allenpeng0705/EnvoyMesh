import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/chat_thread.dart';
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
    final threads = rows
        .map((r) => ChatThread.fromJson(r))
        .where((t) => !isSelfThreadPeer(t.contactOwnerId, selfOwnerId))
        .toList();
    state = state.copyWith(threads: threads);
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
    final now = DateTime.now().toIso8601String();
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

  /// Send a voice note attachment (Phase 37). Inserts an optimistic bubble,
  /// then uploads via the home node (local-first persist + background P2P).
  Future<bool> sendVoiceNote({
    required String threadId,
    required String contactOwnerId,
    required String contentBase64,
    required String filename,
    required String mimeType,
    int? durationSec,
  }) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return false;

    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return false;

    final now = DateTime.now().toIso8601String();
    final tempId = 'pending-voice-${DateTime.now().microsecondsSinceEpoch}';
    const placeholderText = '[Audio message — no transcription available]';
    final tempAtt = ChatAttachment(
      id: tempId,
      filename: filename,
      mimeType: mimeType,
      sizeBytes: base64Decode(contentBase64).length,
      sensitivity: 'friends',
      durationSec: durationSec,
    );
    final tempMsg = ChatMessage(
      id: tempId,
      threadId: threadId,
      text: placeholderText,
      createdAt: now,
      isOutbound: true,
      attachments: [tempAtt],
    );

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [tempMsg, ...?state.messages[threadId]],
      },
    );

    var contactName = _ref
        .read(contactProvider.notifier)
        .getContact(contactOwnerId)
        ?.displayName;
    contactName ??= _ref
        .read(contactProvider)
        .bonds
        .where((c) => c.ownerId == contactOwnerId)
        .firstOrNull
        ?.displayName;
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.direct,
      displayName: (contactName != null && contactName.isNotEmpty)
          ? contactName
          : contactOwnerId,
      contactOwnerId: contactOwnerId,
      lastMessageText: placeholderText,
      lastMessageAt: DateTime.now(),
    );

    try {
      await nodeService.sendChatAttachment(
        targetOwnerId: contactOwnerId,
        filename: filename,
        contentBase64: contentBase64,
        mimeType: mimeType,
      );
      await loadHistory(threadId, contactOwnerId: contactOwnerId);
      return true;
    } catch (_) {
      state = state.copyWith(
        messages: {
          ...state.messages,
          threadId: (state.messages[threadId] ?? [])
              .where((m) => m.id != tempId)
              .toList(),
        },
      );
      return false;
    }
  }

  /// Load chat history for a thread from the home node (remote).
  Future<void> loadHistory(String threadId,
      {String? contactOwnerId}) async {
    if (contactOwnerId == null) return;

    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    // lastOrNull on a newest-first list = the chronologically oldest message.
    final earliestCached = state.messages[threadId]?.lastOrNull;
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final messages = await nodeService.listChatHistoryForThread(
      threadId,
      contactOwnerId,
      selfOwnerId: selfOwnerId,
      before: earliestCached?.createdAt,
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

    // Cache new messages in local DB.
    for (final msg in newMessages) {
      await _localDb.insertMessage(msg.toJson());
    }

    if (newMessages.isEmpty) return;

    // Append new server messages so newer messages appear after cached ones.
    // Server returns newest-first; appending keeps newest at the end (bottom).
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          ...?state.messages[threadId],
          ...newMessages,
        ],
      },
    );

    // Sort by createdAt ascending (oldest first) so the display is always chronological.
    _sortThreadMessages(threadId);
  }

  /// Load chat history for the EnvoyAI thread (owner chatting with AI).
  /// Uses agentType as the contactOwnerId equivalent.
  Future<void> loadAgentHistory(String threadId) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    // EnvoyAI thread: extract agentType from threadId (format: nodeId:agentType).
    final parts = threadId.split(':');
    final agentType = parts.length >= 3 ? parts[2] : 'envoyai';

    final oldestCached = state.messages[threadId]?.lastOrNull;
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final messages = await nodeService.listChatHistoryForThread(
      threadId,
      agentType,
      selfOwnerId: selfOwnerId,
      before: oldestCached?.createdAt,
    );

    if (messages.isEmpty) return;

    // Deduplicate by messageId.
    final existingIds = state.messages[threadId]
            ?.map((m) => m.messageId)
            .toSet() ??
        {};
    final newMessages = messages
        .where((m) => !existingIds.contains(m.messageId))
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

    // Sort by createdAt ascending so display is always chronological.
    _sortThreadMessages(threadId);
  }

  /// Load group chat history from the home node (`room:<roomId>` thread key).
  Future<void> loadRoomHistory(String threadId, String roomId) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    final earliestCached = state.messages[threadId]?.lastOrNull;
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final messages = await nodeService.listChatHistoryForThread(
      threadId,
      'room:$roomId',
      selfOwnerId: selfOwnerId,
      before: earliestCached?.createdAt,
    );

    if (messages.isEmpty) return;

    final existingIds =
        state.messages[threadId]?.map((m) => m.messageId).toSet() ?? {};
    final newMessages =
        messages.where((m) => !existingIds.contains(m.messageId)).toList();

    for (final msg in newMessages) {
      await _localDb.insertMessage(msg.toJson());
    }
    if (newMessages.isEmpty) return;

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [...?state.messages[threadId], ...newMessages],
      },
    );
    _sortThreadMessages(threadId);
  }

  /// Load messages from local DB into memory.
  /// Called when opening a thread that has no in-memory messages yet.
  Future<void> loadMessagesFromDb(String threadId) async {
    final rows = await _localDb.getMessages(threadId);
    if (rows.isEmpty) return;
    // getMessages returns newest-first (DESC).
    // Display uses reverse:true so newest is at the bottom.
    // Keep newest-first so reverse:true display shows oldest-first (correct order).
    final messages = rows.map((r) => ChatMessage.fromJson(r)).toList();
    state = state.copyWith(
      messages: {...state.messages, threadId: messages},
    );
  }

  /// Sort a thread's message list by createdAt ascending (oldest first).
  /// Call this after any bulk load to guarantee chronological display.
  void _sortThreadMessages(String threadId) {
    final msgs = state.messages[threadId];
    if (msgs == null || msgs.length <= 1) return;
    final sorted = List<ChatMessage>.from(msgs)
      ..sort((a, b) => (a.createdAt ?? '').compareTo(b.createdAt ?? ''));
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
    final isAgent = !(senderOwnerId == 'terminal') &&
        (senderOwnerId == '__envoy_ai__' ||
            senderOwnerId.startsWith('envoy_agent_') ||
            (sentBySelf && actorRole == 'agent'));
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
    final terminalId = data['terminalId'] as String?;
    final terminalName = data['terminalName'] as String?;
    final externalAgent = data['agentType'] as String? ?? sender?['agentType'] as String?;
    // deliveryChannel: "agent" + deliverySource: "bridge" = Ext Agent reply.
    // Use this to correctly route bridge Ext Agent replies to the "external"
    // thread even when senderOwnerId starts with "envoy_agent_" (which
    // would otherwise match the EnvoyAI isAgent branch).
    final deliveryChannel = metadata?['deliveryChannel'] as String?;
    final deliverySource = metadata?['deliverySource'] as String?;
    final isBridgeAgent = deliveryChannel == 'agent' && deliverySource == 'bridge';
    final agentType = isBridgeAgent
        ? 'external'
        : (externalAgent == 'external' ? 'external' : 'envoyai');

    // Agent messages: if the recipient is a known contact → contact's thread.
    // If the recipient is the owner (chatting with EnvoyAI) → envoyai thread.
    final agentTalkToContact = isAgent &&
        recipientOwnerId != null &&
        recipientOwnerId.isNotEmpty &&
        recipientOwnerId != selfOwnerId;

    final String threadId;
    if (isTerminal) {
      threadId = '${nodeState.activeNode!.id}:term:${terminalId ?? senderOwnerId}';
    } else if (deliveryChannel == 'ai') {
      // Built-in EnvoyAI assistant reply — goes to EnvoyAI thread regardless
      // of senderOwnerId (which is the owner's own ID for the built-in AI).
      threadId = '${nodeState.activeNode!.id}:envoyai';
    } else if (isBridgeAgent) {
      // Ext Agent reply via bridge — goes to Ext Agent thread.
      threadId = '${nodeState.activeNode!.id}:external';
    } else if (agentTalkToContact) {
      // AI auto-reply for a contact → contact's thread only.
      threadId = '${nodeState.activeNode!.id}:$recipientOwnerId';
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
    final msgSenderDisplay = showAsMine ? 'You' : (senderDisplayName ?? senderOwnerId);

    final attachments = attachmentsRaw
        ?.map((a) => ChatAttachment.fromJson(a as Map<String, dynamic>))
        .toList();
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

    // Update thread.
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: isTerminal
          ? ChatThreadType.terminal
          : isAgent
              ? (agentType == 'external'
                  ? ChatThreadType.externalAgent
                  : ChatThreadType.envoyai)
              : ChatThreadType.direct,
      displayName: isTerminal
          ? 'Terminal: ${terminalName ?? terminalId ?? ''}'
          : agentTalkToContact
              ? (threadDisplayName ?? peerId)
              : isAgent
                  ? (agentType == 'external' ? 'Ext Agent' : 'EnvoyAI')
                  : threadDisplayName ?? peerId,
      contactOwnerId: (isAgent && !agentTalkToContact) ? null : peerId,
      agentType: isAgent ? agentType : null,
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
    // the Social app behaviour).
    if (isAgent && recipientOwnerId != null && recipientOwnerId.isNotEmpty &&
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
      _upsertThread(
        threadId: contactThreadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.direct,
        displayName: senderDisplayName ?? 'EnvoyAI',
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
  Future<void> syncRooms() async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    try {
      final rooms = await nodeService.listChatRooms();
      final nodeId = nodeState.activeNode!.id;
      final remoteRoomIds = rooms.map((room) => room.id).toSet();

      await _localDb.upsertRooms(
        nodeId,
        rooms
            .map((room) => {
                  ...room.toJson(),
                  'id': room.id,
                  'node_id': nodeId,
                  'name': room.name,
                })
            .toList(),
      );

      for (final room in rooms) {
        final threadId = '$nodeId:room:${room.id}';
        _upsertThread(
          threadId: threadId,
          nodeId: nodeId,
          type: ChatThreadType.group,
          displayName: room.name,
          chatRoomId: room.id,
          lastMessageText: room.lastMessageText,
          lastMessageAt: room.lastMessageAt,
        );
      }

      final staleRoomThreads = state.threads.where((thread) {
        if (thread.type != ChatThreadType.group || thread.nodeId != nodeId) {
          return false;
        }
        final roomId = thread.chatRoomId ?? _roomIdFromThreadId(thread.id);
        return roomId == null || !remoteRoomIds.contains(roomId);
      }).toList();

      for (final thread in staleRoomThreads) {
        await deleteThread(thread.id);
      }
    } catch (e) {
      debugPrint('syncRooms failed: $e');
    }
  }

  String? _roomIdFromThreadId(String threadId) {
    final parts = threadId.split(':room:');
    if (parts.length < 2 || parts[1].isEmpty) return null;
    return parts[1];
  }

  /// Handle chat:room-updated push — refresh room list from home.
  Future<void> onRoomUpdated(Map<String, dynamic> data) async {
    await syncRooms();
  }

  /// Handle chat:room-removed push — drop the local thread.
  Future<void> onRoomRemoved(Map<String, dynamic> data) async {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final roomId = data['roomId'] as String?;
    if (roomId == null || roomId.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    await deleteThread(threadId);
  }

  /// Send a message to a group chat room.
  Future<void> sendRoomMessage(String roomId, String text) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final now = DateTime.now().toIso8601String();
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderDisplayName: 'You',
      text: text,
      createdAt: now,
      isOutbound: true,
    );

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

    final existingThread = state.threads
        .where((t) => t.id == threadId)
        .firstOrNull;
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.group,
      displayName: existingThread?.displayName ?? 'Group',
      chatRoomId: roomId,
      lastMessageText: text,
      lastMessageAt: DateTime.now(),
    );

    try {
      await nodeService.sendChatRoomMessage(roomId, text);
    } catch (e) {
      debugPrint('sendRoomMessage failed: $e');
      rethrow;
    }
  }

  /// Handle a chat:room-message push event.
  void onRoomMessage(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    final message = data['message'] as Map<String, dynamic>?;
    final inner = message ?? data;

    var roomId = data['roomId'] as String?;
    if (roomId == null || roomId.isEmpty) {
      final recipient = inner['recipient'] as Map<String, dynamic>?;
      final ownerId = recipient?['ownerId'] as String?;
      if (ownerId != null && ownerId.startsWith('room:')) {
        roomId = ownerId.substring('room:'.length);
      }
    }
    if (roomId == null || roomId.isEmpty) return;
    if (roomId.startsWith('room:')) {
      roomId = roomId.substring('room:'.length);
    }

    _ingestRoomMessage(nodeState, roomId, inner, data['roomName'] as String?);
  }

  void _ingestRoomMessage(
    NodeState nodeState,
    String roomId,
    Map<String, dynamic> inner,
    String? roomName,
  ) {
    final selfOwnerId = nodeState.ownerId;
    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final msg = ChatMessage.fromRpcMap(
      threadId,
      inner,
      selfOwnerId: selfOwnerId,
    );

    if (msg.text == null || msg.text!.isEmpty) return;

    _localDb.insertMessage(msg.toJson());

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.group,
      displayName: roomName ?? 'Group',
      chatRoomId: roomId,
      lastMessageText: msg.text ?? '',
      lastMessageAt: msg.createdAt != null
          ? DateTime.tryParse(msg.createdAt!)
          : DateTime.now(),
      unreadIncrement: !msg.isOutbound,
    );

    final existing = state.messages[threadId] ?? [];
    if (existing.any((m) => m.id == msg.id)) return;
    if (msg.isOutbound &&
        existing.any((m) => m.text == msg.text && m.id.startsWith('temp_'))) {
      final updated = existing.map((m) {
        if (m.text == msg.text && m.id.startsWith('temp_')) return msg;
        return m;
      }).toList();
      state = state.copyWith(
        messages: {...state.messages, threadId: updated},
      );
      return;
    }

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [msg, ...existing],
      },
    );
  }

  /// Create a new chat room on the home node.
  /// Returns the new room id, or null when create could not complete.
  Future<String?> createRoom(
    String name, {
    List<String> memberOwnerIds = const [],
  }) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return null;

    try {
      final result = await nodeService.createChatRoom(
        name,
        memberOwnerIds: memberOwnerIds,
      );
      final roomId = result['roomId'] as String?;
      if (roomId == null || roomId.isEmpty) {
        throw StateError('createChatRoom returned no roomId');
      }

      final nodeId = nodeState.activeNode!.id;
      final title = (result['title'] as String?)?.trim();
      final displayName =
          title != null && title.isNotEmpty ? title : name.trim();
      final threadId = '$nodeId:room:$roomId';

      final room = ChatRoom.fromJson({
        ...result,
        'nodeId': nodeId,
      });
      await _localDb.upsertRooms(nodeId, [
        {
          ...room.toJson(),
          'id': room.id,
          'node_id': nodeId,
          'name': room.name,
        },
      ]);

      await syncRooms();

      _upsertThread(
        threadId: threadId,
        nodeId: nodeId,
        type: ChatThreadType.group,
        displayName: displayName,
        chatRoomId: roomId,
        lastMessageAt: DateTime.now(),
        forceDisplayNameUpdate: true,
      );
      return roomId;
    } catch (e) {
      debugPrint('createRoom failed: $e');
      rethrow;
    }
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
    final now = DateTime.now().toIso8601String();
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

  /// Handle a bridge:status push event.
  void onBridgeStatus(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    final enabled = data['enabled'] as bool? ?? false;
    // Always create the thread — "Bridge Offline" is shown when disabled.

    // Use explicit agentType from BridgeStatus if present.
    // Fall back to name-based heuristic only when the node hasn't yet
    // sent agentType (backward compat with older nodes).
    final explicitType = data['agentType'] as String?;
    final rawName = data['agentName'] as String? ?? '';
    final nameIsExternal = rawName.toLowerCase().contains('claw') ||
        rawName.toLowerCase().contains('open') ||
        rawName.toLowerCase().contains('external');
    final agentType = explicitType ??
        (nameIsExternal ? 'external' : 'envoyai');
    final agentName = rawName.isNotEmpty ? rawName : 'EnvoyAI';
    final threadId = '${nodeState.activeNode!.id}:$agentType';

    // Append bridge status to the display name for external agents.
    final displayName = agentType == 'external'
        ? '$agentName ${enabled ? '(Bridge Online)' : '(Bridge Offline)'}'
        : agentName;

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: agentType == 'external'
          ? ChatThreadType.externalAgent
          : ChatThreadType.envoyai,
      displayName: displayName,
      agentType: agentType,
      forceDisplayNameUpdate: true,
    );
  }

  /// Sync terminal sessions from the home node as threads.
  Future<void> syncTerminals() async {
    final termNotifier = _ref.read(terminalProvider.notifier);
    await termNotifier.loadSessions();

    final termState = _ref.read(terminalProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    final nodeId = nodeState.activeNode!.id;
    final remoteSessionIds =
        termState.sessions.map((session) => session.id).toSet();

    for (final session in termState.sessions) {
      final threadId = '$nodeId:term:${session.id}';
      _upsertThread(
        threadId: threadId,
        nodeId: nodeId,
        type: ChatThreadType.terminal,
        displayName: 'Terminal: ${session.name}',
        lastMessageText:
            '${session.runningProcess ?? 'shell'} — ${session.cwd ?? '~'}',
      );
    }

    final staleTerminalThreads = state.threads.where((thread) {
      if (thread.type != ChatThreadType.terminal || thread.nodeId != nodeId) {
        return false;
      }
      final sessionId = _terminalSessionIdFromThreadId(thread.id);
      return sessionId == null || !remoteSessionIds.contains(sessionId);
    }).toList();

    for (final thread in staleTerminalThreads) {
      await deleteThread(thread.id);
    }
  }

  String? _terminalSessionIdFromThreadId(String threadId) {
    final parts = threadId.split(':term:');
    if (parts.length < 2 || parts[1].isEmpty) return null;
    return parts[1];
  }

  /// Create a new terminal session on the home node.
  /// Returns the new session id, or null when create could not complete.
  Future<String?> createTerminal({
    required String title,
    String? cwd,
  }) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return null;

    try {
      final result = await nodeService.createTerminalSession(
        title: title,
        cwd: cwd,
      );
      final sessionId = result['sessionId'] as String?;
      if (sessionId == null || sessionId.isEmpty) return null;

      await _ref.read(terminalProvider.notifier).loadSessions();
      await syncTerminals();

      final threadId = '${nodeState.activeNode!.id}:term:$sessionId';
      final displayTitle = (result['title'] as String?)?.trim();
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.terminal,
        displayName: 'Terminal: ${displayTitle?.isNotEmpty == true ? displayTitle : title}',
        lastMessageAt: DateTime.now(),
      );
      return sessionId;
    } catch (e) {
      debugPrint('createTerminal failed: $e');
      rethrow;
    }
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
    // For all threads except unknown, keep the existing name once set.
    // This prevents incoming messages from renaming threads.
    // Direct/group threads already preserved raw owner IDs here.
    // Agent threads (envoyai, externalAgent) also preserve — their name
    // is set at creation time and must not change with each message.
    if (existingName != null && existingName.isNotEmpty) {
      if (type == ChatThreadType.direct || type == ChatThreadType.group) {
        if (!existingName.startsWith('envoy:owner:') && existingName != 'Group') {
          return existingName;
        }
      } else {
        // envoyai and externalAgent: name is set at creation, never changes
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
    bool forceDisplayNameUpdate = false,
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
      displayName: forceDisplayNameUpdate
          ? displayName
          : _resolveThreadName(
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
    ]..sort((a, b) {
        final aTime = a.lastMessageAt;
        final bTime = b.lastMessageAt;
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        return bTime.compareTo(aTime);
      });

    state = state.copyWith(threads: threads);
  }
}
