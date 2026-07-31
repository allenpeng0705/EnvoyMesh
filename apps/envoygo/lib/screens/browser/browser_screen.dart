// Phase 45C — EnvoyGo Browser screen (thin client via home libraryRead).
//
// Design: docs/web-content-browsing-design.md §7.3.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';

import '../../providers/contact_provider.dart'
    show contactProvider, nodeServiceProvider;
import '../../providers/node_provider.dart' show nodeProvider;
import '../../services/content_hash.dart';
import '../../services/envoy_url.dart';
import '../../services/library_read_cache.dart';
import '../../services/library_read_fetch.dart';
import '../../services/visitor_placeholder.dart';

/// Matches bare `envoy://…` URLs and markdown `[label](envoy://…)` links.
final _envoyLinkRe = RegExp(
  r'(?:\[([^\]]*)\]\((envoy://[^)\s]+)\)|(envoy://[^\s)\]>"]+))',
);

/// Markdown image embeds: `![alt](envoy://…)`.
final _envoyImageRe = RegExp(r'!\[([^\]]*)\]\((envoy://[^)\s]+)\)');

/// PhotoWall wraps thumbs as `[![alt](url)](url)` — unwrap to a plain image.
final _linkedImageRe = RegExp(
  r'\[(!\[[^\]]*\]\((envoy://[^)]+)\))\]\((envoy://[^)]+)\)',
);

class BrowserScreen extends ConsumerStatefulWidget {
  /// Optional deep-link URL (e.g. from Inbox `feed.notify` → Open in Browser).
  final String? initialUrl;

  const BrowserScreen({super.key, this.initialUrl});

  @override
  ConsumerState<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends ConsumerState<BrowserScreen> {
  final _urlController = TextEditingController();
  final _history = <String>[];
  var _historyIndex = -1;
  var _navGen = 0;

  String? _parseError;
  bool _loading = false;
  String? _error;
  String? _body;
  String? _mimeType;
  bool _isText = false;
  String? _etag;
  String? _statusHint;
  final _cache = <String, BrowserFetchCacheEntry>{};
  final _linkRecognizers = <TapGestureRecognizer>[];
  /// Resolved markdown image bytes keyed by envoy:// URL.
  final _imageBytes = <String, Uint8List>{};
  final _imageFailed = <String>{};
  final _imageLoading = <String>{};

  @override
  void initState() {
    super.initState();
    final initial = widget.initialUrl?.trim();
    if (initial != null && initial.isNotEmpty) {
      _urlController.text = initial;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _navigate(initial);
      });
    }
  }

  @override
  void dispose() {
    _disposeLinkRecognizers();
    _urlController.dispose();
    super.dispose();
  }

  void _disposeLinkRecognizers() {
    for (final r in _linkRecognizers) {
      r.dispose();
    }
    _linkRecognizers.clear();
  }

  bool get _canGoBack => !_loading && _historyIndex > 0;
  bool get _canGoForward =>
      !_loading && _historyIndex >= 0 && _historyIndex < _history.length - 1;

  void _onUrlChanged(String value) {
    setState(() {
      try {
        if (value.trim().isEmpty) {
          _parseError = null;
        } else {
          parseEnvoyContentUrl(value);
          _parseError = null;
        }
      } catch (e) {
        _parseError = e is FormatException ? e.message : e.toString();
      }
    });
  }

  Future<void> _navigate(
    String rawUrl, {
    bool pushHistory = true,
    bool revalidate = false,
  }) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _error = AppLocalizations.of(context).browserPairFirst;
        _loading = false;
      });
      return;
    }

    ParsedEnvoyContentUrl parsed;
    try {
      parsed = parseEnvoyContentUrl(rawUrl);
    } catch (e) {
      setState(() {
        _parseError = e is FormatException ? e.message : e.toString();
        _error = _parseError;
      });
      return;
    }

    final gen = ++_navGen;
    setState(() {
      _urlController.text = parsed.raw;
      _loading = true;
      _error = null;
      _parseError = null;
      _statusHint = null;
      _imageBytes.clear();
      _imageFailed.clear();
      _imageLoading.clear();
    });

    final cached = _cache[parsed.raw];
    try {
      final result = await fetchLibraryContent(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) =>
            client.libraryRead(
              targetOwnerId: targetOwnerId,
              path: path,
              range: range,
              ifNoneMatch: ifNoneMatch,
              timeoutMs: timeoutMs,
            ),
        targetOwnerId: parsed.targetOwnerId,
        path: parsed.path,
        cache: cached,
        revalidate: revalidate,
      );

      if (!mounted || gen != _navGen) return;

      if (result.status == 'ok' &&
          result.body != null &&
          result.contentType != null) {
        if (!result.fromCache) {
          final ok = verifyContentHash(
            body: result.body!,
            contentType: result.contentType!,
            expectedHash: result.contentHash,
          );
          if (!ok) {
            setState(() {
              _loading = false;
              _error = AppLocalizations.of(context).browserIntegrityFailed;
              _body = null;
            });
            return;
          }
        }
        if (result.etag != null &&
            result.contentHash != null &&
            result.etag!.isNotEmpty &&
            result.contentHash!.isNotEmpty) {
          _cache[parsed.raw] = BrowserFetchCacheEntry(
            body: result.body!,
            contentType: result.contentType!,
            contentHash: result.contentHash!,
            etag: result.etag!,
            byteLength: result.byteLength ?? 0,
            isText: result.isText,
          );
        }
        setState(() {
          _loading = false;
          _body = result.body;
          _mimeType = result.contentType;
          _isText = result.isText;
          _etag = result.etag;
          _error = null;
          final l10n = AppLocalizations.of(context);
          final bytesLabel = l10n.browserBytesCount(result.byteLength ?? 0);
          _statusHint = result.fromCache
              ? '${l10n.browserCached} — ${result.contentType}, $bytesLabel'
              : '${l10n.browserLoaded} — ${result.contentType}, $bytesLabel';
          if (pushHistory) _pushHistory(parsed.raw);
        });
      } else if (result.status == 'not_found') {
        final selfOwnerId = ref.read(nodeProvider).ownerId?.trim() ?? '';
        final targetOwnerId = parsed.targetOwnerId.trim();
        // Empty self = treat as visitor (identity may not be hydrated yet).
        final remote =
            selfOwnerId.isEmpty || targetOwnerId != selfOwnerId;
        final surface = defaultWebSurfaceForPath(parsed.path);
        if (remote && surface != null) {
          String? displayName;
          for (final c in ref.read(contactProvider).bonds) {
            final name = c.displayName?.trim() ?? '';
            if (c.ownerId == targetOwnerId && name.isNotEmpty) {
              displayName = name;
              break;
            }
          }
          final body = buildVisitorPlaceholderMarkdown(
            surface: surface,
            ownerId: targetOwnerId,
            displayName: displayName,
          );
          setState(() {
            _loading = false;
            _error = null;
            _body = body;
            _mimeType = 'text/markdown';
            _isText = true;
            _etag = null;
            _statusHint =
                AppLocalizations.of(context).browserNotPublished;
            if (pushHistory) _pushHistory(parsed.raw);
          });
        } else {
          setState(() {
            _loading = false;
            _error = remote
                ? (surface != null
                    ? AppLocalizations.of(context).browserNotPublished
                    : AppLocalizations.of(context).browserNotFound)
                : AppLocalizations.of(context).browserNotFound;
            _body = null;
            _statusHint = null;
          });
        }
      } else if (result.status == 'forbidden') {
        setState(() {
          _loading = false;
          _error = AppLocalizations.of(context).browserAccessDenied;
          _body = null;
          _statusHint = null;
        });
      } else {
        setState(() {
          _loading = false;
          _error = result.error ?? result.status;
          _body = null;
          _statusHint = null;
        });
      }
    } catch (e) {
      if (!mounted || gen != _navGen) return;
      setState(() {
        _loading = false;
        _error = e.toString();
        _body = null;
        _statusHint = null;
      });
    }
  }

  void _pushHistory(String url) {
    if (_historyIndex >= 0 && _history[_historyIndex] == url) return;
    if (_historyIndex < _history.length - 1) {
      _history.removeRange(_historyIndex + 1, _history.length);
    }
    _history.add(url);
    _historyIndex = _history.length - 1;
  }

  void _goBack() {
    if (!_canGoBack) return;
    _historyIndex--;
    _navigate(_history[_historyIndex], pushHistory: false);
  }

  void _goForward() {
    if (!_canGoForward) return;
    _historyIndex++;
    _navigate(_history[_historyIndex], pushHistory: false);
  }

  void _reload() {
    final url = _urlController.text.trim();
    if (url.isEmpty || !isEnvoyContentUrl(url)) return;
    _navigate(url, pushHistory: false, revalidate: true);
  }

  @override
  Widget build(BuildContext context) {
    final canGo = !_loading &&
        _parseError == null &&
        _urlController.text.trim().isNotEmpty &&
        isEnvoyContentUrl(_urlController.text);

    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.browserTitle),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
            child: Row(
              children: [
                IconButton(
                  tooltip: l10n.browserBack,
                  onPressed: _canGoBack ? _goBack : null,
                  icon: const Icon(Icons.arrow_back),
                ),
                IconButton(
                  tooltip: l10n.browserForward,
                  onPressed: _canGoForward ? _goForward : null,
                  icon: const Icon(Icons.arrow_forward),
                ),
                IconButton(
                  tooltip: l10n.browserReload,
                  onPressed:
                      !_loading && (canGo || _body != null) ? _reload : null,
                  icon: const Icon(Icons.refresh),
                ),
                Expanded(
                  child: TextField(
                    controller: _urlController,
                    onChanged: _onUrlChanged,
                    onSubmitted: (_) {
                      if (canGo) _navigate(_urlController.text);
                    },
                    decoration: InputDecoration(
                      hintText: 'envoy://envoy:owner:…/path',
                      isDense: true,
                      border: const OutlineInputBorder(),
                      errorText: _parseError,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                FilledButton(
                  onPressed: canGo ? () => _navigate(_urlController.text) : null,
                  child: Text(l10n.browserGo),
                ),
              ],
            ),
          ),
          if (_statusHint != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  _statusHint!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                ),
              ),
            ),
          const Divider(height: 1),
          Expanded(child: _buildBody(context)),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _error!,
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ),
      );
    }
    if (_body == null || _mimeType == null) {
      return Center(
        child: Text(
          AppLocalizations.of(context).browserHint,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey,
              ),
        ),
      );
    }

    final mime = _mimeType!;
    if (mime == 'text/html' && _body!.contains('em-profile-portal')) {
      final portal = _parseProfilePortal(_body!);
      if (portal != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          if (portal.avatarUrl != null) _ensureMarkdownImage(portal.avatarUrl!);
          for (final photo in portal.photos) {
            _ensureMarkdownImage(photo.url);
          }
        });
        return _buildProfilePortal(context, portal);
      }
    }

    if (mime == 'text/markdown' || mime == 'text/x-markdown') {
      final gallery = _parsePhotoWall(_body!);
      if (gallery != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          for (final photo in gallery.photos) {
            _ensureMarkdownImage(photo.url);
          }
        });
        return _buildPhotoGallery(context, gallery.title, gallery.photos);
      }
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: _buildLinkedSelectableText(context, _body!, 'text/markdown'),
      );
    }

    if (_isText ||
        mime == 'text/plain' ||
        mime == 'text/html' ||
        mime == 'application/json') {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: _buildLinkedSelectableText(context, _body!, mime),
      );
    }

    if (mime.startsWith('image/')) {
      try {
        final bytes = base64Decode(_body!);
        return InteractiveViewer(
          child: Center(child: Image.memory(bytes)),
        );
      } catch (e) {
        return Center(child: Text(AppLocalizations.of(context).browserDecodeImageFailed('$e')));
      }
    }

    if (mime == 'application/pdf') {
      final msg = AppLocalizations.of(context).browserPdfLoaded(_body!.length);
      return Center(
        child: Text(
          _etag != null ? '$msg, etag=$_etag' : msg,
          textAlign: TextAlign.center,
        ),
      );
    }

    return Center(
      child: Text(
        AppLocalizations.of(context).browserUnsupportedType(mime),
        textAlign: TextAlign.center,
      ),
    );
  }

  /// Unwrap `[![alt](url)](url)` so image parsing sees plain `![alt](url)`.
  String _normalizeLinkedImages(String body) {
    return body.replaceAllMapped(_linkedImageRe, (match) {
      final inner = match.group(1)!;
      final imgUrl = match.group(2)!;
      final href = match.group(3)!;
      return imgUrl == href ? inner : match.group(0)!;
    });
  }

  ({
    String title,
    List<({String title, String url, String? caption})> photos,
  })? _parsePhotoWall(
    String body,
  ) {
    final normalized = _normalizeLinkedImages(body);
    final photos = <({String title, String url, String? caption})>[];
    final seen = <String>{};
    final imageRe = RegExp(
      r'(?:\[)?!\[([^\]]*)\]\((envoy://[^)\s]+)\)(?:\]\((?:envoy://[^)\s]+)\))?',
    );
    final matches = imageRe.allMatches(normalized).toList();
    if (matches.isEmpty) return null;
    for (var i = 0; i < matches.length; i++) {
      final match = matches[i];
      final url = match.group(2)!;
      if (!seen.add(url)) continue;
      final alt = (match.group(1) ?? '').trim();
      final title = alt.isEmpty ? AppLocalizations.of(context).browserPhoto : alt;
      final start = match.end;
      final end = i + 1 < matches.length ? matches[i + 1].start : normalized.length;
      final block = normalized.substring(start, end);
      final caption = _captionFromPhotoWallBlock(block, title);
      photos.add((title: title, url: url, caption: caption));
    }
    if (photos.isEmpty) return null;
    final heading = RegExp(r'^#\s+(.+)$', multiLine: true).firstMatch(body);
    return (title: heading?.group(1)?.trim() ?? AppLocalizations.of(context).browserPhotos, photos: photos);
  }

  String? _captionFromPhotoWallBlock(String block, String title) {
    final boldLink = RegExp(r'^\*\*\[[^\]]*\]\(envoy://[^)]+\)\*\*\s*$');
    final trailingLink = RegExp(r'^\]\(envoy://[^)]+\)\s*$');
    final lines = block
        .split(RegExp(r'\r?\n'))
        .map((l) => l.trim())
        .where(
          (l) =>
              l.isNotEmpty &&
              !boldLink.hasMatch(l) &&
              !trailingLink.hasMatch(l) &&
              !l.startsWith('#'),
        )
        .toList();
    final text = lines.join('\n').trim();
    if (text.isEmpty || text == title) return null;
    return text;
  }

  List<String> _chipsAfterHeading(String html, String heading) {
    final re = RegExp(
      '<h2[^>]*>\\s*$heading\\s*<\\/h2>\\s*<div class="em-chips">([\\s\\S]*?)<\\/div>',
      caseSensitive: false,
    );
    final block = re.firstMatch(html)?.group(1);
    if (block == null) return const [];
    return RegExp(r'class="em-chip"[^>]*>([^<]+)', caseSensitive: false)
        .allMatches(block)
        .map((m) => _decodeHtml(m.group(1)!.trim()))
        .where((s) => s.isNotEmpty)
        .toList();
  }

  ({
    String displayName,
    String? username,
    String? bio,
    String? avatarUrl,
    List<String> interests,
    List<String> knowledge,
    List<String> capabilities,
    List<({String title, String url, String? caption})> photos,
  })? _parseProfilePortal(String html) {
    if (!html.contains('em-profile-portal')) return null;
    final nameMatch = RegExp(r'<h1[^>]*>([^<]+)</h1>', caseSensitive: false)
        .firstMatch(html);
    final displayName = _decodeHtml(nameMatch?.group(1)?.trim() ?? 'Profile');
    final userMatch =
        RegExp(r'class="em-username"[^>]*>@?([^<]+)', caseSensitive: false)
            .firstMatch(html);
    final bioMatch =
        RegExp(r'class="em-bio"[^>]*>([\s\S]*?)</p>', caseSensitive: false)
            .firstMatch(html);
    final avatarMatch = RegExp(
      r'class="em-avatar"[^>]*src="(envoy://[^"]+)"|src="(envoy://[^"]+)"[^>]*class="em-avatar"',
      caseSensitive: false,
    ).firstMatch(html);
    final avatarUrl = avatarMatch?.group(1) ?? avatarMatch?.group(2);

    final photos = <({String title, String url, String? caption})>[];
    final seen = <String>{};
    for (final match in RegExp(
      r'class="em-mosaic__tile"[^>]*href="(envoy://[^"]+)"[\s\S]*?<img[^>]*alt="([^"]*)"',
      caseSensitive: false,
    ).allMatches(html)) {
      final url = match.group(1)!;
      if (!seen.add(url)) continue;
      final alt = _decodeHtml(match.group(2)?.trim() ?? '');
      photos.add((title: alt.isEmpty ? AppLocalizations.of(context).browserPhoto : alt, url: url, caption: null));
    }
    if (photos.isEmpty) {
      for (final match in _envoyImageRe.allMatches(html)) {
        final url = match.group(2)!;
        if (url == avatarUrl || !seen.add(url)) continue;
        final alt = (match.group(1) ?? '').trim();
        photos.add((title: alt.isEmpty ? AppLocalizations.of(context).browserPhoto : alt, url: url, caption: null));
      }
    }

    return (
      displayName: displayName,
      username: userMatch != null ? _decodeHtml(userMatch.group(1)!.trim()) : null,
      bio: bioMatch != null ? _decodeHtml(bioMatch.group(1)!.trim()) : null,
      avatarUrl: avatarUrl,
      interests: _chipsAfterHeading(html, 'Interests'),
      knowledge: _chipsAfterHeading(html, 'Knowledge'),
      capabilities: _chipsAfterHeading(html, 'Capabilities'),
      photos: photos,
    );
  }

  String _decodeHtml(String value) => value
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");

  Widget _chipSection(String label, List<String> items) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final item in items)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F1E8),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0x1F1C1917)),
                  ),
                  child: Text(item, style: const TextStyle(fontSize: 13)),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProfilePortal(
    BuildContext context,
    ({
      String displayName,
      String? username,
      String? bio,
      String? avatarUrl,
      List<String> interests,
      List<String> knowledge,
      List<String> capabilities,
      List<({String title, String url, String? caption})> photos,
    }) portal,
  ) {
    final avatarBytes =
        portal.avatarUrl != null ? _imageBytes[portal.avatarUrl!] : null;
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Container(
            width: double.infinity,
            color: const Color(0xFF2A2520),
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: const Color(0xFFC45C26),
                  backgroundImage:
                      avatarBytes != null ? MemoryImage(avatarBytes) : null,
                  child: avatarBytes == null
                      ? Text(
                          portal.displayName.isNotEmpty
                              ? portal.displayName[0].toUpperCase()
                              : '?',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        portal.displayName,
                        style: const TextStyle(
                          color: Color(0xFFFAF7F2),
                          fontSize: 28,
                          fontWeight: FontWeight.w700,
                          height: 1.1,
                        ),
                      ),
                      if (portal.username != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          '@${portal.username}',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.72),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                      if (portal.bio != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          portal.bio!,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.88),
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: _chipSection(
            AppLocalizations.of(context).browserInterests,
            portal.interests,
          ),
        ),
        SliverToBoxAdapter(
          child: _chipSection(
            AppLocalizations.of(context).browserKnowledge,
            portal.knowledge,
          ),
        ),
        SliverToBoxAdapter(
          child: _chipSection(
            AppLocalizations.of(context).browserCapabilities,
            portal.capabilities,
          ),
        ),
        if (portal.photos.isNotEmpty)
          ...[
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              sliver: SliverToBoxAdapter(
                child: Text(
                  AppLocalizations.of(context).browserPhotos,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final photo = portal.photos[index];
                    final bytes = _imageBytes[photo.url];
                    return Material(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(8),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => _openLightbox(context, portal.photos, index),
                        child: bytes != null
                            ? Image.memory(bytes, fit: BoxFit.cover)
                            : const Center(
                                child: SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                ),
                              ),
                      ),
                    );
                  },
                  childCount: portal.photos.length,
                ),
              ),
            ),
          ]
        else
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverToBoxAdapter(
              child: Text(
                AppLocalizations.of(context).browserNoPhotos,
                style: const TextStyle(fontStyle: FontStyle.italic, color: Colors.grey),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildPhotoGallery(
    BuildContext context,
    String title,
    List<({String title, String url, String? caption})> photos,
  ) {
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          sliver: SliverToBoxAdapter(
            child: Text(title, style: Theme.of(context).textTheme.headlineSmall),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                final photo = photos[index];
                final bytes = _imageBytes[photo.url];
                final label = (photo.caption?.trim().isNotEmpty ?? false)
                    ? photo.caption!.trim()
                    : photo.title;
                return Material(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _openLightbox(context, photos, index),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        bytes != null
                            ? Image.memory(bytes, fit: BoxFit.cover)
                            : _imageFailed.contains(photo.url)
                                ? Center(
                                    child: Padding(
                                      padding: const EdgeInsets.all(8),
                                      child: Text(
                                        label,
                                        textAlign: TextAlign.center,
                                        style: Theme.of(context).textTheme.bodySmall,
                                      ),
                                    ),
                                  )
                                : const Center(
                                    child: SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    ),
                                  ),
                        if (photo.caption?.trim().isNotEmpty ?? false)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: Container(
                              padding: const EdgeInsets.fromLTRB(6, 14, 6, 6),
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [Colors.transparent, Colors.black54],
                                ),
                              ),
                              child: Text(
                                photo.caption!.trim(),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  height: 1.2,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
              childCount: photos.length,
            ),
          ),
        ),
      ],
    );
  }

  void _openLightbox(
    BuildContext context,
    List<({String title, String url, String? caption})> photos,
    int index,
  ) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black87,
      builder: (dialogContext) {
        var current = index;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final photo = photos[current];
            return Dialog.fullscreen(
              backgroundColor: Colors.black,
              child: SafeArea(
                child: Stack(
                  children: [
                    Center(
                      child: FutureBuilder<Uint8List?>(
                        key: ValueKey(photo.url),
                        future: _loadImageBytes(photo.url),
                        builder: (context, snap) {
                          if (snap.connectionState != ConnectionState.done) {
                            return const CircularProgressIndicator();
                          }
                          final bytes = snap.data;
                          if (bytes == null) {
                            return Text(
                              photo.title,
                              style: const TextStyle(color: Colors.white70),
                            );
                          }
                          return InteractiveViewer(
                            child: Image.memory(bytes, fit: BoxFit.contain),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      top: 8,
                      right: 8,
                      child: IconButton(
                        icon: const Icon(Icons.close, color: Colors.white),
                        onPressed: () => Navigator.of(dialogContext).pop(),
                      ),
                    ),
                    if (photos.length > 1) ...[
                      Positioned(
                        left: 8,
                        top: 0,
                        bottom: 0,
                        child: Center(
                          child: IconButton(
                            icon: const Icon(Icons.chevron_left, color: Colors.white, size: 36),
                            onPressed: () {
                              setDialogState(() {
                                current = (current - 1 + photos.length) % photos.length;
                              });
                            },
                          ),
                        ),
                      ),
                      Positioned(
                        right: 8,
                        top: 0,
                        bottom: 0,
                        child: Center(
                          child: IconButton(
                            icon: const Icon(Icons.chevron_right, color: Colors.white, size: 36),
                            onPressed: () {
                              setDialogState(() {
                                current = (current + 1) % photos.length;
                              });
                            },
                          ),
                        ),
                      ),
                    ],
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: 16,
                      child: Text(
                        (photo.caption?.trim().isNotEmpty ?? false)
                            ? photo.caption!.trim()
                            : photo.title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<Uint8List?> _loadImageBytes(String url) async {
    final cached = _imageBytes[url];
    if (cached != null) return cached;
    if (_imageFailed.contains(url)) return null;
    final client = ref.read(nodeServiceProvider);
    if (client == null || !isEnvoyContentUrl(url)) return null;
    ParsedEnvoyContentUrl parsed;
    try {
      parsed = parseEnvoyContentUrl(url);
    } catch (_) {
      return null;
    }
    try {
      final peek = await LibraryReadCache.instance
          .peekBytes(parsed.targetOwnerId, parsed.path);
      if (peek != null) {
        if (mounted) {
          setState(() => _imageBytes[url] = peek);
        } else {
          _imageBytes[url] = peek;
        }
      }
      final result = await LibraryReadCache.instance.fetch(
        ({
          required String targetOwnerId,
          required String path,
          Map<String, int>? range,
          String? ifNoneMatch,
          int? timeoutMs,
        }) =>
            client.libraryRead(
              targetOwnerId: targetOwnerId,
              path: path,
              range: range,
              ifNoneMatch: ifNoneMatch,
              timeoutMs: timeoutMs,
            ),
        targetOwnerId: parsed.targetOwnerId,
        path: parsed.path,
      );
      if (result.status == 'ok' &&
          (result.contentType?.startsWith('image/') ?? false)) {
        final bytes = result.bytes ??
            (result.body != null ? base64Decode(result.body!) : null);
        if (bytes == null) {
          _imageFailed.add(url);
          return null;
        }
        if (mounted) {
          setState(() => _imageBytes[url] = bytes);
        } else {
          _imageBytes[url] = bytes;
        }
        return bytes;
      }
      _imageFailed.add(url);
      return null;
    } catch (_) {
      _imageFailed.add(url);
      return null;
    }
  }

  void _ensureMarkdownImage(String url) {
    if (_imageBytes.containsKey(url) ||
        _imageFailed.contains(url) ||
        _imageLoading.contains(url)) {
      return;
    }
    _imageLoading.add(url);
    () async {
      final bytes = await _loadImageBytes(url);
      if (!mounted) return;
      setState(() {
        _imageLoading.remove(url);
        if (bytes == null) _imageFailed.add(url);
      });
    }();
  }

  Widget _buildLinkedSelectableText(
    BuildContext context,
    String body,
    String mime, {
    bool resetRecognizers = true,
  }) {
    if (resetRecognizers) _disposeLinkRecognizers();
    final baseStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontFamily: mime.contains('markdown') || mime == 'text/plain'
              ? null
              : 'monospace',
        );
    final linkStyle = baseStyle?.copyWith(
      color: Theme.of(context).colorScheme.primary,
      decoration: TextDecoration.underline,
    );

    final spans = <InlineSpan>[];
    var last = 0;
    for (final match in _envoyLinkRe.allMatches(body)) {
      if (match.start > last) {
        spans.add(TextSpan(text: body.substring(last, match.start)));
      }
      final label = match.group(1);
      final mdUrl = match.group(2);
      final bareUrl = match.group(3);
      final url = mdUrl ?? bareUrl!;
      final display = (label != null && label.isNotEmpty) ? label : url;
      final recognizer = TapGestureRecognizer()
        ..onTap = () {
          if (isEnvoyContentUrl(url)) {
            _navigate(url);
          }
        };
      _linkRecognizers.add(recognizer);
      spans.add(TextSpan(
        text: display,
        style: linkStyle,
        recognizer: recognizer,
      ));
      last = match.end;
    }
    if (last < body.length) {
      spans.add(TextSpan(text: body.substring(last)));
    }

    return SelectableText.rich(
      TextSpan(style: baseStyle, children: spans),
    );
  }
}
