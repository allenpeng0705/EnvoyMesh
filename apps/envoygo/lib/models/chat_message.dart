import 'dart:convert';

import '../utils/group_delivery.dart';

/// Whether a chat row is outbound for the current session.
///
/// Mirrors Social `messageIsOutgoing`: family DM/room threads use profile ids
/// (`owner` / `mom`), while mesh/AI threads use the mesh `envoy:owner:…` id.
bool messageIsOutgoing({
  required String? senderOwnerId,
  String? recipientOwnerId,
  String? selfOwnerId,
  String? selfFamilyProfileId,
}) {
  final snd = senderOwnerId?.trim();
  if (snd == null || snd.isEmpty) return false;
  final rcv = recipientOwnerId?.trim();
  final familySelf =
      (selfFamilyProfileId?.trim().isNotEmpty == true
          ? selfFamilyProfileId!.trim()
          : 'owner');

  if (rcv != null && rcv.startsWith('family:')) {
    return snd == familySelf;
  }
  if (rcv != null && rcv.startsWith('room:')) {
    // Family rooms attribute senders by profile id; mesh rooms by mesh owner.
    if (familySelf != 'owner') {
      return snd == familySelf;
    }
    final selfO = selfOwnerId?.trim();
    return selfO != null && snd == selfO;
  }

  final selfO = selfOwnerId?.trim();
  if (selfO != null && snd == selfO) return true;
  if (familySelf != 'owner' && snd == familySelf) return true;
  return false;
}

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

  /// Delivery state for outbound mesh / group messages.
  final GroupDeliveryMetadata? delivery;

  /// File / audio attachments (Phase 37).
  final List<ChatAttachment>? attachments;

  /// Phase 63B — listing-scoped inquire (Envoy Market).
  final String? listingId;

  const ChatMessage({
    required this.id,
    required this.threadId,
    this.senderOwnerId,
    this.senderDisplayName,
    this.text,
    this.createdAt,
    this.isOutbound = false,
    this.delivery,
    this.attachments,
    this.listingId,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    dynamic attRaw = json['attachments'];
    if (attRaw is String && attRaw.trim().isNotEmpty) {
      try {
        attRaw = jsonDecode(attRaw);
      } catch (_) {
        attRaw = null;
      }
    }
    final attList = attRaw as List<dynamic>?;
    List<ChatAttachment>? attachments;
    if (attList != null) {
      try {
        attachments = attList
            .map((a) => ChatAttachment.fromJson(a as Map<String, dynamic>))
            .toList();
      } catch (_) {
        attachments = null;
      }
    }
    return ChatMessage(
      id: (json['id'] ?? json['messageId'] ?? '') as String,
      threadId: (json['thread_id'] ?? json['threadId'] ?? '') as String,
      senderOwnerId: json['sender_owner_id'] as String?,
      senderDisplayName: json['sender_display_name'] as String?,
      text: json['text'] as String?,
      createdAt: json['created_at'] as String?,
      isOutbound: (json['is_outbound'] as int?) == 1,
      delivery: _parseDeliveryJson(json['delivery']),
      attachments: attachments,
      listingId: json['listing_id'] as String? ?? json['listingId'] as String?,
    );
  }

  static GroupDeliveryMetadata? _parseDeliveryJson(dynamic raw) {
    if (raw == null) return null;
    if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          return parseDeliveryMetadata(decoded);
        }
      } catch (_) {
        return null;
      }
    }
    if (raw is Map<String, dynamic>) {
      return parseDeliveryMetadata(raw);
    }
    return null;
  }

  /// Parse a ChatMessage RPC / push payload (nested sender/content/metadata).
  factory ChatMessage.fromRpcJson(
    Map<String, dynamic> json, {
    required String threadId,
    String? selfOwnerId,
    String? selfFamilyProfileId,
  }) {
    final sender = json['sender'] as Map<String, dynamic>?;
    final content = json['content'] as Map<String, dynamic>?;
    final metadata = json['metadata'] as Map<String, dynamic>?;
    final recipient = json['recipient'] as Map<String, dynamic>?;
    final senderOwnerId =
        (json['senderOwnerId'] ?? sender?['ownerId']) as String?;
    final recipientOwnerId =
        (json['recipientOwnerId'] ?? recipient?['ownerId']) as String?;
    final text = (json['text'] ?? content?['text']) as String?;
    final createdAt =
        (json['createdAt'] ?? metadata?['timestamp']) as String?;
    final messageId = (json['messageId'] ?? json['id']) as String?;
    final attRaw = content?['attachments'] as List<dynamic>?;
    final isOutbound = messageIsOutgoing(
      senderOwnerId: senderOwnerId,
      recipientOwnerId: recipientOwnerId,
      selfOwnerId: selfOwnerId,
      selfFamilyProfileId: selfFamilyProfileId,
    );
    final rawName =
        (json['senderDisplayName'] ?? sender?['displayName']) as String?;
    return ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: isOutbound ? 'You' : rawName,
      text: text,
      createdAt: createdAt,
      isOutbound: isOutbound,
      delivery: parseDeliveryMetadata(metadata),
      attachments: attRaw
          ?.map((a) => ChatAttachment.fromJson(a as Map<String, dynamic>))
          .toList(),
      listingId: content?['listingId'] as String?,
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
        if (delivery != null)
          'delivery': jsonEncode(deliveryMetadataToJson(delivery!)),
        if (attachments != null) 'attachments': attachments!.map((a) => a.toJson()).toList(),
        if (listingId != null) 'listing_id': listingId,
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

  /// v0.3 family-media content hash (e.g. `sha256:…`), present when the
  /// bytes live in the home node's `family-media` area instead of the vault.
  /// Mesh vault attachments leave this null.
  final String? contentHash;

  const ChatAttachment({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.sizeBytes,
    required this.sensitivity,
    this.vaultRelativePath,
    this.durationSec,
    this.contentHash,
  });

  /// Whether this attachment is an audio file.
  bool get isAudio => mimeType.startsWith('audio/');

  /// Whether this attachment is an image file.
  bool get isImage => mimeType.startsWith('image/');

  /// Whether the attachment is stored on the home node's family-media area
  /// (v0.3 §3.4) — i.e. NOT vault-backed — and must be fetched by id via
  /// `readFamilyAttachment` rather than `readLibraryItemContent`.
  ///
  /// Family descriptors never carry `vaultRelativePath` and always carry a
  /// `contentHash` (upload response + message/event descriptors). Mesh vault
  /// rows carry a vault path, so a missing path alone is not sufficient.
  bool get isFamilyStored =>
      (vaultRelativePath == null || vaultRelativePath!.isEmpty) &&
      (contentHash != null && contentHash!.isNotEmpty);

  factory ChatAttachment.fromJson(Map<String, dynamic> json) {
    return ChatAttachment(
      id: (json['id'] as String?) ?? '',
      filename: (json['filename'] as String?) ?? '',
      mimeType: (json['mimeType'] as String?) ?? 'application/octet-stream',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      sensitivity: (json['sensitivity'] as String?) ?? 'friends',
      vaultRelativePath: json['vaultRelativePath'] as String?,
      durationSec: json['durationSec'] as int?,
      contentHash: json['contentHash'] as String?,
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
        if (contentHash != null) 'contentHash': contentHash,
      };
}
