import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';
import '../../providers/content_engage_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../../providers/node_provider.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/incoming_call_overlay.dart';
import 'chat/chat_list_screen.dart';
import 'content/content_screen.dart';
import 'inbox/inbox_screen.dart';
import 'me/me_screen.dart';

/// Main scaffold with bottom navigation.
///
/// Owner: Chats / Inbox / Content / Me.
/// Family member (Phase 51E): Chats / Me only — no mesh Inbox/Content.
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
    final maxTab = isOwner ? 3 : 1;
    final tab = chatState.selectedTab.clamp(0, maxTab);
    final viewingContent = isOwner && tab == 2;
    final viewingFeed = viewingContent && contentSurface == 0;
    final engageBadge = engage.visibleTotalCount(
      viewingContent: viewingContent,
      surfaceIndex: contentSurface,
    );
    final feedNotifyBadge = viewingFeed ? 0 : feedNotify.unread.length;
    final contentBadge = engageBadge + feedNotifyBadge;

    final bodyIndex = isOwner ? tab : (tab == 0 ? 0 : 1);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset(
                'assets/logo.png',
                width: 28,
                height: 28,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.medium,
              ),
            ),
            const SizedBox(width: 10),
            Text(l10n.appTitle),
          ],
        ),
        actions: const [ConnectionIndicator(), SizedBox(width: 12)],
      ),
      body: Stack(
        children: [
          IndexedStack(
            index: bodyIndex,
            children: isOwner
                ? const [
                    ChatListScreen(),
                    InboxScreen(),
                    ContentScreen(),
                    MeScreen(),
                  ]
                : const [ChatListScreen(), MeScreen()],
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
          if (isOwner && index == 2) {
            ref.read(contentEngageProvider.notifier).dismiss(surface: 'all');
            ref.read(feedNotifyProvider.notifier).dismissAll();
          }
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.chat_bubble_outline),
            selectedIcon: const Icon(Icons.chat_bubble),
            label: l10n.navChats,
          ),
          if (isOwner) ...[
            NavigationDestination(
              icon: const Icon(Icons.inbox_outlined),
              selectedIcon: const Icon(Icons.inbox),
              label: l10n.navInbox,
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
              label: l10n.navContent,
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
