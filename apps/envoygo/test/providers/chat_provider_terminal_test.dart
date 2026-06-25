import 'package:envoygo/models/chat_thread.dart';
import 'package:envoygo/models/stored_node.dart';
import 'package:envoygo/models/terminal_session.dart';
import 'package:envoygo/providers/chat_provider.dart';
import 'package:envoygo/providers/contact_provider.dart';
import 'package:envoygo/providers/terminal_provider.dart';
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

  group('ChatNotifier terminal sync', () {
    late ProviderContainer container;
    late StoredNode node;
    late TerminalRpcMockWebSocket mock;
    late NodeServiceClient nodeService;

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
        initialSessions: [
          {
            'sessionId': 'sess-existing',
            'title': 'dev',
            'cwd': '/Users/me/proj',
            'shell': '/bin/zsh',
            'state': 'running',
            'createdAt': '2026-06-24T10:00:00.000Z',
            'lastActivityAt': '2026-06-24T10:00:00.000Z',
          },
        ],
      );
      final homeClient = await connectTerminalRpcMock(mock);
      nodeService = NodeServiceClient(homeClient);

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

    test('syncTerminals upserts threads for home sessions', () async {
      final chat = container.read(chatProvider.notifier);
      await chat.syncTerminals();

      final threads = container.read(chatProvider).threads;
      expect(threads, hasLength(1));
      expect(threads.single.type, ChatThreadType.terminal);
      expect(threads.single.id, '${node.id}:term:sess-existing');
      expect(threads.single.displayName, 'Terminal: dev');
    });

    test('syncTerminals removes stale terminal threads', () async {
      final chat = container.read(chatProvider.notifier);

      chat.onChatMessage({
        'senderOwnerId': 'terminal',
        'terminalId': 'sess-gone',
        'terminalName': 'old',
        'text': 'shell — ~',
        'messageId': 'term_sess-gone',
      });
      expect(
        container.read(chatProvider).threads,
        hasLength(1),
        reason: 'seed stale terminal thread',
      );

      mock.setSessions(const [
        TerminalSession(
          id: 'sess-existing',
          name: 'dev',
          cwd: '/Users/me/proj',
          runningProcess: '/bin/zsh',
          state: 'running',
        ),
      ]);

      await chat.syncTerminals();

      final threads = container.read(chatProvider).threads;
      expect(threads, hasLength(1));
      expect(threads.single.id, '${node.id}:term:sess-existing');
    });

    test('createTerminal creates on home, refreshes list, and adds thread',
        () async {
      final chat = container.read(chatProvider.notifier);

      final sessionId = await chat.createTerminal(
        title: 'deploy',
        cwd: '/tmp/work',
      );

      expect(sessionId, 'sess-new-1');
      expect(mock.createCalls, hasLength(1));
      expect(mock.createCalls.single['title'], 'deploy');
      expect(mock.createCalls.single['cwd'], '/tmp/work');

      final threads = container.read(chatProvider).threads;
      expect(
        threads.any((t) => t.id == '${node.id}:term:$sessionId'),
        isTrue,
      );
      expect(
        container.read(terminalProvider).sessions.map((s) => s.id),
        contains('sess-new-1'),
      );
    });

    test('createTerminal rethrows RPC failures', () async {
      mock.createTerminalError = 'terminal.maxSessions (8)';

      final chat = container.read(chatProvider.notifier);
      await expectLater(
        chat.createTerminal(title: 'overflow'),
        throwsA(isA<Exception>()),
      );
      expect(container.read(chatProvider).threads, isEmpty);
    });

    test('createTerminal returns null when not connected', () async {
      container.dispose();
      container = ProviderContainer(
        overrides: [
          nodeProvider.overrideWith((ref) {
            final notifier = NodeNotifier(
              ref: ref,
              secureStorage: SecureStorage.test(),
              localDb: LocalDatabase.test(),
            );
            notifier.state = const NodeState();
            return notifier;
          }),
          nodeServiceProvider.overrideWith((ref) => null),
        ],
      );

      final sessionId = await container
          .read(chatProvider.notifier)
          .createTerminal(title: 'orphan');
      expect(sessionId, isNull);
    });
  });
}
