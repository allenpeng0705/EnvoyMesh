import 'package:envoygo/models/chat_thread.dart';
import 'package:envoygo/models/stored_node.dart';
import 'package:envoygo/providers/chat_provider.dart';
import 'package:envoygo/providers/node_provider.dart';
import 'package:envoygo/storage/local_database.dart';
import 'package:envoygo/storage/secure_storage.dart';
import 'package:envoygo/widgets/ai_engine_section.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    await LocalDatabase().initialize();
  });

  group('computeAiEngineMode', () {
    test('both when bridge and openclaw enabled', () {
      expect(
        computeAiEngineMode(bridgeEnabled: true, openclawEnabled: true),
        AiEngineMode.both,
      );
    });

    test('extOnly when only bridge enabled', () {
      expect(
        computeAiEngineMode(bridgeEnabled: true, openclawEnabled: false),
        AiEngineMode.extOnly,
      );
    });
  });

  group('formatExtAgentBridgeSubtitle', () {
    test('combines agentName and adapter', () {
      expect(
        formatExtAgentBridgeSubtitle({
          'agentName': 'Hermes',
          'adapter': 'envoymesh-message',
        }),
        'Hermes · envoymesh-message',
      );
    });

    test('returns empty when bridge is null', () {
      expect(formatExtAgentBridgeSubtitle(null), '');
    });

    test('name only when adapter missing', () {
      expect(
        formatExtAgentBridgeSubtitle({'agentName': 'HomeClaw'}),
        'HomeClaw',
      );
    });
  });

  group('ChatNotifier.onBridgeStatus', () {
    late ProviderContainer container;
    late StoredNode node;

    setUp(() {
      node = StoredNode(
        id: 'node-test-1',
        name: 'My Mac',
        ownerId: 'envoy:owner:abc',
        homePeerId: '12D3Home',
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
        ],
      );
    });

    tearDown(() => container.dispose());

    test('updates external agent thread label when agentName changes', () {
      final chat = container.read(chatProvider.notifier);

      chat.onBridgeStatus({
        'enabled': true,
        'agentName': 'HomeClaw',
        'agentType': 'external',
        'adapter': 'envoymesh-message',
        'activeExtAgentId': 'homeclaw',
      });

      var threads = container.read(chatProvider).threads;
      expect(threads, hasLength(1));
      expect(threads.single.type, ChatThreadType.externalAgent);
      expect(threads.single.displayName, 'HomeClaw (Bridge Online)');

      chat.onBridgeStatus({
        'enabled': true,
        'agentName': 'Hermes',
        'agentType': 'external',
        'adapter': 'envoymesh-message',
        'activeExtAgentId': 'hermes',
      });

      threads = container.read(chatProvider).threads;
      expect(threads.single.displayName, 'Hermes (Bridge Online)');
      expect(threads.single.id, '${node.id}:external');
    });

    test('shows Bridge Offline when enabled is false', () {
      final chat = container.read(chatProvider.notifier);
      chat.onBridgeStatus({
        'enabled': false,
        'agentName': 'HomeClaw',
        'agentType': 'external',
      });
      final thread = container.read(chatProvider).threads.single;
      expect(thread.displayName, 'HomeClaw (Bridge Offline)');
    });
  });
}
