import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/chat_message.dart';
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

class ChatNotifier extends StateNotifier<ChatState> {
  final Ref _ref;
  final LocalDatabase _localDb = LocalDatabase();
  final _seenMessageIds = <String>{};

  ChatNotifier(this._ref) : super(const ChatState());

  /// Load cached threads from local storage.
  Future<void> loadThreads(String nodeId) async {
    final rows = await _localDb.getThreads(nodeId);
    final threads =
        rows.map((r) => ChatThread.fromJson(r)).toList();
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

  /// Send a direct message.
  Future<void> sendMessage(String targetOwnerId, String text) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Optimistic insert.
    final now = DateTime.now().toIso8601String();
    final threadId = '${nodeState.activeNode!.id}:$targetOwnerId';
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: now,
      isOutbound: true,
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
      await nodeService.sendChat(targetOwnerId, text);
      // TODO(31D): Reconcile temp message with server response.
    } catch (e) {
      // Mark message as failed?
    }
  }

  /// Load chat history for a thread.
  Future<void> loadHistory(String threadId,
      {String? contactOwnerId}) async {
    if (contactOwnerId == null) return;

    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    final oldestCached = state.messages[threadId]?.lastOrNull;
    final messages = await nodeService.listChatHistory(
      contactOwnerId,
      before: oldestCached?.createdAt,
    );

    // Cache in local DB.
    for (final msg in messages) {
      await _localDb.insertMessage(msg.toJson());
    }

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          ...?state.messages[threadId],
          ...messages,
        ],
      },
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

    if (senderOwnerId == null) return;

    // Dedup: skip if we've already seen this messageId (dual delivery).
    final msgId = messageId ?? '';
    if (msgId.isNotEmpty && _seenMessageIds.contains(msgId)) return;
    if (msgId.isNotEmpty) {
      _seenMessageIds.add(msgId);
      // Cap at 200 to avoid unbounded growth.
      if (_seenMessageIds.length > 200) {
        _seenMessageIds
            .removeAll(_seenMessageIds.take(_seenMessageIds.length - 200));
      }
    }

    // Route terminal messages to terminal threads.
    final isTerminal = senderOwnerId == 'terminal';
    final terminalId = data['terminalId'] as String?;
    final terminalName = data['terminalName'] as String?;

    // Route agent responses to the appropriate agent thread.
    // ENVOY_AI_THREAD_KEY is "__envoy_ai__" — the home node uses this as
    // the sender ownerId for EnvoyAI responses.
    // Also check actorRole: only route to agent thread if the sender is
    // actually an agent. Home-node outbound messages have sender.ownerId
    // == self.ownerId but actorRole is "human", not "agent".
    final selfOwnerId = nodeState.ownerId;
    final actorRole = sender?['actorRole'] as String?;
    final externalAgent = data['agentType'] as String? ?? sender?['agentType'] as String?;
    final isAgent = !isTerminal &&
        (senderOwnerId == '__envoy_ai__' ||
            senderOwnerId.startsWith('envoy_agent_') ||
            (selfOwnerId != null && senderOwnerId == selfOwnerId && actorRole == 'agent'));
    // Route external agent (HomeClaw) to its own thread, not EnvoyAI.
    final agentType = externalAgent == 'external' ? 'external' : 'envoyai';
    final threadId = isTerminal
        ? '${nodeState.activeNode!.id}:term:${terminalId ?? senderOwnerId}'
        : isAgent
            ? '${nodeState.activeNode!.id}:$agentType'
            : '${nodeState.activeNode!.id}:$senderOwnerId';

    // Look up the contact's display name for non-agent messages.
    var displayName = data['senderDisplayName'] as String?;
    if (!isAgent && !isTerminal &&
        (displayName == null || displayName!.isEmpty)) {
      final contactNotifier = _ref.read(contactProvider.notifier);
      final contact = contactNotifier.getContact(senderOwnerId);
      displayName = contact?.displayName;
      // Fall back to local DB cache if not in memory yet.
      if ((displayName == null || displayName!.isEmpty) && senderOwnerId.isNotEmpty) {
        // Try looking up from the contact's own state (bonds list).
        final contacts = _ref.read(contactProvider).bonds;
        displayName = contacts
            .where((c) => c.ownerId == senderOwnerId)
            .firstOrNull
            ?.displayName;
      }
    }
    // Never use the raw owner ID as display name.
    if (displayName == null || displayName!.isEmpty || displayName!.startsWith('envoy:owner:')) {
      // Still unknown — keep the raw ID but the UI will try to resolve later.
      displayName = displayName ?? senderOwnerId;
    }
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: displayName,
      text: text,
      createdAt: createdAt,
      isOutbound: false,
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
              ? ChatThreadType.envoyai
              : ChatThreadType.direct,
      displayName: isTerminal
          ? 'Terminal: ${terminalName ?? terminalId ?? ''}'
          : isAgent
              ? 'EnvoyAI'
              : (displayName ?? senderOwnerId),
      contactOwnerId: isAgent ? null : senderOwnerId,
      agentType: isAgent ? agentType : null,
      lastMessageText: text ?? '',
      lastMessageAt: createdAt != null
          ? DateTime.tryParse(createdAt)
          : DateTime.now(),
      unreadIncrement: true,
    );

    // Dedup: if a temp optimistic message with the same text exists,
    // replace it with the server version instead of adding a duplicate.
    final existingMessages = state.messages[threadId] ?? [];
    final optimisticIdx =
        existingMessages.indexWhere((m) => m.text == text && m.id.startsWith('temp_'));
    if (optimisticIdx >= 0) {
      // Replace the optimistic message with the server version.
      final updated = List<ChatMessage>.from(existingMessages);
      updated[optimisticIdx] = msg;
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
  }

  // -- Room operations --

  /// Sync chat rooms from the home node.
  Future<void> syncRooms() async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    try {
      final rooms = await nodeService.listChatRooms();
      await _localDb.upsertRooms(
        nodeState.activeNode!.id,
        rooms.map((r) => r.toJson()).toList(),
      );

      // Create threads for rooms.
      for (final room in rooms) {
        final threadId = '${nodeState.activeNode!.id}:room:${room.id}';
        _upsertThread(
          threadId: threadId,
          nodeId: nodeState.activeNode!.id,
          type: ChatThreadType.group,
          displayName: room.name,
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
    final now = DateTime.now().toIso8601String();
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

    final roomId = data['roomId'] as String?;
    final senderOwnerId = data['senderOwnerId'] as String?;
    final text = data['text'] as String?;
    final messageId = data['messageId'] as String?;
    final createdAt = data['createdAt'] as String?;
    final roomName = data['roomName'] as String?;

    if (roomId == null) return;

    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: data['senderDisplayName'] as String?,
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

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          ...?state.messages[threadId],
          msg,
        ],
      },
    );
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

  /// Send a message to the built-in EnvoyAI agent.
  Future<void> sendAgentMessage(String text) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final threadId = '${nodeState.activeNode!.id}:envoyai';
    final now = DateTime.now().toIso8601String();
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
      type: ChatThreadType.envoyai,
      displayName: 'EnvoyAI',
      agentType: 'envoyai',
      lastMessageText: text,
      lastMessageAt: DateTime.now(),
    );

    await nodeService.sendToOpenClaw(text);
  }

  /// Handle a bridge:status push event.
  void onBridgeStatus(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    final enabled = data['enabled'] as bool? ?? false;
    // Always create the thread — "Bridge Offline" is shown when disabled.

    // Detect external agent from the name. The BridgeStatus type has no
    // agentType field, so we infer it from the agentName.
    final rawName = data['agentName'] as String? ?? '';
    final isExternal = rawName.toLowerCase().contains('claw') ||
        rawName.toLowerCase().contains('open') ||
        rawName.toLowerCase().contains('external');
    final agentType = data['agentType'] as String? ??
        (isExternal ? 'external' : 'envoyai');
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
    );
  }

  /// Handle an agent response push event.
  void onAgentMessage(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    final agentType = data['agentType'] as String? ?? 'envoyai';
    final text = data['text'] as String?;
    final messageId = data['messageId'] as String?;
    final createdAt = data['createdAt'] as String?;

    final threadId = '${nodeState.activeNode!.id}:$agentType';
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: createdAt,
      isOutbound: false,
    );

    _localDb.insertMessage(msg.toJson());

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: agentType == 'external'
          ? ChatThreadType.externalAgent
          : ChatThreadType.envoyai,
      displayName: data['agentName'] as String? ?? 'Agent',
      agentType: agentType,
      lastMessageText: text ?? '',
      lastMessageAt: createdAt != null
          ? DateTime.tryParse(createdAt)
          : DateTime.now(),
      unreadIncrement: true,
    );

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          ...?state.messages[threadId],
          msg,
        ],
      },
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
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.terminal,
        displayName: 'Terminal: ${session.name}',
        lastMessageText:
            '${session.runningProcess ?? 'shell'} — ${session.cwd ?? '~'}',
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

  /// Select a tab.
  void selectTab(int index) {
    state = state.copyWith(selectedTab: index);
  }

  /// Create chat threads for all bonded contacts that don't have one yet.
  /// Called after bonds sync so all contacts appear in the Chats tab.
  void createContactThreads() {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final contacts = _ref.read(contactProvider).bonds;
    final existingThreadIds = state.threads
        .where((t) => t.type == ChatThreadType.direct)
        .map((t) => t.contactOwnerId)
        .toSet();

    for (final contact in contacts) {
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
    }).toList();

    if (changed) {
      state = state.copyWith(threads: updated);
    }
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
    final existing = state.threads
        .where((t) => t.id == threadId)
        .firstOrNull;

    final newThread = ChatThread(
      id: threadId,
      nodeId: nodeId,
      type: type,
      displayName: displayName.isNotEmpty
          ? displayName
          : (existing?.displayName ?? ''),
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
