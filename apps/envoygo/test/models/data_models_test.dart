import 'package:envoygo/models/contact.dart';
import 'package:envoygo/models/json_rpc.dart';
import 'package:envoygo/models/stored_node.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('StoredNode', () {
    test('toJson and fromJson round-trip', () {
      final node = StoredNode(
        id: 'node_1',
        name: 'My Mac',
        ownerId: 'envoy:owner:abc',
        homePeerId: '12D3KooW',
        lanIp: '10.0.0.5',
        wsPort: 3030,
        relayWsUrl: 'wss://relay.example.com',
        pairedAt: DateTime(2026, 6, 9),
        lastConnectedAt: DateTime(2026, 6, 9, 10, 30),
      );

      final json = node.toJson();
      final restored = StoredNode.fromJson(json);

      expect(restored.id, node.id);
      expect(restored.name, 'My Mac');
      expect(restored.ownerId, 'envoy:owner:abc');
      expect(restored.lanIp, '10.0.0.5');
      expect(restored.wsPort, 3030);
    });

    test('copyWith preserves unchanged fields', () {
      final original = StoredNode(
        id: 'node_1',
        name: 'Original',
        ownerId: 'owner_1',
        homePeerId: 'peer_1',
        pairedAt: DateTime(2026, 1, 1),
      );

      final updated = original.copyWith(name: 'Updated');

      expect(updated.name, 'Updated');
      expect(updated.id, 'node_1');
      expect(updated.ownerId, 'owner_1');
    });

    test('copyWith clears optional fields', () {
      final original = StoredNode(
        id: 'node_1',
        name: 'Node',
        ownerId: 'owner_1',
        homePeerId: 'peer_1',
        lanIp: '10.0.0.1',
        relayWsUrl: 'wss://relay.example.com',
        pairedAt: DateTime(2026, 1, 1),
      );

      final cleared = original.copyWith(clearLanIp: true);

      expect(cleared.lanIp, isNull);
      expect(cleared.relayWsUrl, 'wss://relay.example.com'); // Not cleared.
    });
  });

  group('Contact', () {
    test('toJson and fromJson round-trip', () {
      final contact = Contact(
        ownerId: 'owner_123',
        displayName: 'Alice',
        bondLevel: 'direct',
        avatarUrl: 'https://example.com/avatar.png',
        lastSeen: DateTime(2026, 6, 9, 10, 0),
      );

      final json = contact.toJson();
      final restored = Contact.fromJson(json);

      expect(restored.ownerId, 'owner_123');
      expect(restored.displayName, 'Alice');
      expect(restored.bondLevel, 'direct');
    });

    test('handles null optional fields', () {
      final json = {
        'owner_id': 'owner_123',
        'bond_level': 'public',
      };
      final contact = Contact.fromJson(json);
      expect(contact.ownerId, 'owner_123');
      expect(contact.displayName, isNull);
      expect(contact.lastSeen, isNull);
    });
  });

  group('JsonRpcRequest', () {
    test('toJson includes params only when present', () {
      const withParams = JsonRpcRequest(
        id: '1',
        method: 'test',
        params: {'key': 'value'},
      );
      expect(withParams.toJson(), contains('params'));

      const withoutParams = JsonRpcRequest(
        id: '2',
        method: 'test',
      );
      expect(withoutParams.toJson(), isNot(contains('params')));
    });
  });

  group('JsonRpcResponse', () {
    test('fromJson parses success response', () {
      final json = {
        'id': '1',
        'result': {'ok': true},
      };
      final response = JsonRpcResponse.fromJson(json);
      expect(response.isError, isFalse);
      expect(response.result, {'ok': true});
    });

    test('fromJson parses error response', () {
      final json = {
        'id': '1',
        'error': {'code': -1, 'message': 'Not found'},
      };
      final response = JsonRpcResponse.fromJson(json);
      expect(response.isError, isTrue);
      expect(response.error?.message, 'Not found');
    });
  });
}
