import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:envoygo/storage/local_database.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('LocalDatabase.deleteNode', () {
    late LocalDatabase db;
    late String dbPath;

    setUp(() async {
      db = LocalDatabase.test();
      await db.initialize();
      dbPath = p.join(await getDatabasesPath(), 'envoygo.db');
    });

    tearDown(() async {
      await db.closeForTest();
      await databaseFactory.deleteDatabase(dbPath);
    });

    test('removes messages, threads, contacts, rooms, and the node', () async {
      const nodeId = 'node-a';
      const otherNode = 'node-b';
      await db.upsertNode({
        'id': nodeId,
        'name': 'Home',
        'owner_id': 'owner-a',
        'home_peer_id': 'peer-a',
        'paired_at': DateTime.now().toIso8601String(),
      });
      await db.upsertNode({
        'id': otherNode,
        'name': 'Other',
        'owner_id': 'owner-b',
        'home_peer_id': 'peer-b',
        'paired_at': DateTime.now().toIso8601String(),
      });

      final threadId = '$nodeId:envoyai';
      final otherThread = '$otherNode:envoyai';
      await db.upsertThread({
        'id': threadId,
        'node_id': nodeId,
        'type': 'agent',
        'display_name': 'EnvoyAI',
      });
      await db.upsertThread({
        'id': otherThread,
        'node_id': otherNode,
        'type': 'agent',
        'display_name': 'EnvoyAI',
      });
      await db.insertMessage({
        'id': 'm1',
        'thread_id': threadId,
        'text': 'hello',
        'created_at': DateTime.now().toIso8601String(),
        'is_outbound': 1,
      });
      await db.insertMessage({
        'id': 'm2',
        'thread_id': otherThread,
        'text': 'keep',
        'created_at': DateTime.now().toIso8601String(),
        'is_outbound': 0,
      });
      await db.upsertContacts(nodeId, [
        {
          'owner_id': 'friend',
          'display_name': 'Friend',
          'bond_level': 'direct',
        },
      ]);
      await db.upsertRooms(nodeId, [
        {
          'id': 'room-1',
          'name': 'Group',
          'member_count': 2,
        },
      ]);

      await db.deleteNode(nodeId);

      expect(await db.getNode(nodeId), isNull);
      expect(await db.getThreads(nodeId), isEmpty);
      expect(await db.getContacts(nodeId), isEmpty);
      expect(await db.getRooms(nodeId), isEmpty);
      expect(await db.getMessages(threadId), isEmpty);

      // Other node's data must survive.
      expect(await db.getNode(otherNode), isNotNull);
      expect(await db.getThreads(otherNode), hasLength(1));
      expect(await db.getMessages(otherThread), hasLength(1));
    });
  });
}
