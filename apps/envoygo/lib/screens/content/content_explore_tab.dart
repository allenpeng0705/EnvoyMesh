import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/peer_search_result.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../services/envoy_url.dart';
import '../../services/node_service_client.dart';
import '../../services/parse_public_blog_index.dart';
import '../../services/people_session_cache.dart';
import '../browser/browser_screen.dart';

const _sampleCap = 20;
const _webContentCapabilityTopic = 'capability:envoymesh.web-content';
const _suggestedTopics = [
  'music',
  'tech',
  'art',
  'science',
  'gaming',
  'movies',
  'books',
  'travel',
  'food',
  'fitness',
  'news',
  'sports',
  'fashion',
  'photography',
  'coding',
];

/// Content → People: discover non-bonded peers (topic / interest),
/// or sample the mesh for public profiles & blogs. Say Hello to bond.
class ContentExploreTab extends ConsumerStatefulWidget {
  const ContentExploreTab({super.key});

  @override
  ConsumerState<ContentExploreTab> createState() => _ContentExploreTabState();
}

enum _PeopleSearchMode { topic, interest }

class _ContentExploreTabState extends ConsumerState<ContentExploreTab>
    with AutomaticKeepAliveClientMixin {
  _PeopleSearchMode _mode = _PeopleSearchMode.topic;
  final _queryCtrl = TextEditingController();
  List<PeerSearchResult> _results = const [];
  bool _fromSample = true;
  bool _loading = true;
  bool _searching = false;
  String? _error;
  String? _helloBusyId;
  final Set<String> _outboundHellos = {};
  Set<String> _excludeIds = {};
  /// ownerId → public blog post titles/urls from blog/index.md
  Map<String, List<PublicBlogPostLink>> _blogPreviews = {};
  bool _hadCacheOnMount = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    if (PeopleSessionCache.hasResults) {
      _hadCacheOnMount = true;
      _mode = PeopleSessionCache.mode == PeopleSearchModeCache.interest
          ? _PeopleSearchMode.interest
          : _PeopleSearchMode.topic;
      _queryCtrl.text = PeopleSessionCache.query;
      _results = PeopleSessionCache.results;
      _fromSample = PeopleSessionCache.fromSample;
      _error = PeopleSessionCache.error;
      _blogPreviews = Map.of(PeopleSessionCache.blogPreviews);
      _loading = false;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_hadCacheOnMount) {
        _refreshSample(keepExisting: true);
      } else {
        _refreshSample();
      }
    });
  }

  @override
  void dispose() {
    _queryCtrl.dispose();
    super.dispose();
  }

  Future<void> _refreshExclude() async {
    final client = ref.read(nodeServiceProvider);
    final nodeState = ref.read(nodeProvider);
    final self = nodeState.ownerId?.trim() ?? '';
    final exclude = <String>{};
    if (self.isNotEmpty) exclude.add(self);
    if (client != null) {
      try {
        final bonds = await client.getBonds();
        for (final c in filterSelfBonds(bonds, nodeState.ownerId)) {
          if (c.ownerId.isNotEmpty) exclude.add(c.ownerId);
        }
      } catch (_) {
        /* best-effort */
      }
    }
    _excludeIds = exclude;
  }

  List<PeerSearchResult> _filterNonBonded(List<PeerSearchResult> rows) {
    return rows.where((r) {
      final owner = r.ownerId.trim();
      if (owner.isEmpty || _excludeIds.contains(owner)) return false;
      if (r.nodeId.isNotEmpty && _excludeIds.contains(r.nodeId)) return false;
      if (r.trustLevel == 'direct' || r.trustLevel == 'referred') return false;
      return true;
    }).toList();
  }

  void _merge(
    List<PeerSearchResult> into,
    List<PeerSearchResult> rows,
  ) {
    for (final r in rows) {
      final owner = r.ownerId.trim();
      if (owner.isEmpty || _excludeIds.contains(owner)) continue;
      if (into.any((e) => e.ownerId == owner || e.nodeId == r.nodeId)) {
        continue;
      }
      into.add(r);
    }
  }

  Future<List<PeerSearchResult>> _sampleMesh(NodeServiceClient client) async {
    final out = <PeerSearchResult>[];
    try {
      await client.runCapabilityDiscovery(find: true);
    } catch (_) {}

    try {
      final web = await client.searchPeers(
        topic: _webContentCapabilityTopic,
        maxResults: _sampleCap,
      );
      _merge(out, _filterNonBonded(web));
    } catch (_) {}

    final profile = <String, dynamic>{};
    try {
      profile.addAll(await client.getHumanProfile());
    } catch (_) {}
    final hobbies = (profile['hobbies'] as List?)?.map((e) => e.toString()).toList() ??
        const <String>[];
    final knowledge =
        (profile['knowledge'] as List?)?.map((e) => e.toString()).toList() ??
            const <String>[];
    final hints = [...hobbies, ...knowledge]
        .map((h) => h.trim().toLowerCase())
        .where((h) => h.isNotEmpty)
        .take(3)
        .toList();
    final topics = List<String>.from(_suggestedTopics)..shuffle(Random());
    for (final slug in [...hints, ...topics.take(4)]) {
      if (out.length >= _sampleCap) break;
      try {
        final hits = await client.searchPeers(interests: [slug], maxResults: 8);
        _merge(out, _filterNonBonded(hits));
      } catch (_) {}
    }

    out.shuffle(Random());
    return out.take(_sampleCap).toList();
  }

  Future<void> _refreshSample({bool keepExisting = false}) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = AppLocalizations.of(context).peopleConnectHint;
      });
      return;
    }
    setState(() {
      if (!keepExisting) {
        _loading = true;
        _error = null;
      } else {
        _searching = true;
      }
    });
    try {
      await _refreshExclude();
      final rows = await _sampleMesh(client);
      if (!mounted) return;
      setState(() {
        _results = rows;
        _fromSample = true;
        _loading = false;
        _searching = false;
        if (rows.isEmpty) {
          _error = AppLocalizations.of(context).peopleNoneFound;
        } else if (keepExisting) {
          _error = null;
        }
      });
      _persistSession();
      await _loadBlogPreviews(client, rows);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _searching = false;
        if (!keepExisting) {
          _results = const [];
          _error = e.toString();
        }
      });
    }
  }

  void _persistSession() {
    PeopleSessionCache.save(
      mode: _mode == _PeopleSearchMode.interest
          ? PeopleSearchModeCache.interest
          : PeopleSearchModeCache.topic,
      query: _queryCtrl.text,
      results: _results,
      fromSample: _fromSample,
      error: _error,
      blogPreviews: _blogPreviews,
    );
  }

  Future<void> _runSearch() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    final q = _queryCtrl.text.trim();
    if (q.isEmpty) {
      setState(() => _error = l10n.peopleEnterSearch);
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      await _refreshExclude();
      try {
        await client.runCapabilityDiscovery(find: true);
      } catch (_) {}

      List<PeerSearchResult> rows;
      if (_mode == _PeopleSearchMode.topic) {
        final topic = _publishSearchTopic(q);
        if (topic.isEmpty) {
          setState(() {
            _searching = false;
            _error = l10n.peopleEnterSearch;
          });
          return;
        }
        rows = await client.searchPeers(topic: topic, maxResults: 20);
      } else {
        rows = await client.searchPeers(interests: [q], maxResults: 20);
      }

      var filtered = _filterNonBonded(rows);
      var fromSample = false;
      String? status;
      if (filtered.isEmpty) {
        filtered = await _sampleMesh(client);
        fromSample = true;
        status = filtered.isNotEmpty
            ? l10n.peopleNoMatches
            : l10n.peopleNoneFound;
      }
      if (!mounted) return;
      setState(() {
        _results = filtered;
        _fromSample = fromSample;
        _searching = false;
        _error = status;
      });
      _persistSession();
      await _loadBlogPreviews(client, filtered);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _results = const [];
        _error = e.toString();
      });
    }
  }

  Future<void> _sayHello(PeerSearchResult peer) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _helloBusyId != null) return;
    final ownerId = peer.ownerId.trim();
    if (ownerId.isEmpty) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _helloBusyId = ownerId);
    try {
      final profile = await client.getHumanProfile();
      final hobbies =
          (profile['hobbies'] as List?)?.map((e) => e.toString()).toList() ??
              const <String>[];
      final knowledge =
          (profile['knowledge'] as List?)?.map((e) => e.toString()).toList() ??
              const <String>[];
      await client.sendHello(
        targetOwnerId: ownerId,
        profile: {
          'displayName': (profile['displayName'] as String?) ?? l10n.peopleEnvoyUser,
          'bio': (profile['bio'] as String?) ?? '',
          'interests': [...hobbies, ...knowledge],
          'whatShares': <String>[],
        },
        message: l10n.peopleHelloMessage,
      );
      if (!mounted) return;
      setState(() {
        _outboundHellos.add(ownerId);
        _helloBusyId = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.peopleHelloSent)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _helloBusyId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _loadBlogPreviews(
    NodeServiceClient client,
    List<PeerSearchResult> rows,
  ) async {
    final next = <String, List<PublicBlogPostLink>>{};
    final owners = rows
        .map((r) => r.ownerId.trim())
        .where((id) => id.isNotEmpty)
        .take(_sampleCap)
        .toList();
    for (var i = 0; i < owners.length; i += 4) {
      if (!mounted) return;
      final batch = owners.sublist(i, min(i + 4, owners.length));
      await Future.wait(batch.map((ownerId) async {
        try {
          final res = await client.libraryRead(
            targetOwnerId: ownerId,
            path: 'blog/index.md',
            timeoutMs: 12000,
          );
          if (res.status != 'ok' || res.body == null || res.body!.isEmpty) {
            return;
          }
          final posts = parsePublicBlogIndex(res.body!).take(5).toList();
          if (posts.isNotEmpty) next[ownerId] = posts;
        } catch (_) {}
      }));
    }
    if (!mounted) return;
    setState(() => _blogPreviews = next);
    _persistSession();
  }

  void _openUrl(String url) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => BrowserScreen(initialUrl: url)),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final l10n = AppLocalizations.of(context);
    final nodeState = ref.watch(nodeProvider);
    if (nodeState.activeNode == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            l10n.peoplePairHint,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final busy = _searching;

    return RefreshIndicator(
      onRefresh: _refreshSample,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.contentPeople,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              IconButton(
                tooltip: l10n.peopleOpenLink,
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const BrowserScreen()),
                  );
                },
                icon: const Icon(Icons.link),
              ),
              IconButton(
                tooltip: l10n.commonRefresh,
                onPressed: busy ? null : _refreshSample,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          Text(
            l10n.peopleHint,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<_PeopleSearchMode>(
            segments: [
              ButtonSegment(
                value: _PeopleSearchMode.topic,
                label: Text(l10n.peopleTopic),
              ),
              ButtonSegment(
                value: _PeopleSearchMode.interest,
                label: Text(l10n.peopleInterest),
              ),
            ],
            selected: {_mode},
            onSelectionChanged: (s) {
              setState(() => _mode = s.first);
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _queryCtrl,
                  decoration: InputDecoration(
                    hintText: _mode == _PeopleSearchMode.interest
                        ? l10n.peopleInterestHint
                        : l10n.peopleTopicHint,
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _runSearch(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: busy ? null : _runSearch,
                child: Text(busy ? l10n.commonEllipsis : l10n.commonSearch),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
          const SizedBox(height: 16),
          Text(
            _fromSample ? l10n.peopleOnMesh : l10n.peopleResults,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          if (_results.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(l10n.peopleEmpty),
            )
          else
            ..._results.map((peer) {
              final name = (peer.displayName?.trim().isNotEmpty == true)
                  ? peer.displayName!.trim()
                  : peer.ownerId;
              final helloSent = _outboundHellos.contains(peer.ownerId);
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(child: Text(_initial(name))),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name),
                              if (peer.interests.isNotEmpty)
                                Text(
                                  peer.interests.take(6).join(' · '),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 4,
                      runSpacing: 0,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        TextButton(
                          onPressed: () => _openUrl(
                            webContentUrl(
                                peer.ownerId, WebContentSurface.profile),
                          ),
                          child: Text(l10n.peopleProfile),
                        ),
                        TextButton(
                          onPressed: () => _openUrl(
                            webContentUrl(
                                peer.ownerId, WebContentSurface.blog),
                          ),
                          child: Text(l10n.peopleBlog),
                        ),
                        if (helloSent)
                          Text(
                            l10n.peopleHelloSent,
                            style: Theme.of(context).textTheme.bodySmall,
                          )
                        else
                          FilledButton.tonal(
                            onPressed: _helloBusyId == peer.ownerId
                                ? null
                                : () => _sayHello(peer),
                            child: Text(l10n.peopleSayHello),
                          ),
                      ],
                    ),
                    if (_blogPreviews[peer.ownerId]?.isNotEmpty == true) ...[
                      const SizedBox(height: 4),
                      ..._blogPreviews[peer.ownerId]!.map(
                        (post) => Padding(
                          padding: const EdgeInsets.only(left: 48, top: 2),
                          child: TextButton(
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              alignment: Alignment.centerLeft,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            onPressed: () => _openUrl(post.url),
                            child: Text(post.title),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

String _publishSearchTopic(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  final rest = trimmed.toLowerCase().startsWith('publish:')
      ? trimmed.substring('publish:'.length)
      : trimmed;
  final slug = rest
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9\u4e00-\u9fff]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  return slug.isEmpty ? '' : 'publish:$slug';
}

String _initial(String value) {
  final t = value.trim();
  if (t.isEmpty) return '?';
  return t.substring(0, 1).toUpperCase();
}
