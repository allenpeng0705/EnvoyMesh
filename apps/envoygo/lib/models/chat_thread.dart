/// A chat thread (direct message, group chat, AI chat, or terminal).
class ChatThread {
  /// Composite key: nodeId:contactOwnerId (or nodeId:roomId, etc.)
  final String id;

  /// Which paired node this thread belongs to.
  final String nodeId;

  /// For direct chats: the contact's owner ID.
  final String? contactOwnerId;

  /// For group chats: the chat room ID.
  final String? chatRoomId;

  /// For AI chats: 'envoyai', 'external', or 'pi'.
  final String? agentType;

  /// Thread type discriminator.
  final ChatThreadType type;

  /// Display name for the thread.
  final String displayName;

  /// Last message preview text.
  final String? lastMessageText;

  /// Last message timestamp.
  final DateTime? lastMessageAt;

  /// Unread message count.
  final int unreadCount;

  const ChatThread({
    required this.id,
    required this.nodeId,
    required this.type,
    required this.displayName,
    this.contactOwnerId,
    this.chatRoomId,
    this.agentType,
    this.lastMessageText,
    this.lastMessageAt,
    this.unreadCount = 0,
  });

  factory ChatThread.fromJson(Map<String, dynamic> json) {
    DateTime? lastAt;
    final rawLast = json['last_message_at'];
    if (rawLast is String && rawLast.isNotEmpty) {
      lastAt = DateTime.tryParse(rawLast);
    }
    final typeName = json['type'] as String?;
    final type = ChatThreadType.values.asNameMap()[typeName ?? ''] ??
        ChatThreadType.direct;
    return ChatThread(
      id: json['id'] as String,
      nodeId: json['node_id'] as String,
      type: type,
      displayName: (json['display_name'] as String?) ?? '',
      contactOwnerId: json['contact_owner_id'] as String?,
      chatRoomId: json['chat_room_id'] as String?,
      agentType: json['agent_type'] as String?,
      lastMessageText: json['last_message_text'] as String?,
      lastMessageAt: lastAt,
      unreadCount: (json['unread_count'] as int?) ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'node_id': nodeId,
        'type': type.name,
        'display_name': displayName,
        if (contactOwnerId != null) 'contact_owner_id': contactOwnerId,
        if (chatRoomId != null) 'chat_room_id': chatRoomId,
        if (agentType != null) 'agent_type': agentType,
        if (lastMessageText != null) 'last_message_text': lastMessageText,
        if (lastMessageAt != null)
          'last_message_at': lastMessageAt!.toIso8601String(),
        'unread_count': unreadCount,
      };
}

/// Thread type discriminator.
enum ChatThreadType {
  direct,
  group,
  envoyai,
  externalAgent,
  pi,
  terminal,
}
