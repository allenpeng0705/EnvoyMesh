import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../knowledge/knowledge_nav.dart';
import '../../l10n/app_localizations.dart';
import '../../navigation/owner_tabs.dart';
import '../../providers/chat_provider.dart';
import '../../providers/content_engage_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../../widgets/connection_indicator.dart';
import '../browser/browser_screen.dart';
import '../chat/chat_list_screen.dart';
import '../content/content_blog_tab.dart';
import '../content/content_explore_tab.dart';
import '../content/content_feed_tab.dart';
import '../inbox/inbox_screen.dart';
import '../market/market_screen.dart';

/// Owner Social tab — Chats | Feed | Blog | Market | Discover | Explore (+ Inbox).
class SocialScreen extends ConsumerStatefulWidget {
  const SocialScreen({super.key});

  @override
  ConsumerState<SocialScreen> createState() => _SocialScreenState();
}

class _SocialScreenState extends ConsumerState<SocialScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 6, vsync: this);
    _tabs.addListener(_onTabChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final requested = ref.read(contentSurfaceRequestProvider);
      if (requested != null &&
          requested >= 0 &&
          requested < _tabs.length) {
        ref.read(contentSurfaceRequestProvider.notifier).state = null;
        if (_tabs.index != requested) {
          _tabs.index = requested;
        }
      }
      ref.read(contentSurfaceProvider.notifier).state = _tabs.index;
    });
  }

  void _onTabChanged() {
    if (_tabs.indexIsChanging) return;
    ref.read(contentSurfaceProvider.notifier).state = _tabs.index;
    // Leaving Feed/Blog clears contact filter (programmatic open stays on Feed/Blog).
    if (_tabs.index != SocialSurfaces.feeds &&
        _tabs.index != SocialSurfaces.blog) {
      ref.read(socialContentPeerOwnerIdProvider.notifier).state = null;
    }
    final engage = ref.read(contentEngageProvider.notifier);
    if (_tabs.index == SocialSurfaces.feeds) {
      engage.dismiss(surface: 'feed');
      ref.read(feedNotifyProvider.notifier).dismissAll();
    } else if (_tabs.index == SocialSurfaces.blog) {
      engage.dismiss(surface: 'blog');
    }
  }

  @override
  void dispose() {
    _tabs.removeListener(_onTabChanged);
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<int?>(contentSurfaceRequestProvider, (_, next) {
      if (next == null || !mounted) return;
      ref.read(contentSurfaceRequestProvider.notifier).state = null;
      if (next >= 0 && next < _tabs.length && _tabs.index != next) {
        _tabs.animateTo(next);
      }
    });

    final l10n = AppLocalizations.of(context);
    final engage = ref.watch(contentEngageProvider);
    final feedNotify = ref.watch(feedNotifyProvider);
    final homeTab = ref.watch(chatProvider.select((s) => s.selectedTab));
    final viewingSocial = homeTab == OwnerTabs.social;
    final surface = _tabs.index;
    final preferShop = ref.watch(marketPreferShopProvider);

    ref.listen(contentEngageProvider, (prev, next) {
      if (ref.read(chatProvider).selectedTab != OwnerTabs.social) return;
      final tab = _tabs.index;
      if (tab == SocialSurfaces.feeds && next.feedCount > 0) {
        ref.read(contentEngageProvider.notifier).dismiss(surface: 'feed');
      } else if (tab == SocialSurfaces.blog && next.blogCount > 0) {
        ref.read(contentEngageProvider.notifier).dismiss(surface: 'blog');
      }
    });

    final feedEngageBadge = engage.visibleFeedCount(
      viewingContent: viewingSocial,
      surfaceIndex: surface,
    );
    final feedNotifyBadge =
        viewingSocial && surface == SocialSurfaces.feeds
            ? 0
            : feedNotify.unread.length;
    final feedBadge = feedEngageBadge + feedNotifyBadge;
    final blogBadge = engage.visibleBlogCount(
      viewingContent: viewingSocial,
      surfaceIndex: surface,
    );
    final inboxBadge = feedNotify.unread.length;

    Widget tabLabel(String text, int count) {
      if (count <= 0) return Tab(text: text);
      return Tab(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text),
            const SizedBox(width: 6),
            Badge(label: Text(count > 99 ? '99+' : '$count')),
          ],
        ),
      );
    }

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
            Text(l10n.navSocial),
          ],
        ),
        actions: [
          IconButton(
            tooltip: l10n.navInbox,
            onPressed: () {
              final l10n = AppLocalizations.of(context);
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => Scaffold(
                    appBar: AppBar(title: Text(l10n.navInbox)),
                    body: const InboxScreen(),
                  ),
                ),
              );
            },
            icon: Badge(
              isLabelVisible: inboxBadge > 0,
              label: Text(inboxBadge > 99 ? '99+' : '$inboxBadge'),
              child: const Icon(Icons.inbox_outlined),
            ),
          ),
          const ConnectionIndicator(),
          const SizedBox(width: 8),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabs: [
            Tab(text: l10n.navChats),
            tabLabel(l10n.contentFeed, feedBadge),
            tabLabel(l10n.contentBlog, blogBadge),
            Tab(text: l10n.marketTitle),
            Tab(text: l10n.socialDiscover),
            Tab(text: l10n.contentExplore),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          const ChatListScreen(),
          const ContentFeedTab(),
          const ContentBlogTab(),
          MarketScreen(
            key: ValueKey('market-${preferShop ? 'shop' : 'browse'}'),
            embedded: true,
            initialPane: preferShop ? MarketPane.shop : MarketPane.browse,
          ),
          const ContentExploreTab(),
          const BrowserScreen(embedded: true),
        ],
      ),
    );
  }
}
