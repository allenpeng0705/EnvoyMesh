import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/feed_notification.dart';
import '../../models/web_content.dart';
import '../../providers/contact_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../../providers/node_provider.dart';
import '../../utils/moments_time.dart';
import '../../widgets/content_engagement_bar.dart';
import '../../widgets/feed_media_grid.dart';
import '../../widgets/profile_avatar.dart';
import '../profile/profile_screen.dart';
import 'feed_compose_screen.dart';

class _TimelineItem {
  final String key;
  final String publisherOwnerId;
  final String title;
  final String? body;
  final String url;
  final String? path;
  final bool isOwn;
  final String publishedAt;
  final List<String> imageUrls;

  const _TimelineItem({
    required this.key,
    required this.publisherOwnerId,
    required this.title,
    this.body,
    required this.url,
    this.path,
    this.isOwn = false,
    required this.publishedAt,
    required this.imageUrls,
  });
}

/// Content → Feed: own posts + bonded contacts' feed.notify of kind `feed`.
class ContentFeedTab extends ConsumerStatefulWidget {
  const ContentFeedTab({super.key});

  @override
  ConsumerState<ContentFeedTab> createState() => _ContentFeedTabState();
}

class _ContentFeedTabState extends ConsumerState<ContentFeedTab> {
  List<FeedPostSummary> _own = const [];
  bool _loading = false;
  String? _error;
  String? _selfDisplayName;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refresh();
      ref.read(feedNotifyProvider.notifier).refresh();
      _loadSelfProfile();
    });
  }

  Future<void> _loadSelfProfile() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final profile = await client.getHumanProfile();
      final name = (profile['displayName'] as String?)?.trim();
      if (!mounted) return;
      if (name != null && name.isNotEmpty) {
        setState(() => _selfDisplayName = name);
      }
    } catch (_) {
      /* best-effort */
    }
  }

  Future<void> _refresh() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _error = 'Not connected to home node');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final posts = await client.listFeedPosts();
      if (!mounted) return;
      setState(() => _own = posts);
      await ref.read(feedNotifyProvider.notifier).refresh();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _nameFor(String ownerId, {bool isOwn = false}) {
    final selfId = ref.read(nodeProvider).ownerId?.trim();
    if (isOwn || (selfId != null && ownerId == selfId)) {
      final name = _selfDisplayName?.trim();
      if (name != null && name.isNotEmpty) return name;
      return 'You';
    }
    final contacts = ref.read(contactProvider).bonds;
    for (final c in contacts) {
      if (c.ownerId == ownerId) {
        final name = c.displayName?.trim();
        if (name != null && name.isNotEmpty) return name;
      }
    }
    final short = ownerId.replaceFirst('envoy:owner:', '');
    if (short.length <= 16) return short;
    return '${short.substring(0, 16)}…';
  }

  List<_TimelineItem> _buildTimeline(List<FeedNotification> notes) {
    final bonded = <String>{};
    for (final c in ref.read(contactProvider).bonds) {
      bonded.add(c.ownerId);
    }
    final items = <_TimelineItem>[];
    for (final p in _own) {
      items.add(_TimelineItem(
        key: 'own:${p.path}',
        publisherOwnerId: p.publisherOwnerId,
        title: p.title,
        body: p.bodyPreview ?? p.summary,
        url: p.url,
        path: p.path,
        isOwn: true,
        publishedAt: p.publishedAt,
        imageUrls: p.imageUrls,
      ));
    }
    for (final n in notes) {
      if (n.kind != 'feed' && !n.url.contains('/feeds/')) continue;
      if (!bonded.contains(n.publisherOwnerId)) continue;
      if (_own.any((p) => p.url == n.url)) continue;
      items.add(_TimelineItem(
        key: 'peer:${n.id}',
        publisherOwnerId: n.publisherOwnerId,
        title: n.title,
        body: n.summary,
        url: n.url,
        publishedAt: n.publishedAt.isNotEmpty ? n.publishedAt : n.receivedAt,
        imageUrls: const [],
      ));
    }
    items.sort((a, b) => b.publishedAt.compareTo(a.publishedAt));
    return items;
  }

  Future<void> _openCompose() async {
    await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const FeedComposeScreen()),
    );
    if (!mounted) return;
    await _refresh();
  }

  Future<void> _deleteOwnPost(String path) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete post?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.deleteWebContentEntry(path: path);
      if (!mounted) return;
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Widget _avatar(BuildContext context, _TimelineItem item, String name) {
    final selfId = ref.read(nodeProvider).ownerId?.trim();
    final isSelf = item.isOwn ||
        (selfId != null && item.publisherOwnerId == selfId);
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ProfileScreen(
              ownerId: isSelf ? null : item.publisherOwnerId,
            ),
          ),
        );
      },
      child: ProfileAvatar(
        ownerId: item.publisherOwnerId,
        displayName: name,
        radius: 22,
        isSelf: isSelf,
      ),
    );
  }

  Widget _emptyState(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [scheme.primary, scheme.tertiary],
                ),
                boxShadow: [
                  BoxShadow(
                    color: scheme.primary.withValues(alpha: 0.28),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Your circle is quiet',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'No posts yet. Share an update with your bonded contacts.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _openCompose,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('New post'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _feedCard(BuildContext context, _TimelineItem item) {
    final scheme = Theme.of(context).colorScheme;
    final name = _nameFor(item.publisherOwnerId, isOwn: item.isOwn);
    final body = item.body?.trim();

    return Material(
      color: scheme.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.55)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _avatar(context, item, name),
                const SizedBox(width: 12),
                Expanded(
                  child: GestureDetector(
                    onTap: () {
                      final selfId = ref.read(nodeProvider).ownerId?.trim();
                      final isSelf = item.isOwn ||
                          (selfId != null && item.publisherOwnerId == selfId);
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ProfileScreen(
                            ownerId: isSelf ? null : item.publisherOwnerId,
                          ),
                        ),
                      );
                    },
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (body != null && body.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                body,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      height: 1.45,
                    ),
              ),
            ],
            if (item.imageUrls.isNotEmpty) ...[
              const SizedBox(height: 12),
              FeedMediaGrid(urls: item.imageUrls),
            ],
            const SizedBox(height: 8),
            ContentEngagementBar(
              url: item.url,
              meta: Text(
                formatMomentsTime(item.publishedAt),
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
              leading: item.isOwn && item.path != null
                  ? IconButton(
                      tooltip: 'Delete',
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                      icon: Icon(Icons.delete_outline, size: 18, color: scheme.onSurfaceVariant),
                      onPressed: () => _deleteOwnPost(item.path!),
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(feedNotifyProvider);
    final timeline = _buildTimeline(feedState.items);
    final scheme = Theme.of(context).colorScheme;

    return Stack(
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                scheme.primary.withValues(alpha: 0.07),
                scheme.surface,
              ],
              stops: const [0, 0.28],
            ),
          ),
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Feed',
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.4,
                              ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Updates from you and bonded contacts.',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: scheme.errorContainer,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              _error!,
                              style: TextStyle(color: scheme.onErrorContainer),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (_loading && timeline.isEmpty)
                  const SliverFillRemaining(
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (timeline.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _emptyState(context),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                    sliver: SliverList.separated(
                      itemCount: timeline.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) => _feedCard(context, timeline[index]),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 96)),
              ],
            ),
          ),
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.extended(
            onPressed: _openCompose,
            tooltip: 'New Feed post',
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Post'),
          ),
        ),
      ],
    );
  }
}
