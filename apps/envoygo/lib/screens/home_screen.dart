import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../navigation/owner_tabs.dart';
import '../../providers/call_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/content_engage_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../../providers/node_provider.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/incoming_call_overlay.dart';
import 'chat/chat_list_screen.dart';
import 'coding/coding_home_screen.dart';
import 'content/knowledge_screen.dart';
import 'me/me_screen.dart';
import 'social/social_screen.dart';
import 'terminals/terminal_list_screen.dart';

/// Main scaffold with bottom navigation (tab **ids**, not shared int indices).
///
/// Owner: Social / Coding / Knowledge / Terminal / Me.
/// Family+coding: Chats / Coding / Me.
/// Family−coding: Chats / Me.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final chatState = ref.watch(chatProvider);
    final callProviderRef = ref.watch(callProvider);
    final engage = ref.watch(contentEngageProvider);
    final feedNotify = ref.watch(feedNotifyProvider);
    final contentSurface = ref.watch(contentSurfaceProvider);
    final node = ref.watch(nodeProvider);
    final isOwner = node.isOwnerProfile;
    final mayUseCoding = node.mayUseCoding;
    final tabs = buildHomeTabIds(isOwner: isOwner, mayUseCoding: mayUseCoding);
    final selectedId = resolveHomeTabId(
      chatState.selectedTabId,
      tabs,
      fallback: fallbackHomeTabId(isOwner: isOwner),
    );
    final tabIndex = tabs.indexOf(selectedId).clamp(0, tabs.length - 1);
    final viewingSocial = isOwner && selectedId == HomeTabId.social;
    final viewingFeeds =
        viewingSocial && contentSurface == SocialSurfaces.feeds;
    final engageBadge = engage.visibleTotalCount(
      viewingContent: viewingSocial,
      surfaceIndex: contentSurface,
    );
    final feedNotifyBadge = viewingFeeds ? 0 : feedNotify.unread.length;
    final socialBadge = engageBadge + feedNotifyBadge;

    final bodies = <Widget>[
      for (final id in tabs) _bodyForTab(id, l10n),
    ];

    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: tabIndex,
            children: bodies,
          ),
          Positioned.fill(
            child: IncomingCallOverlay(callProvider: callProviderRef),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tabIndex,
        onDestinationSelected: (index) {
          final id = tabs[index];
          ref.read(chatProvider.notifier).selectTab(id);
          if (id == HomeTabId.social) {
            ref.read(contentEngageProvider.notifier).dismiss(surface: 'all');
            ref.read(feedNotifyProvider.notifier).dismissAll();
          }
        },
        destinations: [
          for (final id in tabs) _destinationForTab(id, l10n, socialBadge),
        ],
      ),
    );
  }

  Widget _bodyForTab(String id, AppLocalizations l10n) {
    switch (id) {
      case HomeTabId.social:
        return const SocialScreen();
      case HomeTabId.chats:
        return Scaffold(
          appBar: AppBar(
            title: Text(l10n.navChats),
            actions: const [
              ConnectionIndicator(),
              SizedBox(width: 12),
            ],
          ),
          body: const ChatListScreen(),
        );
      case HomeTabId.coding:
        return const CodingHomeScreen();
      case HomeTabId.knowledge:
        return const KnowledgeScreen();
      case HomeTabId.terminal:
        return const TerminalHomeScreen();
      case HomeTabId.me:
        return const MeScreen();
      default:
        return const SizedBox.shrink();
    }
  }

  NavigationDestination _destinationForTab(
    String id,
    AppLocalizations l10n,
    int socialBadge,
  ) {
    switch (id) {
      case HomeTabId.social:
        return NavigationDestination(
          icon: Badge(
            isLabelVisible: socialBadge > 0,
            label: Text(socialBadge > 99 ? '99+' : '$socialBadge'),
            child: const Icon(Icons.groups_outlined),
          ),
          selectedIcon: Badge(
            isLabelVisible: socialBadge > 0,
            label: Text(socialBadge > 99 ? '99+' : '$socialBadge'),
            child: const Icon(Icons.groups),
          ),
          label: l10n.navSocial,
        );
      case HomeTabId.chats:
        return NavigationDestination(
          icon: const Icon(Icons.chat_bubble_outline),
          selectedIcon: const Icon(Icons.chat_bubble),
          label: l10n.navChats,
        );
      case HomeTabId.coding:
        return NavigationDestination(
          icon: const Icon(Icons.code_outlined),
          selectedIcon: const Icon(Icons.code),
          label: l10n.navCoding,
        );
      case HomeTabId.knowledge:
        return NavigationDestination(
          icon: const Icon(Icons.menu_book_outlined),
          selectedIcon: const Icon(Icons.menu_book),
          label: l10n.navKnowledge,
        );
      case HomeTabId.terminal:
        return NavigationDestination(
          icon: const Icon(Icons.terminal_outlined),
          selectedIcon: const Icon(Icons.terminal),
          label: l10n.navTerminal,
        );
      case HomeTabId.me:
        return NavigationDestination(
          icon: const Icon(Icons.person_outline),
          selectedIcon: const Icon(Icons.person),
          label: l10n.navMe,
        );
      default:
        return NavigationDestination(
          icon: const Icon(Icons.circle_outlined),
          label: id,
        );
    }
  }
}
