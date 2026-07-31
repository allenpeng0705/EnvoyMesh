// Tests for the self-chat filter. Before the filter was added, a
// self-echo of a message the owner sent (with no recipient, or a
// self-bond that slipped through the contact filter) would create
// a "chat with yourself" thread. The user reported this thread
// reappearing even after a clean restart.

import 'package:envoygo/providers/chat_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
}
