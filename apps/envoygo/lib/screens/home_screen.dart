import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/chat_provider.dart';
import '../providers/content_engage_provider.dart';
import '../providers/node_provider.dart';
import '../widgets/connection_indicator.dart';
import '../widgets/incoming_call_overlay.dart';
import 'chat/chat_list_screen.dart';
import 'content/content_screen.dart';
import 'inbox/inbox_screen.dart';
import 'me/me_screen.dart';

/// Main scaffold with 4-tab bottom navigation: Chats, Inbox, Content, Me.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final callProviderRef = ref.watch(callProvider);
    final engage = ref.watch(contentEngageProvider);
    final tab = chatState.selectedTab.clamp(0, 3);
    final contentBadge = engage.totalCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('EnvoyGo'),
        actions: const [
          ConnectionIndicator(),
          SizedBox(width: 12),
        ],
      ),
      body: Stack(
        children: [
          IndexedStack(
            index: tab,
            children: const [
              ChatListScreen(),
              InboxScreen(),
              ContentScreen(),
              MeScreen(),
            ],
          ),
          Positioned.fill(
            child: IncomingCallOverlay(callProvider: callProviderRef),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) {
          ref.read(chatProvider.notifier).selectTab(index);
          // Opening Content clears all engagement badges.
          if (index == 2) {
            ref.read(contentEngageProvider.notifier).dismiss(surface: 'all');
          }
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chats',
          ),
          const NavigationDestination(
            icon: Icon(Icons.inbox_outlined),
            selectedIcon: Icon(Icons.inbox),
            label: 'Inbox',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: contentBadge > 0,
              label: Text(contentBadge > 99 ? '99+' : '$contentBadge'),
              child: const Icon(Icons.language_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: contentBadge > 0,
              label: Text(contentBadge > 99 ? '99+' : '$contentBadge'),
              child: const Icon(Icons.language),
            ),
            label: 'Content',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Me',
          ),
        ],
      ),
    );
  }
}
