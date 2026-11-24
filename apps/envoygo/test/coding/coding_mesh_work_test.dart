import 'package:envoygo/coding/coding_mesh_work.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CodingMeshWorkItem (FH-P2-C)', () {
    test('fromJson trims fields and applies defaults', () {
      final item = CodingMeshWorkItem.fromJson({
        'id': '  mw1 ',
        'prompt': ' fix ',
        'cwd': ' /tmp/p ',
        'source': 'bond',
        'status': ' pending ',
        'chatId': ' chat-1 ',
        'title': ' Lint ',
      });
      expect(item.id, 'mw1');
      expect(item.prompt, 'fix');
      expect(item.cwd, '/tmp/p');
      expect(item.source, 'bond');
      expect(item.status, 'pending');
      expect(item.chatId, 'chat-1');
      expect(item.title, 'Lint');
    });

    test('fromJson defaults source to owner and status to pending', () {
      final item = CodingMeshWorkItem.fromJson({
        'id': 'mw2',
        'prompt': 'hi',
        'cwd': '/p',
      });
      expect(item.source, 'owner');
      expect(item.status, 'pending');
      expect(item.chatId, isNull);
    });
  });
}