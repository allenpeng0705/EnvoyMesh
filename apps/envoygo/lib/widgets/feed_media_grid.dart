import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/contact_provider.dart';
import '../services/envoy_url.dart';
import '../services/library_read_fetch.dart';

const maxFeedPostImages = 9;

/// WeChat Moments-style photo mosaic (max 9) with fullscreen viewer on tap.
class FeedMediaGrid extends ConsumerStatefulWidget {
  final List<String> urls;

  const FeedMediaGrid({super.key, required this.urls});

  @override
  ConsumerState<FeedMediaGrid> createState() => _FeedMediaGridState();
}

class _FeedMediaGridState extends ConsumerState<FeedMediaGrid> {
  final Map<String, Uint8List> _bytes = {};
  final Set<String> _loading = {};

  List<String> get _shown =>
      widget.urls.where((u) => u.trim().isNotEmpty).take(maxFeedPostImages).toList();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  @override
  void didUpdateWidget(covariant FeedMediaGrid oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.urls.join('\u0000') != widget.urls.join('\u0000')) {
      _loadAll();
    }
  }

  Future<void> _loadAll() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    for (final url in _shown) {
      if (_bytes.containsKey(url) || _loading.contains(url)) continue;
      if (!isEnvoyContentUrl(url)) continue;
      _loading.add(url);
      try {
        final parsed = parseEnvoyContentUrl(url);
        final result = await fetchLibraryContent(
          client.libraryRead,
          targetOwnerId: parsed.targetOwnerId,
          path: parsed.path,
        );
        if (!mounted) return;
        if (result.status == 'ok' &&
            result.body != null &&
            (result.contentType?.startsWith('image/') ?? false)) {
          setState(() {
            _bytes[url] = base64Decode(result.body!);
          });
        }
      } catch (_) {
        /* leave tile empty */
      } finally {
        _loading.remove(url);
      }
    }
  }

  void _openViewer(int index) {
    final urls = _shown;
    if (urls.isEmpty) return;
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black87,
        pageBuilder: (_, __, ___) => _FeedPhotoViewer(
          urls: urls,
          initialIndex: index,
          bytesByUrl: Map<String, Uint8List>.from(_bytes),
        ),
      ),
    );
  }

  int _crossAxisCount(int n) {
    if (n <= 1) return 1;
    if (n == 2 || n == 4) return 2;
    return 3;
  }

  double _gridWidth(BuildContext context, int n) {
    final maxW = MediaQuery.sizeOf(context).width - 56;
    if (n <= 1) return maxW.clamp(0, 280);
    final cols = _crossAxisCount(n);
    final cell = (maxW / 3).clamp(72.0, 96.0);
    return (cell * cols) + (4 * (cols - 1));
  }

  @override
  Widget build(BuildContext context) {
    final urls = _shown;
    if (urls.isEmpty) return const SizedBox.shrink();
    final n = urls.length;
    final cols = _crossAxisCount(n);
    final width = _gridWidth(context, n);
    final cell = n == 1 ? width : (width - 4 * (cols - 1)) / cols;

    return Align(
      alignment: Alignment.centerLeft,
      child: SizedBox(
        width: width,
        child: GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: n,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 4,
            mainAxisSpacing: 4,
            childAspectRatio: n == 1 ? 4 / 3 : 1,
          ),
          itemBuilder: (context, index) {
            final url = urls[index];
            final bytes = _bytes[url];
            return Material(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(2),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => _openViewer(index),
                child: bytes != null
                    ? Image.memory(
                        bytes,
                        fit: BoxFit.cover,
                        width: cell,
                        height: n == 1 ? null : cell,
                      )
                    : const Center(
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _FeedPhotoViewer extends StatefulWidget {
  final List<String> urls;
  final int initialIndex;
  final Map<String, Uint8List> bytesByUrl;

  const _FeedPhotoViewer({
    required this.urls,
    required this.initialIndex,
    required this.bytesByUrl,
  });

  @override
  State<_FeedPhotoViewer> createState() => _FeedPhotoViewerState();
}

class _FeedPhotoViewerState extends State<_FeedPhotoViewer> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex.clamp(0, widget.urls.length - 1);
    _controller = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.urls.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) {
              final bytes = widget.bytesByUrl[widget.urls[i]];
              if (bytes == null) {
                return const Center(child: CircularProgressIndicator(color: Colors.white54));
              }
              return InteractiveViewer(
                child: Center(
                  child: Image.memory(bytes, fit: BoxFit.contain),
                ),
              );
            },
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                    tooltip: 'Close',
                  ),
                  const Spacer(),
                  if (widget.urls.length > 1)
                    Text(
                      '${_index + 1}/${widget.urls.length}',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                    ),
                  const SizedBox(width: 12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
