import 'package:envoygo/models/chat_room.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChatRoom.fromJson', () {
    test('maps home node room summary fields', () {
      final room = ChatRoom.fromJson({
        'roomId': 'room-1',
        'title': 'Weekend',
        'memberOwnerIds': ['envoy:owner:a', 'envoy:owner:b', 'envoy:owner:c'],
        'revision': 2,
        'updatedAt': '2026-06-24T12:00:00.000Z',
      });

      expect(room.id, 'room-1');
      expect(room.name, 'Weekend');
      expect(room.memberCount, 3);
    });

    test('maps local DB cache fields', () {
      final room = ChatRoom.fromJson({
        'id': 'room-2',
        'node_id': 'node-1',
        'name': 'Family',
        'member_count': 5,
      });

      expect(room.id, 'room-2');
      expect(room.nodeId, 'node-1');
      expect(room.name, 'Family');
      expect(room.memberCount, 5);
    });
  });
}
