import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../navigation/owner_tabs.dart';
import '../../providers/chat_provider.dart';
import '../../providers/content_engage_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../../providers/node_provider.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/incoming_call_overlay.dart';
import 'chat/chat_list_screen.dart';
import 'content/knowledge_screen.dart';
import 'me/me_screen.dart';
import 'social/social_screen.dart';
import 'terminals/terminal_list_screen.dart';

/// Main scaffold with bottom navigation.
///
/// Owner: Social / Terminal / Knowledge / Me.
/// Family member (Phase 51E): Chats / Me only — no mesh Terminal/Knowledge.
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
    final isOwner = ref.watch(nodeProvider).isOwnerProfile;
    final maxTab = isOwner ? OwnerTabs.me : 1;
    final tab = chatState.selectedTab.clamp(0, maxTab);
    final viewingSocial = isOwner && tab == OwnerTabs.social;
    final viewingFeeds =
        viewingSocial && contentSurface == SocialSurfaces.feeds;
    final engageBadge = engage.visibleTotalCount(
      viewingContent: viewingSocial,
      surfaceIndex: contentSurface,
    );
    final feedNotifyBadge = viewingFeeds ? 0 : feedNotify.unread.length;
    final socialBadge = engageBadge + feedNotifyBadge;

    final bodyIndex = isOwner ? tab : (tab == 0 ? 0 : 1);

    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: bodyIndex,
            children: isOwner
                ? const [
                    SocialScreen(),
                    TerminalHomeScreen(),
                    KnowledgeScreen(),
                    MeScreen(),
                  ]
                : [
                    Scaffold(
                      appBar: AppBar(
                        title: Text(l10n.navChats),
                        actions: const [
                          ConnectionIndicator(),
                          SizedBox(width: 12),
                        ],
                      ),
                      body: const ChatListScreen(),
                    ),
                    const MeScreen(),
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
          // Match former Content-tab UX: opening Social clears Feed/Blog badges
          // (sub-tabs also dismiss per-surface when Feeds/Blog are selected).
          if (isOwner && index == OwnerTabs.social) {
            ref.read(contentEngageProvider.notifier).dismiss(surface: 'all');
            ref.read(feedNotifyProvider.notifier).dismissAll();
          }
        },
        destinations: [
          if (isOwner)
            NavigationDestination(
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
            )
          else
            NavigationDestination(
              icon: const Icon(Icons.chat_bubble_outline),
              selectedIcon: const Icon(Icons.chat_bubble),
              label: l10n.navChats,
            ),
          if (isOwner) ...[
            NavigationDestination(
              icon: const Icon(Icons.terminal_outlined),
              selectedIcon: const Icon(Icons.terminal),
              label: l10n.navTerminal,
            ),
            NavigationDestination(
              icon: const Icon(Icons.menu_book_outlined),
              selectedIcon: const Icon(Icons.menu_book),
              label: l10n.navKnowledge,
            ),
          ],
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: l10n.navMe,
          ),
        ],
      ),
    );
  }
}
