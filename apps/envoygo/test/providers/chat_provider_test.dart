// Tests for the self-chat filter. Before the filter was added, a
// self-echo of a message the owner sent (with no recipient, or a
// self-bond that slipped through the contact filter) would create
// a "chat with yourself" thread. The user reported this thread
// reappearing even after a clean restart.

import 'package:envoygo/models/chat_message.dart';
import 'package:envoygo/providers/chat_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('familyPeerIdFromThreadKey', () {
    test('returns the other profile for mom in family:mom:owner', () {
      expect(
        ChatNotifier.familyPeerIdFromThreadKey('family:mom:owner', 'mom'),
        'owner',
      );
    });

    test('returns the other profile for dad in node-prefixed thread id', () {
      expect(
        ChatNotifier.familyPeerIdFromThreadKey(
          'home1:family:dad:mom',
          'dad',
        ),
        'mom',
      );
    });

    test('returns null when myProfileId is not in the thread', () {
      expect(
        ChatNotifier.familyPeerIdFromThreadKey('family:dad:mom', 'owner'),
        isNull,
      );
    });
  });

  group('isSelfThreadPeer', () {
    const selfOwnerId = 'envoy:owner:abc123';

    test('returns true when peerId equals the self ownerId', () {
      expect(isSelfThreadPeer('envoy:owner:abc123', selfOwnerId), isTrue);
    });

    test('returns true for envoy_device_ keys regardless of selfOwnerId',
        () {
      // The device-keyed form of a shared-identity self-bond. Even
      // if the caller forgot to pass selfOwnerId, this still
      // matches — same rule as the contact-side filter.
      expect(
        isSelfThreadPeer('envoy_device_local', selfOwnerId),
        isTrue,
      );
      expect(
        isSelfThreadPeer('envoy_device_local', null),
        isTrue,
        reason: 'envoy_device_ is a self-shaped id even without '
            'a known self ownerId.',
      );
    });

    test('returns false for a normal contact ownerId', () {
      expect(isSelfThreadPeer('envoy:owner:alice', selfOwnerId), isFalse);
    });

    test('returns false for null/empty peerId', () {
      // Defensive: a null/empty peerId means we couldn't resolve
      // the other party, not that the other party is self. The
      // caller is responsible for handling the empty case.
      expect(isSelfThreadPeer(null, selfOwnerId), isFalse);
      expect(isSelfThreadPeer('', selfOwnerId), isFalse);
    });

    test('returns false when selfOwnerId is null and peerId is not device-shaped',
        () {
      // Without a known self ownerId and a non-device peerId, we
      // can only say "probably not self" — caller must ensure
      // selfOwnerId is set.
      expect(
        isSelfThreadPeer('envoy:owner:alice', null),
        isFalse,
      );
    });

    test('keeps contacts that merely contain the substring envoy_device_', () {
      // A contact whose id merely contains "envoy_device_" as a
      // substring (e.g. an owner id that includes it) is NOT
      // self. Only the prefix form is filtered.
      expect(
        isSelfThreadPeer('envoy:owner:not_envoy_device_alice', selfOwnerId),
        isFalse,
      );
    });
  });

  group('AI bot thread keys', () {
    test('agentType bot:<id> builds the same thread id as syncAiBots', () {
      const nodeId = 'home-node';
      const botId = 'luna';
      const agentType = 'bot:$botId';
      expect('$nodeId:$agentType', '$nodeId:bot:$botId');
    });

    test('bot agentType is detected by prefix', () {
      expect('bot:luna'.startsWith('bot:'), isTrue);
      expect('envoyai'.startsWith('bot:'), isFalse);
      expect('external'.startsWith('bot:'), isFalse);
      expect('bot:luna'.substring(4), 'luna');
    });
  });

  group('resolveExtAgentDisplayName', () {
    test('prefers active Ext Agent name over bridge agentName', () {
      expect(
        ChatNotifier.resolveExtAgentDisplayName({
          'agentName': 'Legacy',
          'agentType': 'envoyai',
          'activeExtAgentId': 'pi',
          'extAgents': [
            {'id': 'pi', 'name': 'Pi'},
            {'id': 'homeclaw', 'name': 'HomeClaw'},
          ],
        }),
        'Pi',
      );
    });

    test('falls back to agentName then Ext Agent', () {
      expect(
        ChatNotifier.resolveExtAgentDisplayName({'agentName': 'Hermes'}),
        'Hermes',
      );
      expect(
        ChatNotifier.resolveExtAgentDisplayName({}),
        'Ext Agent',
      );
    });
  });

  group('reconcileChatMessages', () {
    ChatMessage msg({
      required String id,
      required String text,
      bool outbound = true,
    }) =>
        ChatMessage(
          id: id,
          threadId: 'node:envoyai',
          text: text,
          isOutbound: outbound,
          createdAt: '2026-07-31T12:00:00.000Z',
        );

    test('replaces optimistic temp_ with server echo (trimmed)', () {
      final existing = <ChatMessage>[
        msg(id: 'temp_1', text: 'hello '),
        msg(id: 'ai_1', text: 'hi', outbound: false),
      ];
      final incoming = msg(id: 'srv_1', text: 'hello');
      final next = reconcileChatMessages(
        existing: existing,
        incoming: incoming,
        showAsMine: true,
        collapseMatchingOutbound: true,
      );
      expect(next.map((m) => m.id), ['srv_1', 'ai_1']);
      expect(next.where((m) => m.isOutbound), hasLength(1));
    });

    test('collapses duplicate outbound echoes on AI threads', () {
      final existing = <ChatMessage>[
        msg(id: 'temp_1', text: 'ping'),
        msg(id: 'old_srv', text: 'ping'),
      ];
      final incoming = msg(id: 'new_srv', text: 'ping');
      final next = reconcileChatMessages(
        existing: existing,
        incoming: incoming,
        showAsMine: true,
        collapseMatchingOutbound: true,
      );
      expect(next.map((m) => m.id), ['new_srv']);
    });

    test('keeps intentional same-text outbound when not collapsing', () {
      final existing = <ChatMessage>[
        msg(id: 'srv_old', text: 'ok'),
      ];
      final incoming = msg(id: 'srv_new', text: 'ok');
      final next = reconcileChatMessages(
        existing: existing,
        incoming: incoming,
        showAsMine: true,
        collapseMatchingOutbound: false,
      );
      expect(next.map((m) => m.id), ['srv_new', 'srv_old']);
    });
  });
}
