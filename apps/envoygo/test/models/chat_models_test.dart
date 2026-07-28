import 'package:envoygo/models/chat_message.dart';
import 'package:envoygo/models/chat_thread.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChatThread', () {
    test('toJson and fromJson round-trip', () {
      final thread = ChatThread(
        id: 'node1:owner123',
        nodeId: 'node1',
        type: ChatThreadType.direct,
        displayName: 'Alice',
        contactOwnerId: 'owner123',
        lastMessageText: 'Hello!',
        lastMessageAt: DateTime(2026, 6, 9, 10, 30),
        unreadCount: 3,
      );

      final json = thread.toJson();
      final restored = ChatThread.fromJson(json);

      expect(restored.id, thread.id);
      expect(restored.type, thread.type);
      expect(restored.displayName, thread.displayName);
      expect(restored.unreadCount, 3);
    });

    test('ChatThreadType enum has all expected values', () {
      expect(ChatThreadType.values.length, 6);
      expect(ChatThreadType.values, contains(ChatThreadType.direct));
      expect(ChatThreadType.values, contains(ChatThreadType.group));
      expect(ChatThreadType.values, contains(ChatThreadType.envoyai));
      expect(ChatThreadType.values, contains(ChatThreadType.externalAgent));
      expect(ChatThreadType.values, contains(ChatThreadType.pi));
      expect(ChatThreadType.values, contains(ChatThreadType.terminal));
    });
  });

  group('ChatMessage', () {
    test('toJson and fromJson round-trip', () {
      const msg = ChatMessage(
        id: 'msg_123',
        threadId: 'thread_1',
        senderOwnerId: 'owner_abc',
        senderDisplayName: 'Bob',
        text: 'Hi there',
        createdAt: '2026-06-09T10:30:00Z',
        isOutbound: true,
      );

      final json = msg.toJson();
      final restored = ChatMessage.fromJson(json);

      expect(restored.id, msg.id);
      expect(restored.text, 'Hi there');
      expect(restored.isOutbound, isTrue);
    });

    test('default isOutbound is false', () {
      final msg = ChatMessage.fromJson({
        'id': 'msg_1',
        'thread_id': 't1',
      });
      expect(msg.isOutbound, isFalse);
    });
  });
}
