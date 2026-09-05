/// Phase 51C family-media payload models (thin-client-protocol v0.3 §3).
///
/// Family image/file sharing reuses `ChatMessage.attachments` on the wire;
/// the bytes live in the home node's `family-media` profile area — never the
/// owner vault — and are referenced by a metadata descriptor:
/// `{id, filename, mimeType, sizeBytes, contentHash?}`.
///
/// This file holds the request-side scope model (`uploadFamilyAttachment`) and
/// small pure helpers shared by the client wrappers and the tests. Model
/// helpers here must stay free of any Flutter / socket dependency.

library family_attachment;

/// Scope of a family-media upload (§3.2): a DM pair or a family room.
///
/// Wire shape is exactly one of:
///   `{"dm":   {"toProfileId": "…"}}`
///   `{"room": {"roomId": "…"}}`
class FamilyAttachmentScope {
  /// Peer profile id for a DM upload (`{"dm": {"toProfileId": …}}`).
  final String? toProfileId;

  /// Family room id for a room upload (`{"room": {"roomId": …}}`).
  final String? roomId;

  const FamilyAttachmentScope._({this.toProfileId, this.roomId});

  /// DM-pair scope (owner↔profile or profile↔profile).
  factory FamilyAttachmentScope.dm(String toProfileId) {
    if (toProfileId.trim().isEmpty) {
      throw ArgumentError.value(
        toProfileId,
        'toProfileId',
        'FamilyAttachmentScope.dm requires a non-empty profile id',
      );
    }
    return FamilyAttachmentScope._(toProfileId: toProfileId.trim());
  }

  /// Family-room scope.
  factory FamilyAttachmentScope.room(String roomId) {
    if (roomId.trim().isEmpty) {
      throw ArgumentError.value(
        roomId,
        'roomId',
        'FamilyAttachmentScope.room requires a non-empty room id',
      );
    }
    return FamilyAttachmentScope._(roomId: roomId.trim());
  }

  bool get isDm => roomId == null;

  /// Validate the one-of invariant; throws [ArgumentError] otherwise.
  void validate() {
    final hasDm = toProfileId != null && toProfileId!.isNotEmpty;
    final hasRoom = roomId != null && roomId!.isNotEmpty;
    if (hasDm == hasRoom) {
      throw ArgumentError(
        'FamilyAttachmentScope requires exactly one of toProfileId (DM) '
        'or roomId (room); got dm=$hasDm room=$hasRoom',
      );
    }
  }

  /// Wire params map: `{"dm": {"toProfileId": …}}` or
  /// `{"room": {"roomId": …}}`.
  Map<String, dynamic> toJson() {
    validate();
    if (isDm) {
      return {
        'dm': {'toProfileId': toProfileId},
      };
    }
    return {
      'room': {'roomId': roomId},
    };
  }

  /// Human-readable scope for logs / errors (`dm:<profile>` / `room:<id>`).
  String get debugLabel =>
      isDm ? 'dm:${toProfileId ?? ''}' : 'room:${roomId ?? ''}';

  @override
  bool operator ==(Object other) =>
      other is FamilyAttachmentScope &&
      other.toProfileId == toProfileId &&
      other.roomId == roomId;

  @override
  int get hashCode => Object.hash(toProfileId, roomId);

  @override
  String toString() => 'FamilyAttachmentScope($debugLabel)';
}

/// Normalize an `uploadFamilyAttachment` result into the metadata descriptor
/// referenced by `sendFamilyMessage` / `sendFamilyRoomMessage` (§3.1).
///
/// The upload response already carries `{id, filename, mimeType, sizeBytes,
/// contentHash}`; this strips any incidental keys and drops an absent
/// `contentHash` (it is optional on the send descriptor).
Map<String, dynamic> familyAttachmentDescriptorFromUpload(
  Map<String, dynamic> upload,
) {
  final id = upload['id']?.toString();
  final filename = upload['filename']?.toString();
  if (id == null || id.trim().isEmpty) {
    throw ArgumentError.value(
      upload,
      'upload',
      'uploadFamilyAttachment result is missing a non-empty "id"',
    );
  }
  if (filename == null || filename.trim().isEmpty) {
    throw ArgumentError.value(
      upload,
      'upload',
      'uploadFamilyAttachment result is missing a non-empty "filename"',
    );
  }
  final contentHash = upload['contentHash']?.toString();
  return {
    'id': id,
    'filename': filename,
    'mimeType': (upload['mimeType']?.toString()) ??
        'application/octet-stream',
    'sizeBytes': (upload['sizeBytes'] as num?)?.toInt() ?? 0,
    if (contentHash != null && contentHash.isNotEmpty)
      'contentHash': contentHash,
  };
}

/// True when [descriptor] is a well-formed family attachment metadata
/// descriptor (id + filename; bytes already uploaded via §3.2).
bool isValidFamilyAttachmentDescriptor(Map<String, dynamic> descriptor) {
  final id = descriptor['id']?.toString().trim() ?? '';
  final filename = descriptor['filename']?.toString().trim() ?? '';
  return id.isNotEmpty && filename.isNotEmpty;
}
