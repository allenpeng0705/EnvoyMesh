import 'package:envoygo/models/chat_thread.dart';
import 'package:envoygo/models/stored_node.dart';
import 'package:envoygo/providers/chat_provider.dart';
import 'package:envoygo/providers/contact_provider.dart';
import 'package:envoygo/providers/node_provider.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/storage/local_database.dart';
import 'package:envoygo/storage/secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../helpers/terminal_rpc_mock.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('ChatNotifier group chat sync', () {
    late ProviderContainer container;
    late StoredNode node;
    late TerminalRpcMockWebSocket mock;

    setUp(() async {
      await LocalDatabase().initialize();
      node = StoredNode(
        id: 'node-test-1',
        name: 'My Mac',
        ownerId: 'envoy:owner:abc',
        homePeerId: '12D3Home',
        pairedAt: DateTime.utc(2026, 1, 1),
      );
      mock = TerminalRpcMockWebSocket(
        initialRooms: [
          {
            'roomId': 'room-existing',
            'title': 'Family',
            'memberOwnerIds': ['envoy:owner:abc', 'envoy:owner:bob'],
            'revision': 1,
            'updatedAt': '2026-06-24T10:00:00.000Z',
          },
        ],
      );
      final homeClient = await connectTerminalRpcMock(mock);
      final nodeService = NodeServiceClient(homeClient);

      container = ProviderContainer(
        overrides: [
          nodeProvider.overrideWith((ref) {
            final notifier = NodeNotifier(
              ref: ref,
              secureStorage: SecureStorage.test(),
              localDb: LocalDatabase.test(),
            );
            notifier.state = NodeState(
              activeNode: node,
              pairedNodes: [node],
              connectionState: NodeConnectionState.connected,
              ownerId: node.ownerId,
            );
            return notifier;
          }),
          nodeServiceProvider.overrideWith((ref) => nodeService),
        ],
      );
    });

    tearDown(() => container.dispose());

    test('syncRooms upserts group threads from home', () async {
      await container.read(chatProvider.notifier).syncRooms();

      final threads = container.read(chatProvider).threads;
      expect(threads, hasLength(1));
      expect(threads.single.type, ChatThreadType.group);
      expect(threads.single.id, '${node.id}:room:room-existing');
      expect(threads.single.displayName, 'Family');
    });

    test('syncRooms removes stale group threads', () async {
      final chat = container.read(chatProvider.notifier);
      chat.onRoomMessage({
        'roomId': 'room-gone',
        'message': {
          'messageId': 'msg-1',
          'sender': {'ownerId': 'envoy:owner:bob', 'displayName': 'Bob'},
          'content': {'text': 'hello'},
          'metadata': {'timestamp': '2026-06-24T11:00:00.000Z'},
        },
      });
      expect(container.read(chatProvider).threads, hasLength(1));

      await chat.syncRooms();
      expect(container.read(chatProvider).threads, hasLength(1));
      expect(
        container.read(chatProvider).threads.single.chatRoomId,
        'room-existing',
      );
    });

    test('createRoom creates on home and adds thread', () async {
      final roomId =
          await container.read(chatProvider.notifier).createRoom('Deploy');

      expect(roomId, 'room-new-1');
      expect(mock.createRoomCalls.single['title'], 'Deploy');
      expect(
        mock.createRoomCalls.single['memberOwnerIds'],
        isA<List<dynamic>>(),
      );

      final thread = container
          .read(chatProvider)
          .threads
          .where((t) => t.id == '${node.id}:room:$roomId')
          .firstOrNull;
      expect(thread, isNotNull);
      expect(thread!.displayName, 'Deploy');
    });

    test('createRoom upserts thread when listChatRooms lags behind create',
        () async {
      mock.addRoomOnCreate = false;
      final roomId =
          await container.read(chatProvider.notifier).createRoom('Solo');

      expect(roomId, 'room-new-1');
      final thread = container
          .read(chatProvider)
          .threads
          .where((t) => t.id == '${node.id}:room:$roomId')
          .firstOrNull;
      expect(thread, isNotNull);
      expect(thread!.displayName, 'Solo');
    });

    test('onRoomMessage marks self messages as outbound', () {
      container.read(chatProvider.notifier).syncRooms();
      container.read(chatProvider.notifier).onRoomMessage({
        'roomId': 'room-existing',
        'message': {
          'messageId': 'msg-self',
          'sender': {
            'ownerId': 'envoy:owner:abc',
            'displayName': 'Me',
          },
          'content': {'text': 'On my way'},
          'metadata': {'timestamp': '2026-06-24T12:00:00.000Z'},
        },
      });

      final threadId = '${node.id}:room:room-existing';
      final messages = container.read(chatProvider).messages[threadId] ?? [];
      expect(messages, hasLength(1));
      expect(messages.single.isOutbound, isTrue);
      expect(messages.single.senderDisplayName, 'You');
    });

    test('onRoomRemoved deletes local thread', () async {
      await container.read(chatProvider.notifier).syncRooms();
      await container.read(chatProvider.notifier).onRoomRemoved({
        'roomId': 'room-existing',
      });
      expect(container.read(chatProvider).threads, isEmpty);
    });
  });
}
