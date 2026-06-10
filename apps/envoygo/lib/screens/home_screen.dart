import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/chat_provider.dart';
import '../widgets/connection_indicator.dart';
import 'chat/chat_list_screen.dart';
import 'inbox/inbox_screen.dart';
import 'me/me_screen.dart';

/// Main scaffold with 3-tab bottom navigation: Chats, Inbox, Me.
/// Bonded contacts appear as chat threads in the Chats tab.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('EnvoyGo'),
        actions: const [
          ConnectionIndicator(),
          SizedBox(width: 12),
        ],
      ),
      body: IndexedStack(
        index: chatState.selectedTab,
        children: const [
          ChatListScreen(),
          InboxScreen(),
          MeScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: chatState.selectedTab,
        onDestinationSelected: (index) {
          ref.read(chatProvider.notifier).selectTab(index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chats',
          ),
          NavigationDestination(
            icon: Icon(Icons.inbox_outlined),
            selectedIcon: Icon(Icons.inbox),
            label: 'Inbox',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Me',
          ),
        ],
      ),
    );
  }
}
