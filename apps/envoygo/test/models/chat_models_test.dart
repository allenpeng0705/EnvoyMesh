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
      expect(ChatThreadType.values.length, 9);
      expect(ChatThreadType.values, contains(ChatThreadType.direct));
      expect(ChatThreadType.values, contains(ChatThreadType.group));
      expect(ChatThreadType.values, contains(ChatThreadType.envoyai));
      expect(ChatThreadType.values, contains(ChatThreadType.externalAgent));
      expect(ChatThreadType.values, contains(ChatThreadType.aiBot));
      expect(ChatThreadType.values, contains(ChatThreadType.pi));
      expect(ChatThreadType.values, contains(ChatThreadType.terminal));
      expect(ChatThreadType.values, contains(ChatThreadType.family));
      expect(ChatThreadType.values, contains(ChatThreadType.familyGroup));
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

    test('fromRpcJson family DM uses profile id for isOutbound', () {
      final mine = ChatMessage.fromRpcJson(
        {
          'messageId': 'm1',
          'sender': {
            'ownerId': 'mom',
            'displayName': 'Mom',
          },
          'recipient': {'ownerId': 'family:mom:owner'},
          'content': {'text': 'hi'},
          'metadata': {'timestamp': '2026-07-20T00:00:00Z'},
        },
        threadId: 'node1:family:mom:owner',
        selfOwnerId: 'envoy:owner:home',
        selfFamilyProfileId: 'mom',
      );
      expect(mine.isOutbound, isTrue);
      expect(mine.senderDisplayName, 'You');

      final theirs = ChatMessage.fromRpcJson(
        {
          'messageId': 'm2',
          'sender': {
            'ownerId': 'owner',
            'displayName': 'Home',
          },
          'recipient': {'ownerId': 'family:mom:owner'},
          'content': {'text': 'hello'},
          'metadata': {'timestamp': '2026-07-20T00:00:01Z'},
        },
        threadId: 'node1:family:mom:owner',
        selfOwnerId: 'envoy:owner:home',
        selfFamilyProfileId: 'mom',
      );
      expect(theirs.isOutbound, isFalse);
      expect(theirs.senderDisplayName, 'Home');
    });
  });

  group('messageIsOutgoing', () {
    test('mesh chat compares sender to mesh ownerId', () {
      expect(
        messageIsOutgoing(
          senderOwnerId: 'envoy:owner:a',
          recipientOwnerId: 'envoy:owner:b',
          selfOwnerId: 'envoy:owner:a',
          selfFamilyProfileId: 'owner',
        ),
        isTrue,
      );
      expect(
        messageIsOutgoing(
          senderOwnerId: 'envoy:owner:b',
          recipientOwnerId: 'envoy:owner:a',
          selfOwnerId: 'envoy:owner:a',
          selfFamilyProfileId: 'owner',
        ),
        isFalse,
      );
    });
  });
}
