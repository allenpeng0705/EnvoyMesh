// Phase 45C — EnvoyGo Browser screen (thin client via home libraryRead).
//
// Design: docs/web-content-browsing-design.md §7.3.
import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/content_hash.dart';
import '../../services/envoy_url.dart';
import '../../services/library_read_fetch.dart';

/// Matches bare `envoy://…` URLs and markdown `[label](envoy://…)` links.
final _envoyLinkRe = RegExp(
  r'(?:\[([^\]]*)\]\((envoy://[^)\s]+)\)|(envoy://[^\s)\]>"]+))',
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
        _error = 'Not connected to home node — pair and reconnect first.';
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
              _error = 'Content integrity check failed — refused to render';
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
          _statusHint = result.fromCache
              ? 'Cached — ${result.contentType}, ${result.byteLength ?? 0} bytes'
              : 'Loaded — ${result.contentType}, ${result.byteLength ?? 0} bytes';
          if (pushHistory) _pushHistory(parsed.raw);
        });
      } else if (result.status == 'not_found') {
        setState(() {
          _loading = false;
          _error = 'Not found';
          _body = null;
          _statusHint = null;
        });
      } else if (result.status == 'forbidden') {
        setState(() {
          _loading = false;
          _error = 'Access denied';
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Browser'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
            child: Row(
              children: [
                IconButton(
                  tooltip: 'Back',
                  onPressed: _canGoBack ? _goBack : null,
                  icon: const Icon(Icons.arrow_back),
                ),
                IconButton(
                  tooltip: 'Forward',
                  onPressed: _canGoForward ? _goForward : null,
                  icon: const Icon(Icons.arrow_forward),
                ),
                IconButton(
                  tooltip: 'Reload',
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
                  child: const Text('Go'),
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
          'Enter an envoy:// URL to browse content served by a bonded contact.\n'
          'EnvoyGo fetches via your home node.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey,
              ),
        ),
      );
    }

    final mime = _mimeType!;
    if (_isText ||
        mime == 'text/markdown' ||
        mime == 'text/x-markdown' ||
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
        return Center(child: Text('Failed to decode image: $e'));
      }
    }

    if (mime == 'application/pdf') {
      return Center(
        child: Text(
          'PDF loaded (${_body!.length} base64 chars'
          '${_etag != null ? ', etag=$_etag' : ''}).\n'
          'Open on desktop Social Browser for inline PDF preview.',
          textAlign: TextAlign.center,
        ),
      );
    }

    return Center(
      child: Text(
        'Unsupported type: $mime (${_body!.length} chars)',
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildLinkedSelectableText(
    BuildContext context,
    String body,
    String mime,
  ) {
    _disposeLinkRecognizers();
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
