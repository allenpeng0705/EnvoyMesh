import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/content_engage_provider.dart';
import 'content_blog_tab.dart';
import 'content_explore_tab.dart';
import 'content_feed_tab.dart';
import 'content_files_tab.dart';

/// Content — Feed | Blog | Explore | My Files (mirrors Social ContentView).
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
  }

  void _onTabChanged() {
    if (_tabs.indexIsChanging) return;
    final engage = ref.read(contentEngageProvider.notifier);
    if (_tabs.index == 0) {
      engage.dismiss(surface: 'feed');
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
    final engage = ref.watch(contentEngageProvider);

    Widget tabLabel(String text, int count) {
      if (count <= 0) return Tab(text: text);
      return Tab(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text),
            const SizedBox(width: 6),
            Badge(
              label: Text(count > 99 ? '99+' : '$count'),
            ),
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
              tabLabel('Feed', engage.feedCount),
              tabLabel('Blog', engage.blogCount),
              const Tab(text: 'Explore'),
              const Tab(text: 'My Files'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: const [
              ContentFeedTab(),
              ContentBlogTab(),
              ContentExploreTab(),
              ContentFilesTab(),
            ],
          ),
        ),
      ],
    );
  }
}
