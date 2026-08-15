import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../knowledge/knowledge_nav.dart';
import '../../l10n/app_localizations.dart';
import '../../models/web_content.dart';
import '../../providers/contact_provider.dart'
    show contactProvider, nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../services/envoy_url.dart';
import '../../services/parse_public_blog_index.dart';
import '../../services/peer_blog_limits.dart';
import '../../services/web_content_markdown.dart';
import '../../utils/moments_time.dart';
import '../../widgets/content_engagement_bar.dart';
import '../../widgets/feed_media_grid.dart';
import '../browser/browser_screen.dart';
import 'content_author_screen.dart';

/// Content → Blog: own posts + compose (AI draft via ContentAuthorScreen).
/// Peer mode (Chat → Blog): paged card list from contact `blog/index.md`.
class ContentBlogTab extends ConsumerStatefulWidget {
  const ContentBlogTab({super.key});

  @override
  ConsumerState<ContentBlogTab> createState() => _ContentBlogTabState();
}

class _ContentBlogTabState extends ConsumerState<ContentBlogTab> {
  List<BlogPostSummary> _posts = const [];
  List<BlogPostSummary> _peerCatalog = const [];
  int _peerOffset = 0;
  bool _peerHasMore = false;
  bool _peerRecentOnly = false;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  Future<List<BlogPostSummary>> _enrichPage(
    dynamic client,
    List<BlogPostSummary> page,
  ) async {
    final enriched = <BlogPostSummary>[];
    for (final post in page) {
      try {
        final parsed = parseEnvoyContentUrl(post.url);
        final bodyResult = await client.libraryRead(
          targetOwnerId: parsed.targetOwnerId,
          path: parsed.path,
          timeoutMs: 20000,
        );
        if (bodyResult.status != 'ok' || bodyResult.body == null) {
          enriched.add(post);
          continue;
        }
        final images = extractEnvoyMarkdownImageUrls(bodyResult.body!);
        final preview = previewFromWebContentMarkdown(bodyResult.body!);
        enriched.add(
          post.copyWith(
            bodyPreview: preview.isNotEmpty ? preview : post.bodyPreview,
            imageUrls: images,
          ),
        );
      } catch (_) {
        enriched.add(post);
      }
    }
    return enriched;
  }

  Future<void> _reload() async {
    final client = ref.read(nodeServiceProvider);
    final peerFilter =
        ref.read(socialContentPeerOwnerIdProvider)?.trim() ?? '';
    if (client == null) {
      setState(() {
        _loading = false;
        _error = AppLocalizations.of(context).blogConnectHint;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _peerCatalog = const [];
      _peerOffset = 0;
      _peerHasMore = false;
      _peerRecentOnly = false;
    });
    try {
      if (peerFilter.isNotEmpty) {
        final result = await client.libraryRead(
          targetOwnerId: peerFilter,
          path: 'blog/',
          timeoutMs: 45000,
        );
        if (!mounted) return;
        if (result.status != 'ok' || result.body == null) {
          setState(() {
            _posts = const [];
            _loading = false;
            _error = result.error ??
                AppLocalizations.of(context).blogConnectHint;
          });
          return;
        }
        final links = parsePublicBlogIndex(result.body!);
        final catalog = [
          for (final link in links)
            BlogPostSummary(
              path: link.url,
              url: link.url,
              title: link.title,
              publishedAt: '',
              visibility: 'bonded',
              publisherOwnerId: peerFilter,
            ),
        ];
        final end = catalog.length < blogPeerPageSize
            ? catalog.length
            : blogPeerPageSize;
        final page = catalog.sublist(0, end);
        setState(() {
          _peerCatalog = catalog;
          _peerOffset = end;
          _peerHasMore = end < catalog.length;
          _peerRecentOnly = catalog.length >= blogIndexMaxPosts;
          _posts = page;
          _loading = false;
        });
        final enriched = await _enrichPage(client, page);
        if (!mounted) return;
        setState(() => _posts = enriched);
        return;
      }
      await client.ensureDefaultWebSite();
      final posts = await client.listBlogPosts();
      if (!mounted) return;
      setState(() {
        _posts = posts;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadMorePeer() async {
    if (!_peerHasMore || _loadingMore || _loading) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _loadingMore = true);
    try {
      final end = (_peerOffset + blogPeerPageSize) > _peerCatalog.length
          ? _peerCatalog.length
          : _peerOffset + blogPeerPageSize;
      final page = _peerCatalog.sublist(_peerOffset, end);
      if (page.isEmpty) {
        setState(() {
          _peerHasMore = false;
          _loadingMore = false;
        });
        return;
      }
      setState(() {
        _peerOffset = end;
        _peerHasMore = end < _peerCatalog.length;
        _posts = [..._posts, ...page];
      });
      final enriched = await _enrichPage(client, page);
      if (!mounted) return;
      setState(() {
        final byUrl = {for (final p in enriched) p.url: p};
        _posts = [
          for (final p in _posts) byUrl[p.url] ?? p,
        ];
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingMore = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _compose() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => const ContentAuthorScreen(initialTemplate: 'blog-post'),
      ),
    );
    if (changed == true && mounted) await _reload();
  }

  void _open(String url) {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => BrowserScreen(initialUrl: url)));
  }

  Future<void> _delete(BlogPostSummary post) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final l10n = AppLocalizations.of(ctx);
        return AlertDialog(
          title: Text(l10n.blogDeleteTitle),
          content: Text(l10n.blogDeleteBody(post.title)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(l10n.commonDelete),
            ),
          ],
        );
      },
    );
    if (ok != true) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.deleteWebContentEntry(path: post.path);
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final nodeState = ref.watch(nodeProvider);
    final peerFilter =
        ref.watch(socialContentPeerOwnerIdProvider)?.trim() ?? '';
    final peerMode = peerFilter.isNotEmpty;
    final locale = Localizations.localeOf(context).languageCode;
    final loadMoreLabel =
        locale == 'zh' ? '加载更早的文章' : 'Load older posts';
    final loadingMoreLabel = locale == 'zh' ? '加载中…' : 'Loading…';
    final peerHintRecent = locale == 'zh'
        ? '显示该联系人的近期文章。'
        : 'Showing recent posts from this contact.';

    ref.listen<String?>(socialContentPeerOwnerIdProvider, (prev, next) {
      if ((prev?.trim() ?? '') == (next?.trim() ?? '')) return;
      _reload();
    });

    if (nodeState.activeNode == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            l10n.blogPairHint,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _posts.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _reload, child: Text(l10n.commonRetry)),
            ],
          ),
        ),
      );
    }

    String peerName = peerFilter;
    if (peerMode) {
      final contacts = ref.read(contactProvider).bonds;
      for (final c in contacts) {
        if (c.ownerId == peerFilter) {
          final n = c.displayName?.trim();
          if (n != null && n.isNotEmpty) {
            peerName = n;
            break;
          }
        }
      }
    }

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  peerMode ? "$peerName's Blog" : l10n.blogTitle,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              if (peerMode)
                TextButton(
                  onPressed: () {
                    ref.read(socialContentPeerOwnerIdProvider.notifier).state =
                        null;
                  },
                  child: Text(l10n.blogTitle),
                )
              else
                TextButton.icon(
                  onPressed: _compose,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(l10n.contentNewPost),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            peerMode && _peerRecentOnly ? peerHintRecent : l10n.blogHint,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          if (_posts.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Column(
                children: [
                  Icon(
                    Icons.article_outlined,
                    size: 40,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    l10n.blogEmpty,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  if (peerMode)
                    FilledButton(
                      onPressed: () {
                        ref
                            .read(socialContentPeerOwnerIdProvider.notifier)
                            .state = null;
                      },
                      child: Text(l10n.blogTitle),
                    )
                  else
                    FilledButton.icon(
                      onPressed: _compose,
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: Text(l10n.contentNewPost),
                    ),
                ],
              ),
            )
          else ...[
            for (final post in _posts)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Material(
                  color: Theme.of(context).colorScheme.surfaceContainerLowest,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(
                      color: Theme.of(
                        context,
                      ).colorScheme.outlineVariant.withValues(alpha: 0.55),
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InkWell(
                          onTap: () => _open(post.url),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                post.title,
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: -0.2,
                                    ),
                              ),
                              if ((post.bodyPreview ?? '')
                                  .trim()
                                  .isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(
                                  post.bodyPreview!,
                                  maxLines: 8,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodyMedium
                                      ?.copyWith(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                        height: 1.5,
                                      ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (post.imageUrls.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          FeedMediaGrid(urls: post.imageUrls),
                        ],
                        const SizedBox(height: 4),
                        ContentEngagementBar(
                          url: post.url,
                          meta: post.publishedAt.isEmpty
                              ? null
                              : Text(
                                  formatMomentsTime(post.publishedAt),
                                  style: Theme.of(context).textTheme.labelSmall
                                      ?.copyWith(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                      ),
                                ),
                          leading: peerMode
                              ? null
                              : IconButton(
                                  tooltip: l10n.commonDelete,
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(
                                    minWidth: 28,
                                    minHeight: 28,
                                  ),
                                  icon: const Icon(
                                    Icons.delete_outline,
                                    size: 18,
                                  ),
                                  onPressed: () => _delete(post),
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (peerMode && _peerHasMore)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Center(
                  child: FilledButton.tonal(
                    onPressed: _loadingMore ? null : _loadMorePeer,
                    child: Text(_loadingMore ? loadingMoreLabel : loadMoreLabel),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}
