import 'package:envoygo/models/chat_message.dart';
import 'package:envoygo/models/family_attachment.dart';
import 'package:flutter_test/flutter_test.dart';

/// v0.3 family-media descriptor round-trip + family-stored heuristic tests.
///
/// A family descriptor `{id, filename, mimeType, sizeBytes, contentHash}` has
/// no `vaultRelativePath` and always carries `contentHash` (upload response +
/// message/event/history rows — server-side emission guaranteed by EM-F1).
void main() {
  group('ChatAttachment contentHash round-trip', () {
    test('family descriptor with contentHash survives toJson/fromJson', () {
      const att = ChatAttachment(
        id: 'att_123',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        sensitivity: 'private',
        contentHash: 'abc123def456',
      );
      final json = att.toJson();
      expect(json['contentHash'], 'abc123def456');
      expect(json.containsKey('vaultRelativePath'), isFalse);

      final restored = ChatAttachment.fromJson(json);
      expect(restored.id, 'att_123');
      expect(restored.contentHash, 'abc123def456');
      expect(restored.vaultRelativePath, isNull);
      expect(restored.isFamilyStored, isTrue);
    });

    test('contentHash is omitted from JSON when absent (mesh vault rows)', () {
      const att = ChatAttachment(
        id: 'att_1',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sensitivity: 'friends',
        vaultRelativePath: 'library/notes.txt',
      );
      final json = att.toJson();
      expect(json.containsKey('contentHash'), isFalse);
      expect(json['vaultRelativePath'], 'library/notes.txt');

      final restored = ChatAttachment.fromJson(json);
      expect(restored.contentHash, isNull);
      expect(restored.isFamilyStored, isFalse);
    });

    test('fromJson reads contentHash from a raw RPC/message row', () {
      final att = ChatAttachment.fromJson({
        'id': 'att_9',
        'filename': 'voice.wav',
        'mimeType': 'audio/wav',
        'sizeBytes': 44000,
        'sensitivity': 'private',
        'contentHash': 'deadbeef',
      });
      expect(att.contentHash, 'deadbeef');
      expect(att.isFamilyStored, isTrue);
    });
  });

  group('ChatAttachment.isFamilyStored heuristic', () {
    test('no vault path + contentHash present → family-stored', () {
      const att = ChatAttachment(
        id: 'a1',
        filename: 'f.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        sensitivity: 'private',
        contentHash: 'hash1',
      );
      expect(att.isFamilyStored, isTrue);
    });

    test('vault path present → not family-stored even with contentHash', () {
      const att = ChatAttachment(
        id: 'a2',
        filename: 'f.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        sensitivity: 'friends',
        vaultRelativePath: 'library/f.png',
        contentHash: 'hash1',
      );
      expect(att.isFamilyStored, isFalse);
    });

    test('mesh vault row (vault path, no contentHash) → not family-stored', () {
      const att = ChatAttachment(
        id: 'a3',
        filename: 'f.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        sensitivity: 'friends',
        vaultRelativePath: 'library/f.png',
      );
      expect(att.isFamilyStored, isFalse);
    });

    test('no vault path but no contentHash → conservative false (legacy row)', () {
      // Pre-EM-F1 rows (or truncated descriptors) cannot be proven to live in
      // family-media — treat as vault-ish/unknown rather than guessing.
      const att = ChatAttachment(
        id: 'a4',
        filename: 'f.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        sensitivity: 'friends',
      );
      expect(att.isFamilyStored, isFalse);
    });
  });

  group('familyAttachmentDescriptorFromUpload', () {
    test('normalizes an upload response into a send descriptor', () {
      final descriptor = familyAttachmentDescriptorFromUpload({
        'id': 'att_up_1',
        'filename': 'pic.jpg',
        'mimeType': 'image/jpeg',
        'sizeBytes': 1234,
        'contentHash': 'sha256hex',
        'scopeKey': 'dm:family:a:b', // incidental key — stripped
      });
      expect(descriptor, {
        'id': 'att_up_1',
        'filename': 'pic.jpg',
        'mimeType': 'image/jpeg',
        'sizeBytes': 1234,
        'contentHash': 'sha256hex',
      });
    });

    test('drops absent contentHash from the descriptor', () {
      final descriptor = familyAttachmentDescriptorFromUpload({
        'id': 'att_up_2',
        'filename': 'no-hash.bin',
        'sizeBytes': 5,
      });
      expect(descriptor.containsKey('contentHash'), isFalse);
    });

    test('rejects upload results without a non-empty id', () {
      expect(
        () => familyAttachmentDescriptorFromUpload({'filename': 'x'}),
        throwsArgumentError,
      );
    });
  });

  group('FamilyAttachmentScope', () {
    test('dm and room scopes serialize to the exact wire shapes', () {
      expect(
        FamilyAttachmentScope.dm('mom').toJson(),
        {'dm': {'toProfileId': 'mom'}},
      );
      expect(
        FamilyAttachmentScope.room('room_7').toJson(),
        {'room': {'roomId': 'room_7'}},
      );
    });

    test('validate rejects neither/both scope endpoints', () {
      expect(() => FamilyAttachmentScope.dm(' '), throwsArgumentError);
      expect(() => FamilyAttachmentScope.room(''), throwsArgumentError);
    });
  });
}
