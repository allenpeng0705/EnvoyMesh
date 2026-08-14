import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/models/content_engage_notification.dart';
import 'package:envoygo/screens/chat/chat_list_screen.dart';
import 'package:envoygo/screens/contacts/contacts_screen.dart';
import 'package:envoygo/screens/me/me_screen.dart';
import 'package:envoygo/providers/content_engage_provider.dart';
import 'package:envoygo/providers/node_provider.dart';
import 'package:envoygo/providers/chat_provider.dart';
import 'package:envoygo/providers/contact_provider.dart';
import 'package:envoygo/models/stored_node.dart';
import 'package:envoygo/models/contact.dart';
import 'package:envoygo/models/chat_thread.dart';
import 'package:envoygo/models/chat_message.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/services/pairing_service.dart';
import 'package:envoygo/storage/secure_storage.dart';
import 'package:envoygo/storage/local_database.dart';

Widget _app(Widget home, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('en'),
      home: home,
    ),
  );
}

StoredNode _testNode() => StoredNode(
      id: 'node1',
      name: 'My Mac',
      ownerId: 'envoy:owner:test',
      homePeerId: '12D3KooW',
      pairedAt: DateTime.now(),
      lastConnectedAt: DateTime.now(),
    );

void main() {
  group('HomeScreen tabs', () {
    testWidgets('owner nav labels are Social Terminal Knowledge Me',
        (tester) async {
      // Full HomeScreen pulls CallProvider.noop → HomeRemoteClient ping timer;
      // assert the owner IA labels via the same l10n keys HomeScreen uses.
      await tester.pumpWidget(
        _app(
          Builder(
            builder: (context) {
              final l10n = AppLocalizations.of(context);
              return Scaffold(
                bottomNavigationBar: NavigationBar(
                  selectedIndex: 0,
                  destinations: [
                    NavigationDestination(
                      icon: const Icon(Icons.groups_outlined),
                      label: l10n.navSocial,
                    ),
                    NavigationDestination(
                      icon: const Icon(Icons.terminal_outlined),
                      label: l10n.navTerminal,
                    ),
                    NavigationDestination(
                      icon: const Icon(Icons.menu_book_outlined),
                      label: l10n.navKnowledge,
                    ),
                    NavigationDestination(
                      icon: const Icon(Icons.person_outline),
                      label: l10n.navMe,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Social'), findsOneWidget);
      expect(find.text('Terminal'), findsOneWidget);
      expect(find.text('Knowledge'), findsOneWidget);
      expect(find.text('Me'), findsOneWidget);
    });

    testWidgets('Social tab selection clears engage badges', (tester) async {
      // Mirrors HomeScreen.onDestinationSelected for OwnerTabs.social.
      late ContentEngageNotifier engage;
      await tester.pumpWidget(
        _app(
          Consumer(
            builder: (context, ref, _) {
              engage = ref.watch(contentEngageProvider.notifier);
              return Scaffold(
                bottomNavigationBar: NavigationBar(
                  selectedIndex: 1,
                  onDestinationSelected: (index) {
                    if (index == 0) {
                      ref
                          .read(contentEngageProvider.notifier)
                          .dismiss(surface: 'all');
                      ref.read(chatProvider.notifier).selectTab(0);
                    }
                  },
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.groups_outlined),
                      label: 'Social',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.terminal_outlined),
                      label: 'Terminal',
                    ),
                  ],
                ),
              );
            },
          ),
          overrides: [
            chatProvider.overrideWith((ref) => _SelectableChatNotifier(selectedTab: 1)),
            contentEngageProvider.overrideWith((ref) {
              return _SeededEngageNotifier(ref, [
                ContentEngageNotification(
                  id: 'e1',
                  receivedAt: DateTime.now().toUtc().toIso8601String(),
                  messageId: 'm1',
                  url: 'envoy://x/feed/',
                  surface: 'feed',
                  action: 'star',
                  actorOwnerId: 'envoy:owner:alice',
                  senderPeerId: 'envoy_alice',
                ),
              ]);
            }),
          ],
        ),
      );
      await tester.pump();

      expect(engage.state.totalCount, 1);
      await tester.tap(find.text('Social'));
      await tester.pump();
      expect(engage.state.totalCount, 0);
    });
  });

  group('ChatListScreen', () {
    testWidgets('shows empty state when no threads', (tester) async {
      await tester.pumpWidget(_app(const ChatListScreen()));
      await tester.pump();

      expect(find.text('No conversations yet'), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('shows thread tiles for each thread type', (tester) async {
      final testThreads = [
        _createThread('1', ChatThreadType.direct, 'Alice'),
        _createThread('2', ChatThreadType.group, 'Family'),
        _createThread('3', ChatThreadType.envoyai, 'EnvoyAI'),
        _createThread('4', ChatThreadType.terminal, 'Terminal: bash'),
      ];

      await tester.pumpWidget(
        _app(
          const Scaffold(body: ChatListScreen()),
          overrides: [
            chatProvider.overrideWith((ref) => _FakeChatNotifier(testThreads)),
          ],
        ),
      );
      await tester.pump();

      expect(find.text('Alice'), findsOneWidget);
      expect(find.text('Family'), findsOneWidget);
      expect(find.text('EnvoyAI'), findsOneWidget);
      // Terminals moved to the Terminal tab — not listed under Chats.
      expect(find.text('Terminal: bash'), findsNothing);
    });
  });

  group('ContactsScreen', () {
    testWidgets('shows empty state when no contacts', (tester) async {
      await tester.pumpWidget(
        _app(const Scaffold(body: ContactsScreen())),
      );
      await tester.pump();

      expect(find.text('No contacts yet'), findsOneWidget);
    });

    testWidgets('shows contact tiles with display names', (tester) async {
      final testContacts = [
        Contact(
          ownerId: 'envoy:owner:alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
        Contact(
          ownerId: 'envoy:owner:bob',
          displayName: 'Bob',
          bondLevel: 'referred',
        ),
      ];

      await tester.pumpWidget(
        _app(
          const Scaffold(body: ContactsScreen()),
          overrides: [
            contactProvider.overrideWith(
              (ref) => _FakeContactNotifier(testContacts),
            ),
          ],
        ),
      );
      await tester.pump();

      expect(find.text('Alice'), findsOneWidget);
      expect(find.text('Bob'), findsOneWidget);
    });
  });

  group('MeScreen', () {
    setUp(() {
      PackageInfo.setMockInitialValues(
        appName: 'envoygo',
        packageName: 'com.envoymesh.envoygo',
        version: '1.0.0',
        buildNumber: '11',
        buildSignature: '',
      );
    });

    testWidgets('shows pair button when disconnected', (tester) async {
      await tester.pumpWidget(_app(const MeScreen()));
      await tester.pump();
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('Not connected'), findsOneWidget);
      expect(
        find.text('Pair with a home node to get started'),
        findsOneWidget,
      );
      expect(find.text('Pair'), findsOneWidget);
      expect(find.textContaining('EnvoyGo'), findsWidgets);
    });

    testWidgets('shows connected node info and Public Access section',
        (tester) async {
      final node = _testNode();

      await tester.pumpWidget(
        _app(
          const MeScreen(),
          overrides: [
            nodeProvider.overrideWith((ref) => _FakeNodeNotifier(node)),
          ],
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('My Mac'), findsWidgets);
      expect(find.text('Browser'), findsWidgets);
    });
  });
}

// -- Test Helpers --

ChatThread _createThread(String id, ChatThreadType type, String name) {
  return ChatThread(
    id: id,
    nodeId: 'node1',
    type: type,
    displayName: name,
    lastMessageText: 'Hello!',
    lastMessageAt: DateTime.now(),
    unreadCount: type == ChatThreadType.direct ? 2 : 0,
  );
}

class _SelectableChatNotifier extends ChatNotifier {
  _SelectableChatNotifier({int selectedTab = 0}) : super(_FakeRef()) {
    state = ChatState(selectedTab: selectedTab);
  }

  @override
  Future<void> loadThreads(String nodeId) async {}
  @override
  void onChatMessage(Map<String, dynamic> data) {}
  @override
  void onRoomMessage(Map<String, dynamic> data) {}
  @override
  void onBridgeStatus(Map<String, dynamic> data) {}
  @override
  Future<void> sendMessage(String targetOwnerId, String text,
      {List<Map<String, dynamic>>? attachments}) async {}
  @override
  Future<void> sendAgentMessage(
    String text, {
    String agentType = 'envoyai',
    String? displayText,
    List<ChatAttachment>? displayAttachments,
  }) async {}
  @override
  Future<void> sendRoomMessage(String roomId, String text) async {}
  @override
  Future<void> syncRooms({NodeServiceClient? client}) async {}
  @override
  Future<void> syncTerminals() async {}
  @override
  Future<void> loadHistory(String threadId,
      {String? contactOwnerId, String? chatRoomId}) async {}
  @override
  Future<void> markRead(String threadId,
      {String? contactOwnerId}) async {}
  @override
  Future<void> createRoom(String name) async {}
  @override
  Future<void> inviteToRoom(String roomId, String ownerId) async {}
  @override
  void selectTab(int index) {
    state = state.copyWith(selectedTab: index);
  }

  @override
  Future<void> syncThreads() async {}
}

class _SeededEngageNotifier extends ContentEngageNotifier {
  _SeededEngageNotifier(Ref ref, List<ContentEngageNotification> items)
      : super(ref) {
    state = ContentEngageState(items: items);
  }
}

// -- Fake Notifiers (extend real ones, override state) --

class _FakeChatNotifier extends ChatNotifier {
  _FakeChatNotifier(List<ChatThread> threads) : super(_FakeRef()) {
    state = ChatState(threads: threads);
  }
  @override
  Future<void> loadThreads(String nodeId) async {}
  @override
  void onChatMessage(Map<String, dynamic> data) {}
  @override
  void onRoomMessage(Map<String, dynamic> data) {}
  @override
  void onBridgeStatus(Map<String, dynamic> data) {}
  @override
  Future<void> sendMessage(String targetOwnerId, String text,
      {List<Map<String, dynamic>>? attachments}) async {}
  @override
  Future<void> sendAgentMessage(
    String text, {
    String agentType = 'envoyai',
    String? displayText,
    List<ChatAttachment>? displayAttachments,
  }) async {}
  @override
  Future<void> sendRoomMessage(String roomId, String text) async {}
  @override
  Future<void> syncRooms({NodeServiceClient? client}) async {}
  @override
  Future<void> syncTerminals() async {}
  @override
  Future<void> loadHistory(String threadId,
      {String? contactOwnerId, String? chatRoomId}) async {}
  @override
  Future<void> markRead(String threadId,
      {String? contactOwnerId}) async {}
  @override
  Future<void> createRoom(String name) async {}
  @override
  Future<void> inviteToRoom(String roomId, String ownerId) async {}
  @override
  void selectTab(int index) {}
  @override
  Future<void> syncThreads() async {}
}

class _FakeContactNotifier extends ContactNotifier {
  _FakeContactNotifier(List<Contact> bonds) : super(_FakeRef()) {
    state = ContactState(bonds: bonds);
  }
  @override
  Future<void> syncBonds() async {}
  @override
  void onBondEstablished() {}
  @override
  void onBondRevoked(String ownerId) {}
  @override
  Contact? getContact(String ownerId) {
    return state.bonds.where((c) => c.ownerId == ownerId).firstOrNull;
  }
}

class _FakeNodeNotifier extends NodeNotifier {
  _FakeNodeNotifier(StoredNode node)
      : super(
          ref: _FakeRef(),
          secureStorage: _newTestSecureStorage(),
          localDb: _newTestLocalDatabase(),
        ) {
    state = NodeState(
      activeNode: node,
      pairedNodes: [node],
      connectionState: NodeConnectionState.connected,
      ownerId: node.ownerId,
      isOwnerProfile: true,
    );
  }
  @override
  HomeRemoteClient? get client => null;
  @override
  NodeServiceClient? get nodeService => null;
  @override
  Future<void> loadPairedNodes() async {}
  @override
  Future<PairResult> pairWithNode(
    PairingData data,
    String deviceName,
    List<HomeRemoteCandidate> candidates, {
    String? profileName,
    String? profileAvatarColor,
    String? profileId,
  }) async {
    throw UnimplementedError();
  }
  @override
  Future<void> connectToNode(StoredNode node) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> switchToNode(String nodeId) async {}
  @override
  Future<void> unpairNode(String nodeId) async {}
  @override
  Future<void> updatePublicAccess(
      String nodeId, String host, int port) async {}
}

class _FakeRef implements Ref {
  // Tests pass this Ref into notifiers only to satisfy constructors;
  // faked methods are no-ops. Forward unexpected access to noSuchMethod.
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

SecureStorage _newTestSecureStorage() => SecureStorage.test();
LocalDatabase _newTestLocalDatabase() => LocalDatabase.test();
