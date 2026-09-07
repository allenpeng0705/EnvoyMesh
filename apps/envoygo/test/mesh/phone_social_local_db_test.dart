import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoygo/mesh/phone_social_local_db.dart';
import 'package:envoygo/storage/local_database.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('PhoneSocialLocalDb', () {
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

    test('syncFromStore writes phone-local contacts and messages', () async {
      final store = PhoneSocialStore();
      store.profile = {'ownerId': 'envoy:owner:me'};
      store.upsertBond(const BondContact(
        ownerId: 'envoy:owner:friend',
        displayName: 'Friend',
        bondLevel: 'direct',
      ));
      store.upsertPeer(const PhonePeerRecord(
        ownerId: 'envoy:owner:friend',
        libp2pPeerId: '12D3Friend',
        displayName: 'Friend',
      ));
      final threadId = phoneDmThreadId('envoy:owner:friend');
      store.appendMessage(MeshChatMessage(
        id: 'm1',
        threadId: threadId,
        senderOwnerId: 'envoy:owner:me',
        text: 'hi',
        createdAt: '2026-09-07T00:00:00.000Z',
        isOutbound: true,
      ));

      await PhoneSocialLocalDb(db).syncFromStore(store);

      final contacts = await db.getContacts(phoneLocalContextId);
      expect(contacts, hasLength(1));
      expect(contacts.first['owner_id'], 'envoy:owner:friend');

      final threads = await db.getThreads(phoneLocalContextId);
      expect(threads, hasLength(1));
      expect(threads.first['id'], threadId);

      final msgs = await db.getMessages(threadId);
      expect(msgs, hasLength(1));
      expect(msgs.first['text'], 'hi');
    });
  });
}
