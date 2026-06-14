/// A chat message.
class ChatMessage {
  /// Message ID from the server.
  final String id;

  /// Alias for [id] — used by callers that expect the RPC field name.
  String get messageId => id;

  /// Thread this message belongs to.
  final String threadId;

  /// Sender's owner ID.
  final String? senderOwnerId;

  /// Sender's display name.
  final String? senderDisplayName;

  /// Message text content.
  final String? text;

  /// ISO 8601 timestamp.
  final String? createdAt;

  /// Whether this message was sent by the local user.
  final bool isOutbound;

  const ChatMessage({
    required this.id,
    required this.threadId,
    this.senderOwnerId,
    this.senderDisplayName,
    this.text,
    this.createdAt,
    this.isOutbound = false,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String,
      threadId: json['thread_id'] as String,
      senderOwnerId: json['sender_owner_id'] as String?,
      senderDisplayName: json['sender_display_name'] as String?,
      text: json['text'] as String?,
      createdAt: json['created_at'] as String?,
      isOutbound: (json['is_outbound'] as int?) == 1,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'thread_id': threadId,
        if (senderOwnerId != null) 'sender_owner_id': senderOwnerId,
        if (senderDisplayName != null) 'sender_display_name': senderDisplayName,
        if (text != null) 'text': text,
        if (createdAt != null) 'created_at': createdAt,
        'is_outbound': isOutbound ? 1 : 0,
      };
}
