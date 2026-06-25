import 'package:envoygo/models/stored_node.dart';
import 'package:envoygo/models/terminal_session.dart';
import 'package:envoygo/providers/contact_provider.dart';
import 'package:envoygo/providers/node_provider.dart';
import 'package:envoygo/providers/terminal_provider.dart';
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

  group('TerminalNotifier', () {
    late ProviderContainer container;
    late TerminalRpcMockWebSocket mock;

    setUp(() async {
      await LocalDatabase().initialize();
      mock = TerminalRpcMockWebSocket(
        initialSessions: [
          {
            'sessionId': 'sess-a',
            'title': 'A',
            'cwd': '/tmp',
            'shell': '/bin/zsh',
            'state': 'running',
            'createdAt': '2026-06-24T12:00:00.000Z',
            'lastActivityAt': '2026-06-24T12:00:00.000Z',
          },
        ],
      );
      final homeClient = await connectTerminalRpcMock(mock);
      final nodeService = NodeServiceClient(homeClient);
      final node = StoredNode(
        id: 'node-1',
        name: 'Home',
        ownerId: 'envoy:owner:abc',
        homePeerId: '12D3',
        pairedAt: DateTime.utc(2026, 1, 1),
      );

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

    test('loadSessions maps shell field from home summaries', () async {
      await container.read(terminalProvider.notifier).loadSessions();
      final sessions = container.read(terminalProvider).sessions;
      expect(sessions, hasLength(1));
      expect(sessions.single.id, 'sess-a');
      expect(sessions.single.runningProcess, '/bin/zsh');
      expect(sessions.single.isRunning, isTrue);
    });

    test('createSession refreshes sessions from home', () async {
      await container.read(terminalProvider.notifier).createSession(
            command: 'build',
            cwd: '/work',
          );
      final sessions = container.read(terminalProvider).sessions;
      expect(sessions.map((s) => s.id), contains('sess-new-1'));
      expect(mock.createCalls.single['title'], 'build');
    });

    test('closeSession removes session locally after RPC', () async {
      await container.read(terminalProvider.notifier).loadSessions();
      await container
          .read(terminalProvider.notifier)
          .closeSession('sess-a');
      expect(container.read(terminalProvider).sessions, isEmpty);
    });
  });
}
