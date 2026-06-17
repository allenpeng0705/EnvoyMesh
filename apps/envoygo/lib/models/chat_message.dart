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

  /// File / audio attachments (Phase 37).
  final List<ChatAttachment>? attachments;

  const ChatMessage({
    required this.id,
    required this.threadId,
    this.senderOwnerId,
    this.senderDisplayName,
    this.text,
    this.createdAt,
    this.isOutbound = false,
    this.attachments,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final attList = json['attachments'] as List<dynamic>?;
    return ChatMessage(
      id: json['id'] as String,
      threadId: json['thread_id'] as String,
      senderOwnerId: json['sender_owner_id'] as String?,
      senderDisplayName: json['sender_display_name'] as String?,
      text: json['text'] as String?,
      createdAt: json['created_at'] as String?,
      isOutbound: (json['is_outbound'] as int?) == 1,
      attachments: attList?.map((a) => ChatAttachment.fromJson(a as Map<String, dynamic>)).toList(),
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
        if (attachments != null) 'attachments': attachments!.map((a) => a.toJson()).toList(),
      };
}

/// A file or audio attachment on a chat message (Phase 37).
class ChatAttachment {
  final String id;
  final String filename;
  final String mimeType;
  final int sizeBytes;
  final String sensitivity;
  final String? vaultRelativePath;
  /// Actual recording duration in seconds (Phase 37 mobile).
  final int? durationSec;

  const ChatAttachment({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.sizeBytes,
    required this.sensitivity,
    this.vaultRelativePath,
    this.durationSec,
  });

  /// Whether this attachment is an audio file.
  bool get isAudio => mimeType.startsWith('audio/');

  factory ChatAttachment.fromJson(Map<String, dynamic> json) {
    return ChatAttachment(
      id: json['id'] as String,
      filename: json['filename'] as String,
      mimeType: json['mimeType'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      sensitivity: json['sensitivity'] as String,
      vaultRelativePath: json['vaultRelativePath'] as String?,
      durationSec: json['durationSec'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'filename': filename,
        'mimeType': mimeType,
        'sizeBytes': sizeBytes,
        'sensitivity': sensitivity,
        if (vaultRelativePath != null) 'vaultRelativePath': vaultRelativePath,
        if (durationSec != null) 'durationSec': durationSec,
      };
}
