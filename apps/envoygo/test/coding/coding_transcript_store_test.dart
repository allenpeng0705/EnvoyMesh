import 'package:envoygo/coding/coding_transcript_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('coding_transcript_store', () {
    test('save / load / clear round-trip', () async {
      await saveCodingTranscript(
        kind: 'pi',
        id: 'sess-1',
        messages: const [
          CodingTranscriptMessage(
            id: 'u1',
            role: 'user',
            text: 'hello',
            createdAt: '2026-01-01T00:00:00.000Z',
          ),
          CodingTranscriptMessage(
            id: 'a1',
            role: 'assistant',
            text: 'hi',
          ),
        ],
      );
      final loaded = await loadCodingTranscript(kind: 'pi', id: 'sess-1');
      expect(loaded, hasLength(2));
      expect(loaded.first.text, 'hello');
      expect(loaded.last.role, 'assistant');

      await clearCodingTranscript(kind: 'pi', id: 'sess-1');
      expect(await loadCodingTranscript(kind: 'pi', id: 'sess-1'), isEmpty);
    });

    test('codingMessagesFromTimelineItems skips streaming and non-messages', () {
      final out = codingMessagesFromTimelineItems([
        {'type': 'activity', 'id': 'x', 'text': 'working'},
        {
          'type': 'message',
          'id': 'm1',
          'role': 'user',
          'text': 'hi',
          'streaming': true,
        },
        {
          'type': 'message',
          'id': 'm2',
          'role': 'assistant',
          'text': 'done',
        },
        {'type': 'message', 'id': '', 'role': 'user', 'text': 'no-id'},
      ]);
      expect(out, hasLength(1));
      expect(out.single.id, 'm2');
      expect(out.single.text, 'done');
    });

    test('isolates keys by kind and id', () async {
      await saveCodingTranscript(
        kind: 'ext',
        id: 'a',
        messages: const [
          CodingTranscriptMessage(id: '1', role: 'user', text: 'a'),
        ],
      );
      await saveCodingTranscript(
        kind: 'ext',
        id: 'b',
        messages: const [
          CodingTranscriptMessage(id: '2', role: 'user', text: 'b'),
        ],
      );
      expect(
        (await loadCodingTranscript(kind: 'ext', id: 'a')).single.text,
        'a',
      );
      expect(
        (await loadCodingTranscript(kind: 'ext', id: 'b')).single.text,
        'b',
      );
    });
  });
}
