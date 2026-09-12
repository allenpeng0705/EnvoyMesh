import 'dart:async';
import 'dart:math';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../connection/phone_mesh_runtime.dart';
import '../../l10n/app_localizations.dart';
import '../../mesh/social_model_adapters.dart';
import '../../models/peer_search_result.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../providers/social_context_provider.dart';
import '../../services/feature_flags.dart';
import '../../services/product/discover_contact_code.dart';
import '../../services/product/envoy_url.dart';
import '../../services/product/node_service_client.dart';
import '../../services/product/parse_public_blog_index.dart';
import '../../services/product/people_session_cache.dart';
import '../../widgets/cross_persona_suggestions_section.dart';
import '../browser/browser_screen.dart';
import '../profile/profile_screen.dart';

const _sampleCap = 20;
const _phoneSampleTimeout = Duration(seconds: 30);
const _phoneDiscoveryReadyWait = Duration(seconds: 8);
const _webContentCapabilityTopic = 'capability:envoymesh.web-content';

/// Content → Discover: find non-bonded peers (topic / interest),
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
    // With no home node and the mobile node off, Discover cannot search at all:
    // never restore last session's people (they would look like live results).
    if (!ref.read(mobileNodeEnabledProvider) &&
        ref.read(nodeProvider).activeNode == null) {
      PeopleSessionCache.clear();
      return;
    }
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
    final exclude = <String>{};
    final socialCtx = ref.read(socialContextProvider);
    final backend = ref.read(socialBackendProvider);
    if (socialCtx.isPhone) {
      final self = backend?.ownerId.trim() ?? '';
      if (self.isNotEmpty) exclude.add(self);
      if (backend != null) {
        try {
          for (final c in await backend.getBonds()) {
            if (c.ownerId.isNotEmpty) exclude.add(c.ownerId);
          }
        } catch (_) {}
      }
      _excludeIds = exclude;
      return;
    }

    final client = ref.read(nodeServiceProvider);
    final nodeState = ref.read(nodeProvider);
    final self = nodeState.ownerId?.trim() ?? '';
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
    final topics = List<String>.from(suggestedDiscoveryTopics)..shuffle(Random());
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

  /// Plain-language headline for a phone empty search, plus the per-plane
  /// developer detail (which discovery leg answered). Without it an empty
  /// Discover cannot be told apart from "the phone never queried anything".
  String _phoneEmptyHeadline(AppLocalizations l10n) {
    final report = _lastSearchReport;
    if (report == null) return l10n.peopleNoneFound;
    final relay = report['relay'] ?? 0;
    final relays = report['relaysConfigured'] ?? 0;
    final relaysDead = relays is int && relays > 0 && relay == 0;
    return relaysDead
        ? '${l10n.peopleNoneFound}\n${l10n.peopleSearchRelayUnreachable}'
        : '${l10n.peopleNoneFound}\n${l10n.peopleSearchReportHint}';
  }

  /// Most recent per-plane search report from the phone discovery session.
  Map<String, Object?>? get _lastSearchReport {
    final backend = ref.read(socialBackendProvider);
    if (backend is! PhoneSocialBackend) return null;
    return backend.lastWanSearchReport;
  }

  /// True when the phone persona has never saved a profile: nothing but the
  /// broad `mesh.discovery` capability is advertised, so interest search cannot
  /// match this device and the empty state should offer the fix.
  bool get _phoneProfileMissing {
    final backend = ref.read(socialBackendProvider);
    return backend is PhoneSocialBackend && !backend.hasProfile;
  }

  /// `lan=0 dht=0 relay=1 relays=2 queries=3` — developer detail, shown muted.
  String? get _lastSearchReportDetail {
    final report = _lastSearchReport;
    if (report == null) return null;
    final lan = report['lan'] ?? 0;
    final dht = report['dht'] ?? 0;
    final relay = report['relay'] ?? 0;
    final relays = report['relaysConfigured'] ?? 0;
    final queries = report['queries'] ?? 0;
    return 'lan=$lan dht=$dht relay=$relay relays=$relays queries=$queries';
  }

  /// Wait until phone WAN discovery attaches (`wanSearch`), or [maxWait] elapses.
  ///
  /// Discover samples often raced session start and got local-only empties
  /// because `PhoneSocialBackend.searchPeers` returns store hits only while
  /// `wanSearch` is null.
  ///
  /// Fast path: when discovery was active within [_discoveryReadyMemoWindow],
  /// skip the wait — only a genuinely cold start should pay it.
  static const _discoveryReadyMemoWindow = Duration(minutes: 1);
  static DateTime? _lastDiscoveryReadyAt;

  bool get _phoneDiscoveryRecentlyReady {
    final at = _lastDiscoveryReadyAt;
    return at != null &&
        DateTime.now().difference(at) < _discoveryReadyMemoWindow;
  }

  Future<void> _waitForPhoneDiscoveryReady({
    Duration maxWait = _phoneDiscoveryReadyWait,
  }) async {
    // Mobile node off: there is no mesh to wait for (and no retry coming).
    if (!ref.read(mobileNodeEnabledProvider)) return;
    if (_phoneDiscoveryRecentlyReady) return;
    final deadline = DateTime.now().add(maxWait);
    while (DateTime.now().isBefore(deadline)) {
      if (!mounted) return;
      final rt = ref.read(phoneMeshRuntimeProvider);
      if (rt.discoveryActive) {
        _lastDiscoveryReadyAt = DateTime.now();
        return;
      }
      if (rt.lastError != null && rt.lastError!.isNotEmpty) return;
      await Future.delayed(const Duration(milliseconds: 250));
    }
  }

  Future<List<PeerSearchResult>> _samplePhoneMesh(
    SocialBackend backend, {
    void Function(List<PeerSearchResult> rows)? onPartial,
  }) async {
    final out = <PeerSearchResult>[];

    // 1) Broad `mesh.discovery` / empty-topic first. Most phones only
    // advertise that capability on the relay roster (default profile has no
    // interest topics). Interest slug loops used to burn the sample budget
    // and skip this query entirely.
    try {
      final all = await backend.searchPeers(maxResults: _sampleCap).timeout(
            const Duration(seconds: 15),
            onTimeout: () => const <MeshPeerHit>[],
          );
      _merge(out, _filterNonBonded(all.map(peerFromMesh).toList()));
    } catch (_) {}

    // Show the broad roster as soon as it lands instead of holding results back
    // for the slower interest probes (first paint was up to ~23s worst case).
    if (onPartial != null && out.isNotEmpty) {
      onPartial(List<PeerSearchResult>.from(out));
    }

    if (out.length >= _sampleCap) {
      out.shuffle(Random());
      return out.take(_sampleCap).toList();
    }

    // 2) Optional interest probes in parallel with a short per-call timeout.
    final topics = List<String>.from(suggestedDiscoveryTopics)..shuffle(Random());
    final slugFutures = topics.take(2).map((slug) async {
      try {
        return await backend.searchPeers(topic: slug, maxResults: 8).timeout(
              const Duration(seconds: 10),
              onTimeout: () => const <MeshPeerHit>[],
            );
      } catch (_) {
        return const <MeshPeerHit>[];
      }
    });
    final parts = await Future.wait(slugFutures);
    for (final hits in parts) {
      _merge(out, _filterNonBonded(hits.map(peerFromMesh).toList()));
    }

    out.shuffle(Random());
    return out.take(_sampleCap).toList();
  }

  Future<void> _refreshSample({bool keepExisting = false}) async {
    final socialCtx = ref.read(socialContextProvider);
    if (socialCtx.isPhone) {
      final backend = ref.read(socialBackendProvider);
      if (backend == null) {
        // Includes the mobile-node-off case: nothing local to search, so point
        // at pairing instead of an empty mesh.
        setState(() {
          _loading = false;
          _searching = false;
          _error = ref.read(mobileNodeEnabledProvider)
              ? null
              : AppLocalizations.of(context).peopleConnectHint;
          if (!keepExisting) _results = const [];
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
        await _waitForPhoneDiscoveryReady();
        if (!mounted) return;
        final rows = await _samplePhoneMesh(
          backend,
          // First paint: show the broad roster while the slower interest probes
          // are still running (keeps the busy indicator up).
          onPartial: (partial) {
            if (!mounted) return;
            final shown = List<PeerSearchResult>.from(partial)..shuffle(Random());
            setState(() {
              _results = shown.take(_sampleCap).toList();
              _fromSample = true;
              _error = null;
              _loading = false;
              _searching = true;
            });
          },
        ).timeout(
          _phoneSampleTimeout,
          onTimeout: () => const <PeerSearchResult>[],
        );
        if (!mounted) return;
        final discoveryReady =
            ref.read(phoneMeshRuntimeProvider).discoveryActive;
        if (discoveryReady) _lastDiscoveryReadyAt = DateTime.now();
        setState(() {
          _results = rows;
          _fromSample = true;
          _loading = false;
          _searching = false;
          if (rows.isNotEmpty) {
            _error = null;
          } else if (!discoveryReady) {
            _error = AppLocalizations.of(context).phoneMeshDescOffline;
          } else {
            _error = _phoneEmptyHeadline(AppLocalizations.of(context));
          }
        });
        _persistSession();
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
      return;
    }

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
    FocusManager.instance.primaryFocus?.unfocus();
    final l10n = AppLocalizations.of(context);
    final q = _queryCtrl.text.trim();
    if (q.isEmpty) {
      setState(() => _error = l10n.peopleEnterSearch);
      return;
    }
    if (_searching) return;

    // Peer ID / envoy://contact paste — same box as topic/interest.
    if (looksLikeDiscoverIdOrLink(q)) {
      await _runIdOrLinkSearch(q);
      return;
    }

    final socialCtx = ref.read(socialContextProvider);
    if (socialCtx.isPhone) {
      final backend = ref.read(socialBackendProvider);
      if (backend == null) {
        // Same as above: whether the flag is off or the persona is still
        // loading, the actionable next step is pairing.
        setState(() {
          _searching = false;
          _error = l10n.peopleConnectHint;
        });
        return;
      }
      setState(() {
        _searching = true;
        _error = null;
      });
      try {
        await _refreshExclude();
        await _waitForPhoneDiscoveryReady();
        if (!mounted) return;
        final discoveryReady =
            ref.read(phoneMeshRuntimeProvider).discoveryActive;
        if (!discoveryReady) {
          setState(() {
            _searching = false;
            _error = l10n.phoneMeshDescOffline;
          });
          return;
        }
        final List<MeshPeerHit> hits;
        if (_mode == _PeopleSearchMode.topic) {
          hits = await _searchTopicBothPlanes(
            phone: (topic, interests) => backend
                .searchPeers(topic: topic, interests: interests, maxResults: 20)
                .timeout(
                  const Duration(seconds: 15),
                  onTimeout: () => const <MeshPeerHit>[],
                ),
            q: q,
          );
        } else {
          hits = await backend
              .searchPeers(interests: [q], maxResults: 20)
              .timeout(
                const Duration(seconds: 15),
                onTimeout: () => const <MeshPeerHit>[],
              );
        }
        final filtered = _filterNonBonded(
          hits
              .map(peerFromMesh)
              .toList(),
        );
        if (!mounted) return;
        setState(() {
          _results = filtered;
          _fromSample = false;
          _searching = false;
          _error = filtered.isEmpty ? _phoneEmptyHeadline(l10n) : null;
        });
        _persistSession();
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _searching = false;
          _results = const [];
          _error = e.toString();
        });
      }
      return;
    }

    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _searching = false;
        _error = l10n.peopleConnectHint;
      });
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
        final interestHits = await client.searchPeers(topic: q, maxResults: 20);
        final publishTopic = _publishSearchTopic(q);
        final publishHits = publishTopic.isEmpty
            ? const <PeerSearchResult>[]
            : await client.searchPeers(topic: publishTopic, maxResults: 20);
        rows = _mergePeerResults(interestHits, publishHits);
      } else {
        rows = await client.searchPeers(interests: [q], maxResults: 20);
      }

      final filtered = _filterNonBonded(rows);
      if (!mounted) return;
      setState(() {
        _results = filtered;
        _fromSample = false;
        _searching = false;
        _error = filtered.isEmpty ? l10n.peopleNoneFound : null;
      });
      _persistSession();
      if (filtered.isNotEmpty) {
        await _loadBlogPreviews(client, filtered);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _results = const [];
        _error = e.toString();
      });
    }
  }

  /// Topic mode (Social parity): bare text → interest + `publish:<slug>`.
  Future<List<MeshPeerHit>> _searchTopicBothPlanes({
    required Future<List<MeshPeerHit>> Function(
      String? topic,
      List<String>? interests,
    ) phone,
    required String q,
  }) async {
    final publishTopic = _publishSearchTopic(q);
    final interestFuture = phone(q, null);
    final publishFuture = publishTopic.isEmpty
        ? Future.value(const <MeshPeerHit>[])
        : phone(publishTopic, null);
    final parts = await Future.wait([interestFuture, publishFuture]);
    return PhoneDiscoveryRuntime.mergeHits(
      [...parts[0], ...parts[1]],
      selfLibp2pPeerId: '',
      selfOwnerId: '',
      maxResults: 20,
    );
  }

  List<PeerSearchResult> _mergePeerResults(
    List<PeerSearchResult> a,
    List<PeerSearchResult> b,
  ) {
    final out = <PeerSearchResult>[];
    void addAll(List<PeerSearchResult> rows) {
      for (final r in rows) {
        if (out.any((e) =>
            (e.ownerId.isNotEmpty && e.ownerId == r.ownerId) ||
            (e.nodeId.isNotEmpty && e.nodeId == r.nodeId))) {
          continue;
        }
        out.add(r);
      }
    }

    addAll(a);
    addAll(b);
    return out;
  }

  Future<void> _runIdOrLinkSearch(String q) async {
    final l10n = AppLocalizations.of(context);
    final parsed = parseDiscoverContactCode(q);
    if (parsed is DiscoverInvalidCode) {
      setState(() {
        _searching = false;
        _results = const [];
        _error = parsed.message;
      });
      return;
    }

    setState(() {
      _searching = true;
      _error = null;
    });

    try {
      await _refreshExclude();
      String? peerId;
      String? ownerId;
      String? displayName;
      if (parsed is DiscoverPeerIdCode) {
        peerId = parsed.peerId;
      } else if (parsed is DiscoverContactCode) {
        peerId = parsed.peerId;
        ownerId = parsed.ownerId;
        displayName = parsed.displayName;
      }

      List<PeerSearchResult> rows = const [];
      final socialCtx = ref.read(socialContextProvider);
      if (socialCtx.isPhone) {
        final backend = ref.read(socialBackendProvider);
        if (backend == null) {
          setState(() {
            _searching = false;
            _error = l10n.peopleConnectHint;
          });
          return;
        }
        if (peerId != null && peerId.isNotEmpty) {
          final hits = await backend
              .searchPeers(peerId: peerId, maxResults: 5)
              .timeout(
                const Duration(seconds: 15),
                onTimeout: () => const <MeshPeerHit>[],
              );
          rows = hits
              .map(peerFromMesh)
              .toList();
        }
        if (rows.isEmpty &&
            ownerId != null &&
            ownerId.isNotEmpty &&
            !_excludeIds.contains(ownerId)) {
          rows = [
            PeerSearchResult(
              nodeId: peerId ?? '',
              ownerId: ownerId,
              displayName: displayName,
              multiaddrs: peerId != null && peerId.isNotEmpty
                  ? ['/p2p/$peerId']
                  : const [],
              profileVisibility: 'public',
            ),
          ];
        }
        // Prefer contact-card ownerId/displayName when present.
        if (ownerId != null &&
            ownerId.isNotEmpty &&
            rows.isNotEmpty &&
            (rows.first.ownerId.isEmpty ||
                rows.first.ownerId.startsWith('lan:'))) {
          final first = rows.first;
          rows = [
            PeerSearchResult(
              nodeId: first.nodeId.isNotEmpty ? first.nodeId : (peerId ?? ''),
              ownerId: ownerId,
              displayName: displayName ?? first.displayName,
              interests: first.interests,
              profileVisibility: first.profileVisibility,
              trustLevel: first.trustLevel,
              multiaddrs: first.multiaddrs.isNotEmpty
                  ? first.multiaddrs
                  : (peerId != null && peerId.isNotEmpty
                      ? ['/p2p/$peerId']
                      : const []),
              hasHopSlot: first.hasHopSlot,
            ),
            ...rows.skip(1),
          ];
        }
      } else {
        final client = ref.read(nodeServiceProvider);
        if (client == null) {
          setState(() {
            _searching = false;
            _error = l10n.peopleConnectHint;
          });
          return;
        }
        try {
          await client.runCapabilityDiscovery(find: true);
        } catch (_) {}
        if (peerId != null && peerId.isNotEmpty) {
          rows = await client.searchPeers(peerId: peerId, maxResults: 5);
        }
        if (rows.isEmpty &&
            ownerId != null &&
            ownerId.isNotEmpty &&
            !_excludeIds.contains(ownerId)) {
          rows = [
            PeerSearchResult(
              nodeId: peerId ?? '',
              ownerId: ownerId,
              displayName: displayName,
              multiaddrs: peerId != null && peerId.isNotEmpty
                  ? ['/p2p/$peerId']
                  : const [],
              profileVisibility: 'public',
            ),
          ];
        } else if (ownerId != null &&
            ownerId.isNotEmpty &&
            rows.isNotEmpty &&
            rows.first.ownerId != ownerId) {
          final first = rows.first;
          rows = [
            PeerSearchResult(
              nodeId: first.nodeId.isNotEmpty ? first.nodeId : (peerId ?? ''),
              ownerId: ownerId,
              displayName: displayName ?? first.displayName,
              interests: first.interests,
              profileVisibility: first.profileVisibility,
              trustLevel: first.trustLevel,
              multiaddrs: first.multiaddrs,
              hasHopSlot: first.hasHopSlot,
            ),
            ...rows.skip(1),
          ];
        }
      }

      final filtered = _filterNonBonded(rows);
      if (!mounted) return;
      setState(() {
        _results = filtered;
        _fromSample = false;
        _searching = false;
        _error = filtered.isEmpty ? l10n.peopleNoneFound : null;
      });
      _persistSession();
      final client = ref.read(nodeServiceProvider);
      if (client != null && filtered.isNotEmpty && !socialCtx.isPhone) {
        await _loadBlogPreviews(client, filtered);
      }
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
    if (_helloBusyId != null) return;
    final ownerId = peer.ownerId.trim();
    if (ownerId.isEmpty) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _helloBusyId = ownerId);
    try {
      final socialCtx = ref.read(socialContextProvider);
      if (socialCtx.isPhone) {
        final backend = ref.read(socialBackendProvider);
        if (backend == null) return;
        if (backend is PhoneSocialBackend) {
          await backend.rememberPeer(PhonePeerRecord(
            ownerId: ownerId,
            libp2pPeerId: peer.nodeId,
            displayName: peer.displayName,
            multiaddrs: peer.multiaddrs,
            hopFreshUntilMs: hopFreshUntilForReport(peer.hasHopSlot),
          ));
        }
        final profile = await backend.getHumanProfile() ??
            {'displayName': l10n.peopleEnvoyUser};
        await backend.sendHello(
          targetOwnerId: ownerId,
          profile: {
            'displayName':
                (profile['displayName'] as String?) ?? l10n.peopleEnvoyUser,
            'bio': (profile['bio'] as String?) ?? '',
            'interests': peer.interests,
            'whatShares': <String>[],
          },
          message: l10n.peopleHelloMessage,
        );
      } else {
        final client = ref.read(nodeServiceProvider);
        if (client == null) return;
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
            'displayName':
                (profile['displayName'] as String?) ?? l10n.peopleEnvoyUser,
            'bio': (profile['bio'] as String?) ?? '',
            'interests': [...hobbies, ...knowledge],
            'whatShares': <String>[],
          },
          message: l10n.peopleHelloMessage,
        );
      }
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
    ref.listen<PhoneMeshRuntimeState>(phoneMeshRuntimeProvider, (prev, next) {
      if (!mounted) return;
      if (!ref.read(socialContextProvider).isPhone) return;
      // First sample/search often runs before wanSearch is attached — refresh
      // when discovery becomes active if we still have nothing useful.
      final becameActive =
          (prev == null || !prev.discoveryActive) && next.discoveryActive;
      if (!becameActive) return;
      if (_results.isNotEmpty) return;
      if (_loading || _searching) {
        // In-flight work will pick up wanSearch for later legs; still
        // schedule one follow-up after it settles so a local-only first
        // leg does not leave Discover empty.
        unawaited(() async {
          while (mounted && (_loading || _searching)) {
            await Future.delayed(const Duration(milliseconds: 200));
          }
          if (!mounted || _results.isNotEmpty) return;
          if (!ref.read(socialContextProvider).isPhone) return;
          final q = _queryCtrl.text.trim();
          if (q.isNotEmpty && !_fromSample) {
            await _runSearch();
          } else {
            await _refreshSample(keepExisting: true);
          }
        }());
        return;
      }
      final q = _queryCtrl.text.trim();
      if (q.isNotEmpty && !_fromSample) {
        unawaited(_runSearch());
      } else {
        unawaited(_refreshSample(keepExisting: true));
      }
    });
    final l10n = AppLocalizations.of(context);
    final socialCtx = ref.watch(socialContextProvider);
    final nodeState = ref.watch(nodeProvider);
    if (!socialCtx.isPhone && nodeState.activeNode == null) {
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

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: RefreshIndicator(
        onRefresh: _refreshSample,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(16),
          children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.socialDiscover,
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
          const CrossPersonaSuggestionsSection(),
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
                // Keep label visible while searching (disabled FilledButton
                // fades text; spinner alone looked blank).
                onPressed: busy ? () {} : _runSearch,
                child: busy
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Theme.of(context).colorScheme.onPrimary,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(l10n.commonSearch),
                        ],
                      )
                    : Text(l10n.commonSearch),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            l10n.peopleTryTopic,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final topic in suggestedDiscoveryTopics)
                ActionChip(
                  label: Text(topic),
                  onPressed: busy
                      ? null
                      : () {
                          FocusManager.instance.primaryFocus?.unfocus();
                          setState(() {
                            _mode = _PeopleSearchMode.interest;
                            _queryCtrl.text = topic;
                          });
                          unawaited(_runSearch());
                        },
                ),
            ],
          ),
          if (busy) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(minHeight: 2),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            if (_results.isEmpty && _lastSearchReportDetail != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  // Developer detail last (AGENTS.md: headline for the user,
                  // verbose block for the developer) — a bug report can quote it.
                  _lastSearchReportDetail!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontFamily: 'monospace',
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ),
            if (_results.isEmpty && _phoneProfileMissing)
              // Interests are the discovery vocabulary: without them nobody can
              // find this phone by topic, so offer the fix right where it bites.
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ProfileScreen(startInEditMode: true),
                    ),
                  ),
                  child: Text(l10n.meEditProfile),
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
                  : (isProvisionalOwnerId(peer.ownerId)
                      ? shortPeerLabel(peer.nodeId)
                      : peer.ownerId);
              final helloSent = _outboundHellos.contains(peer.ownerId);
              // Relay-roster hits can be listed while holding no live circuit
              // hop (`hasHopSlot: false`) or with no dialable addresses: fine to
              // show, but a hello would have no transport path.
              final canSayHello = peer.dialable;
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
                        else if (!canSayHello)
                          Tooltip(
                            message: l10n.peoplePendingHopHint,
                            child: Text(
                              l10n.peoplePendingHop,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(
                                    fontStyle: FontStyle.italic,
                                    color: Theme.of(context).colorScheme.error,
                                  ),
                            ),
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
