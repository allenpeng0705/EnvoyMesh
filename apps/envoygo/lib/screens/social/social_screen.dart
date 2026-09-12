import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../connection/phone_mesh_runtime.dart';
import '../../knowledge/knowledge_nav.dart';
import '../../l10n/app_localizations.dart';
import '../../navigation/owner_tabs.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../providers/content_engage_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../../providers/node_provider.dart';
import '../../services/feature_flags.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/phone_mesh_indicator.dart';
import '../../widgets/pair_required_panel.dart';
import '../../widgets/setup_guide_button.dart';
import '../browser/browser_screen.dart';
import '../chat/chat_list_screen.dart';
import '../content/content_blog_tab.dart';
import '../content/content_explore_tab.dart';
import '../content/content_feed_tab.dart';
import '../inbox/inbox_screen.dart';
import '../market/market_screen.dart';

/// Owner Social tab — Chats | (Feed | Blog | Market when paired) | Discover | Explore.
///
/// No global Home/phone switcher: pairing drives Feed/Blog/Market/Discover plane;
/// Chats list sections separate Home vs On this phone threads.
class SocialScreen extends ConsumerStatefulWidget {
  const SocialScreen({super.key});

  @override
  ConsumerState<SocialScreen> createState() => _SocialScreenState();
}

class _SocialScreenState extends ConsumerState<SocialScreen>
    with SingleTickerProviderStateMixin {
  TabController? _tabs;
  bool _pairedTabs = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _ensureController(ref.read(nodeProvider).activeNode != null);
      final requested = ref.read(contentSurfaceRequestProvider);
      if (requested != null) {
        ref.read(contentSurfaceRequestProvider.notifier).state = null;
        final idx = _surfaceToTabIndex(requested, paired: _pairedTabs);
        if (idx != null && _tabs != null && _tabs!.index != idx) {
          _tabs!.index = idx;
        }
      }
      _publishSurface();
      unawaitedSync();
    });
  }

  void unawaitedSync() {
    ref.read(chatProvider.notifier).syncThreads();
  }

  /// Rebuild the TabController when pairing changes. Safe to call from [build]
  /// so TabBar/TabBarView never see a length mismatch (post-frame was one frame late).
  void _ensureController(bool paired, {bool notify = true}) {
    if (_tabs != null && _pairedTabs == paired) return;
    final old = _tabs;
    final prevSurface = old == null
        ? SocialSurfaces.chats
        : _tabIndexToSurface(old.index, paired: _pairedTabs);
    old?.removeListener(_onTabChanged);
    // Defer dispose if we are mid-build; disposing during build is unsafe.
    if (old != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        old.dispose();
      });
    }
    _pairedTabs = paired;
    _tabs = TabController(length: paired ? 6 : 2, vsync: this);
    final mapped = _surfaceToTabIndex(prevSurface, paired: paired) ?? 0;
    if (mapped != 0) _tabs!.index = mapped;
    _tabs!.addListener(_onTabChanged);
    // Keep contentSurfaceProvider in sync with the remapped tab.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _publishSurface();
    });
    if (notify && mounted) setState(() {});
  }

  void _onTabChanged() {
    if (_tabs == null || _tabs!.indexIsChanging) return;
    _publishSurface();
    final surface = _tabIndexToSurface(_tabs!.index, paired: _pairedTabs);
    if (surface != SocialSurfaces.feeds && surface != SocialSurfaces.blog) {
      ref.read(socialContentPeerOwnerIdProvider.notifier).state = null;
    }
    final engage = ref.read(contentEngageProvider.notifier);
    if (surface == SocialSurfaces.feeds) {
      engage.dismiss(surface: 'feed');
      ref.read(feedNotifyProvider.notifier).dismissAll();
    } else if (surface == SocialSurfaces.blog) {
      engage.dismiss(surface: 'blog');
    }
  }

  void _publishSurface() {
    if (_tabs == null) return;
    final surface = _tabIndexToSurface(_tabs!.index, paired: _pairedTabs);
    ref.read(contentSurfaceProvider.notifier).state = surface;
  }

  static int _tabIndexToSurface(int tab, {required bool paired}) {
    if (!paired) {
      return tab == 0 ? SocialSurfaces.chats : SocialSurfaces.discover;
    }
    return tab;
  }

  static int? _surfaceToTabIndex(int surface, {required bool paired}) {
    if (!paired) {
      if (surface == SocialSurfaces.chats) return 0;
      if (surface == SocialSurfaces.discover) return 1;
      return null;
    }
    if (surface >= 0 && surface <= SocialSurfaces.explore) return surface;
    return null;
  }

  @override
  void dispose() {
    _tabs?.removeListener(_onTabChanged);
    _tabs?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(socialContextContactSyncProvider);
    ref.watch(socialContextChatSyncProvider);
    ref.watch(socialBackendEventsProvider);
    ref.watch(phoneMeshKeepAliveProvider);

    final paired = ref.watch(nodeProvider.select((s) => s.activeNode != null));
    final mobileNodeEnabled = ref.watch(mobileNodeEnabledProvider);
    // Unpaired with the mobile node off: every Social surface needs the home
    // node (chat, feed, blog, market, Discover), so show one honest pairing
    // surface instead of a row of tabs that cannot load anything. The mobile
    // node flag keeps the two-tab (Chat + Discover) mesh experience alive.
    final pairOnly = !paired && !mobileNodeEnabled;
    if (pairOnly) {
      return const _SocialPairOnlyScreen();
    }
    // Sync before TabBar/TabBarView so length always matches [paired].
    if (_tabs == null || _pairedTabs != paired) {
      _ensureController(paired, notify: false);
    }

    ref.listen<int?>(contentSurfaceRequestProvider, (_, next) {
      if (next == null || !mounted || _tabs == null) return;
      ref.read(contentSurfaceRequestProvider.notifier).state = null;
      final idx = _surfaceToTabIndex(next, paired: _pairedTabs);
      if (idx != null && _tabs!.index != idx) {
        _tabs!.animateTo(idx);
      }
    });

    final l10n = AppLocalizations.of(context);
    final engage = ref.watch(contentEngageProvider);
    final feedNotify = ref.watch(feedNotifyProvider);
    final homeTab = ref.watch(chatProvider.select((s) => s.selectedTabId));
    final viewingSocial = homeTab == OwnerTabs.social;
    final surface = _tabs == null
        ? SocialSurfaces.chats
        : _tabIndexToSurface(_tabs!.index, paired: _pairedTabs);
    final preferShop = ref.watch(marketPreferShopProvider);

    ref.listen(contentEngageProvider, (prev, next) {
      if (ref.read(chatProvider).selectedTabId != OwnerTabs.social) return;
      if (surface == SocialSurfaces.feeds && next.feedCount > 0) {
        ref.read(contentEngageProvider.notifier).dismiss(surface: 'feed');
      } else if (surface == SocialSurfaces.blog && next.blogCount > 0) {
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

    final controller = _tabs;
    if (controller == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
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
            visualDensity: VisualDensity.standard,
            padding: const EdgeInsets.all(8),
            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
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
              child: Icon(
                inboxBadge > 0
                    ? Icons.mark_email_unread_outlined
                    : Icons.mail_outline,
                size: 22,
              ),
            ),
          ),
          const ConnectionIndicator(),
          const SetupGuideButton(),
          const PhoneMeshIndicator(),
          const SizedBox(width: 4),
        ],
        bottom: TabBar(
          controller: controller,
          isScrollable: true,
          tabs: paired
              ? [
                  Tab(text: l10n.navChats),
                  tabLabel(l10n.contentFeed, feedBadge),
                  tabLabel(l10n.contentBlog, blogBadge),
                  Tab(text: l10n.marketTitle),
                  Tab(text: l10n.socialDiscover),
                  Tab(text: l10n.contentExplore),
                ]
              : [
                  Tab(text: l10n.navChats),
                  Tab(text: l10n.socialDiscover),
                ],
        ),
      ),
      body: TabBarView(
        controller: controller,
        children: paired
            ? [
                const ChatListScreen(),
                const ContentFeedTab(),
                const ContentBlogTab(),
                MarketScreen(
                  key: ValueKey('market-${preferShop ? 'shop' : 'browse'}'),
                  embedded: true,
                  initialPane:
                      preferShop ? MarketPane.shop : MarketPane.browse,
                ),
                const ContentExploreTab(),
                const BrowserScreen(embedded: true),
              ]
            : const [
                ChatListScreen(),
                ContentExploreTab(),
              ],
      ),
    );
  }
}


/// Unpaired + mobile node off: nothing in Social can load without a home node.
class _SocialPairOnlyScreen extends ConsumerWidget {
  const _SocialPairOnlyScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

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
        actions: const [SetupGuideButton()],
      ),
      body: const PairRequiredPanel(icon: Icons.link_off_outlined),
    );
  }
}
