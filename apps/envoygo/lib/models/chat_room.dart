/// A group chat room synced from the home node.
class ChatRoom {
  /// Room ID from the server.
  final String id;

  /// Which paired node this room belongs to.
  final String nodeId;

  /// Room display name.
  final String name;

  /// Number of members.
  final int memberCount;

  /// Last message preview text.
  final String? lastMessageText;

  /// Last message timestamp.
  final DateTime? lastMessageAt;

  const ChatRoom({
    required this.id,
    required this.nodeId,
    required this.name,
    this.memberCount = 0,
    this.lastMessageText,
    this.lastMessageAt,
  });

  factory ChatRoom.fromJson(Map<String, dynamic> json) {
    // Home node uses roomId/title. Local DB uses id/name. Accept both.
    return ChatRoom(
      id: (json['roomId'] ?? json['id'] ?? '') as String,
      nodeId: (json['nodeId'] ?? json['node_id'] ?? '') as String,
      name: (json['title'] ?? json['name'] ?? '') as String,
      memberCount: (json['memberCount'] ?? json['member_count'] as int?) ?? 0,
      lastMessageText: (json['lastMessageText'] ?? json['last_message_text']) as String?,
      lastMessageAt: (json['lastMessageAt'] ?? json['last_message_at']) != null
          ? DateTime.parse((json['lastMessageAt'] ?? json['last_message_at']) as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'node_id': nodeId,
        'name': name,
        'member_count': memberCount,
        if (lastMessageText != null) 'last_message_text': lastMessageText,
        if (lastMessageAt != null)
          'last_message_at': lastMessageAt!.toIso8601String(),
      };
}
