import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';
import '../../providers/content_engage_provider.dart';
import '../../providers/feed_notify_provider.dart';
import 'content_blog_tab.dart';
import 'content_explore_tab.dart';
import 'content_feed_tab.dart';
import 'knowledge_screen.dart';

/// Content — Feed | Blog | Knowledge | People (mirrors Social ContentView order).
class ContentScreen extends ConsumerStatefulWidget {
  const ContentScreen({super.key});

  @override
  ConsumerState<ContentScreen> createState() => _ContentScreenState();
}

class _ContentScreenState extends ConsumerState<ContentScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _tabs.addListener(_onTabChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(contentSurfaceProvider.notifier).state = _tabs.index;
    });
  }

  void _onTabChanged() {
    if (_tabs.indexIsChanging) return;
    ref.read(contentSurfaceProvider.notifier).state = _tabs.index;
    final engage = ref.read(contentEngageProvider.notifier);
    if (_tabs.index == 0) {
      // Folder-open: clear likes/comments and peer feed.notify.
      engage.dismiss(surface: 'feed');
      ref.read(feedNotifyProvider.notifier).dismissAll();
    } else if (_tabs.index == 1) {
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
    final l10n = AppLocalizations.of(context);
    final engage = ref.watch(contentEngageProvider);
    final feedNotify = ref.watch(feedNotifyProvider);
    final homeTab = ref.watch(chatProvider.select((s) => s.selectedTab));
    // IndexedStack keeps this screen mounted — only dismiss while Content is shown.
    final viewingContent = homeTab == 2;
    final surface = _tabs.index;

    // Auto-dismiss Likes/Comments only (not feed.notify) while already viewing.
    ref.listen(contentEngageProvider, (prev, next) {
      if (ref.read(chatProvider).selectedTab != 2) return;
      final tab = _tabs.index;
      if (tab == 0 && next.feedCount > 0) {
        ref.read(contentEngageProvider.notifier).dismiss(surface: 'feed');
      } else if (tab == 1 && next.blogCount > 0) {
        ref.read(contentEngageProvider.notifier).dismiss(surface: 'blog');
      }
    });

    final feedEngageBadge = engage.visibleFeedCount(
      viewingContent: viewingContent,
      surfaceIndex: surface,
    );
    final feedNotifyBadge = viewingContent && surface == 0
        ? 0
        : feedNotify.unread.length;
    final feedBadge = feedEngageBadge + feedNotifyBadge;
    final blogBadge = engage.visibleBlogCount(
      viewingContent: viewingContent,
      surfaceIndex: surface,
    );

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

    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          child: TabBar(
            controller: _tabs,
            isScrollable: true,
            tabs: [
              tabLabel(l10n.contentFeed, feedBadge),
              tabLabel(l10n.contentBlog, blogBadge),
              Tab(text: l10n.contentKnowledge),
              Tab(text: l10n.contentPeople),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: const [
              ContentFeedTab(),
              ContentBlogTab(),
              KnowledgeScreen(),
              ContentExploreTab(),
            ],
          ),
        ),
      ],
    );
  }
}
