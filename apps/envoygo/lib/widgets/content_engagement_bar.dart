import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/contact.dart';
import '../models/web_content.dart';
import '../providers/contact_provider.dart' show contactProvider, nodeServiceProvider;
import '../providers/node_provider.dart';
import '../services/library_read_cache.dart';

/// WeChat Moments–style stars + comments for Feed/Blog (parity with Social).
class ContentEngagementBar extends ConsumerStatefulWidget {
  final String url;
  final Widget? leading;
  final Widget? meta;

  const ContentEngagementBar({
    super.key,
    required this.url,
    this.leading,
    this.meta,
  });

  @override
  ConsumerState<ContentEngagementBar> createState() =>
      _ContentEngagementBarState();
}

class _ContentEngagementBarState extends ConsumerState<ContentEngagementBar> {
  ContentEngagementSummary? _summary;
  bool _busy = false;
  bool _menuOpen = false;
  bool _composeOpen = false;
  final _draft = TextEditingController();
  final _composeFocus = FocusNode();
  final Map<String, Uint8List?> _thumbCache = {};
  void Function()? _unsubEngage;

  static const _momentsBlue = Color(0xFF3D547D);
  static const _momentsBlueDark = Color(0xFF9DB0DC);
  static const _popoverBg = Color(0xFF4C4C4C);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refresh();
      Future<void>.delayed(const Duration(milliseconds: 1800), _refresh);
      _subscribeEngage();
    });
  }

  void _subscribeEngage() {
    _unsubEngage?.call();
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    _unsubEngage = client.on('content:engage', (data) {
      if (data is! Map) return;
      final url = data['url']?.toString();
      if (url != null && url == widget.url) {
        unawaited(_refresh());
      }
    });
  }

  @override
  void didUpdateWidget(covariant ContentEngagementBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      unawaited(_refresh());
    }
  }

  @override
  void dispose() {
    _unsubEngage?.call();
    _draft.dispose();
    _composeFocus.dispose();
    super.dispose();
  }

  String? get _selfOwnerId => ref.read(nodeProvider).ownerId?.trim();

  String? get _contentOwnerId {
    final m = RegExp(r'^envoy://(envoy:owner:[^/]+)/').firstMatch(widget.url.trim());
    return m?.group(1);
  }

  String _nameFor(String ownerId, List<Contact> bonds) {
    final self = _selfOwnerId;
    if (self != null && ownerId == self) return 'You';
    for (final c in bonds) {
      if (c.ownerId == ownerId) {
        final name = c.displayName?.trim();
        if (name != null && name.isNotEmpty) return name;
        break;
      }
    }
    return ownerId.replaceFirst('envoy:owner:', '');
  }

  Future<void> _ensureThumb(String ownerId) async {
    if (_thumbCache.containsKey(ownerId)) return;
    final fromDisk = await LibraryReadCache.instance.peekBlob(peerThumbCacheKey(ownerId));
    if (fromDisk != null) {
      _thumbCache[ownerId] = fromDisk;
      if (mounted) setState(() {});
      return;
    }
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      _thumbCache[ownerId] = null;
      return;
    }
    try {
      final row = await client.getPeerProfile(ownerId);
      final b64 = row['thumbnailContentBase64'] as String?;
      if (b64 == null || b64.isEmpty) {
        _thumbCache[ownerId] = null;
      } else {
        final bytes = base64Decode(b64);
        _thumbCache[ownerId] = bytes;
        await LibraryReadCache.instance.putBlob(
          peerThumbCacheKey(ownerId),
          bytes,
          contentType: 'image/jpeg',
        );
      }
    } catch (_) {
      _thumbCache[ownerId] = null;
    }
    if (mounted) setState(() {});
  }

  Future<void> _refresh() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || widget.url.trim().isEmpty) return;
    try {
      final next = await client.getContentEngagement(url: widget.url);
      if (!mounted) return;
      setState(() => _summary = next);
      for (final id in next.starOwnerIds) {
        unawaited(_ensureThumb(id));
      }
      for (final c in next.comments) {
        unawaited(_ensureThumb(c.authorOwnerId));
      }
    } catch (_) {
      /* best-effort */
    }
  }

  Future<void> _toggleStar() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _busy) return;
    setState(() {
      _busy = true;
      _menuOpen = false;
    });
    try {
      final next = await client.toggleContentStar(url: widget.url);
      if (!mounted) return;
      setState(() => _summary = next);
      for (final id in next.starOwnerIds) {
        unawaited(_ensureThumb(id));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openCompose() {
    setState(() {
      _menuOpen = false;
      _composeOpen = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _composeFocus.requestFocus();
    });
  }

  Future<void> _sendComment() async {
    final text = _draft.text.trim();
    final client = ref.read(nodeServiceProvider);
    if (client == null || text.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final next = await client.addContentComment(url: widget.url, text: text);
      if (!mounted) return;
      setState(() {
        _summary = next;
        _draft.clear();
        _composeOpen = false;
      });
      for (final c in next.comments) {
        unawaited(_ensureThumb(c.authorOwnerId));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeComment(String commentId) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _busy) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove comment?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final next = await client.removeContentComment(
        url: widget.url,
        commentId: commentId,
      );
      if (!mounted) return;
      setState(() => _summary = next);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _actorAvatar(String ownerId, String label, Color accent) {
    final bytes = _thumbCache[ownerId];
    final initial = label.trim().isEmpty ? '?' : label.trim()[0].toUpperCase();
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: SizedBox(
        width: 22,
        height: 22,
        child: bytes != null
            ? Image.memory(bytes, fit: BoxFit.cover)
            : ColoredBox(
                color: accent.withValues(alpha: 0.22),
                child: Center(
                  child: Text(
                    initial,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: accent,
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = isDark ? _momentsBlueDark : _momentsBlue;
    final bonds = ref.watch(contactProvider).bonds;
    final starred = _summary?.starredByMe ?? false;
    final starOwnerIds = _summary?.starOwnerIds ?? const <String>[];
    final comments = _summary?.comments ?? const <ContentEngagementComment>[];
    final hasEngagement = starOwnerIds.isNotEmpty || comments.isNotEmpty;
    final selfId = _selfOwnerId;
    final postAuthorId = _contentOwnerId;
    final momentsBg = Color.alphaBlend(
      scheme.onSurface.withValues(alpha: 0.08),
      scheme.surface,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (widget.meta != null) widget.meta!,
            if (widget.leading != null) ...[
              const SizedBox(width: 2),
              widget.leading!,
            ],
            const Spacer(),
            Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.centerRight,
              children: [
                if (_menuOpen)
                  Positioned(
                    right: 40,
                    child: Material(
                      color: _popoverBg,
                      borderRadius: BorderRadius.circular(4),
                      elevation: 4,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton.icon(
                            onPressed: _busy ? null : _toggleStar,
                            icon: Icon(
                              Icons.favorite_border_rounded,
                              size: 18,
                              color: starred ? const Color(0xFFE86A6A) : Colors.white,
                            ),
                            label: Text(
                              starred ? 'Unlike' : 'Like',
                              style: TextStyle(
                                color: starred ? const Color(0xFFE86A6A) : Colors.white,
                                fontSize: 13,
                              ),
                            ),
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              minimumSize: const Size(0, 36),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              iconColor: starred ? const Color(0xFFE86A6A) : Colors.white,
                            ),
                          ),
                          Container(width: 1, height: 18, color: Colors.white24),
                          TextButton.icon(
                            onPressed: _busy ? null : _openCompose,
                            icon: const Icon(Icons.chat_bubble_outline_rounded, size: 17, color: Colors.white),
                            label: const Text('Comment', style: TextStyle(color: Colors.white, fontSize: 13)),
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              minimumSize: const Size(0, 36),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              iconColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                Material(
                  color: scheme.onSurface.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(3),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(3),
                    onTap: _busy
                        ? null
                        : () => setState(() => _menuOpen = !_menuOpen),
                    child: const SizedBox(
                      width: 32,
                      height: 24,
                      child: Icon(Icons.more_horiz, size: 18),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
        if (hasEngagement) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: momentsBg,
              borderRadius: BorderRadius.circular(3),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (starOwnerIds.isNotEmpty)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 2, right: 6),
                        child: Icon(Icons.favorite_rounded, size: 15, color: accent),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 3,
                              runSpacing: 3,
                              children: [
                                for (final id in starOwnerIds.take(8))
                                  _actorAvatar(id, _nameFor(id, bonds), accent),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text.rich(
                              TextSpan(
                                children: [
                                  for (var i = 0; i < starOwnerIds.length; i++) ...[
                                    if (i > 0)
                                      TextSpan(
                                        text: ', ',
                                        style: TextStyle(color: accent, fontWeight: FontWeight.w400),
                                      ),
                                    TextSpan(
                                      text: _nameFor(starOwnerIds[i], bonds),
                                      style: TextStyle(
                                        color: accent,
                                        fontWeight: starOwnerIds[i] == selfId
                                            ? FontWeight.w800
                                            : FontWeight.w700,
                                        fontSize: 13.5,
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
                    ],
                  ),
                if (starOwnerIds.isNotEmpty && comments.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Divider(height: 1, thickness: 1, color: accent.withValues(alpha: 0.28)),
                  const SizedBox(height: 6),
                ],
                for (final c in comments)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _actorAvatar(c.authorOwnerId, _nameFor(c.authorOwnerId, bonds), accent),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: _nameFor(c.authorOwnerId, bonds),
                                  style: TextStyle(
                                    color: accent,
                                    fontWeight: c.authorOwnerId == selfId
                                        ? FontWeight.w800
                                        : FontWeight.w700,
                                    fontSize: 13.5,
                                    height: 1.4,
                                  ),
                                ),
                                TextSpan(
                                  text: ': ',
                                  style: TextStyle(
                                    color: accent,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13.5,
                                  ),
                                ),
                                TextSpan(
                                  text: c.text,
                                  style: TextStyle(
                                    color: scheme.onSurface,
                                    fontSize: 13.5,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (selfId != null &&
                            (c.authorOwnerId == selfId || selfId == postAuthorId))
                          IconButton(
                            tooltip: 'Remove comment',
                            visualDensity: VisualDensity.compact,
                            iconSize: 14,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
                            onPressed: _busy ? null : () => _removeComment(c.id),
                            icon: Icon(Icons.close, size: 14, color: scheme.onSurfaceVariant),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (_composeOpen) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _draft,
                  focusNode: _composeFocus,
                  enabled: !_busy,
                  maxLength: 280,
                  decoration: const InputDecoration(
                    hintText: 'Write a comment…',
                    isDense: true,
                    counterText: '',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _sendComment(),
                ),
              ),
              IconButton(
                tooltip: 'Send',
                onPressed: _busy || _draft.text.trim().isEmpty ? null : _sendComment,
                icon: Icon(Icons.send_rounded, size: 20, color: scheme.primary),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
