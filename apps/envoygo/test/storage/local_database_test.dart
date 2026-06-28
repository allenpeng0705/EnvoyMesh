import 'package:envoygo/models/chat_message.dart';
import 'package:envoygo/storage/local_database.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('LocalDatabase message rows', () {
    test('serializeMessageRow stores attachments as JSON text', () {
      final db = LocalDatabase.test();
      final row = db.serializeMessageRow({
        'id': 'msg-1',
        'thread_id': 'node:contact',
        'text': ChatMessage.audioPlaceholderText,
        'is_outbound': 1,
        'attachments': [
          {
            'id': 'att-1',
            'filename': 'voice.m4a',
            'mimeType': 'audio/mp4',
            'sizeBytes': 100,
            'sensitivity': 'friends',
          },
        ],
      });
      expect(row.containsKey('attachments'), isTrue);
      expect(row['attachments'], isA<String>());
      expect(row.containsKey('thread_id'), isTrue);

      final restored = db.deserializeMessageRow(row);
      expect(restored['attachments'], isA<List>());
      expect((restored['attachments'] as List).length, 1);
    });
  });

  group('LocalDatabase', () {
    test('should initialize and create tables', () {
      // TODO(31B): Implement tests
    });

    test('should upsert and retrieve nodes', () {
      // TODO(31C): Implement tests
    });

    test('should cache and retrieve contacts', () {
      // TODO(31D): Implement tests
    });

    test('should store and query messages', () {
      // TODO(31D): Implement tests
    });
  });
}
