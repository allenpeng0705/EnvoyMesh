import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/contact.dart';
import '../../models/web_content.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../services/library_read_cache.dart';

/// My Files — list / import / preview / share home vault files via thin client.
class ContentFilesTab extends ConsumerStatefulWidget {
  const ContentFilesTab({super.key});

  @override
  ConsumerState<ContentFilesTab> createState() => _ContentFilesTabState();
}

class _ContentFilesTabState extends ConsumerState<ContentFilesTab> {
  ListAllLocalFilesResult? _result;
  bool _loading = true;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  Future<void> _reload() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Connect to a home node to manage files.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await client.listAllLocalFiles(
        query: _query.trim().isEmpty ? null : _query.trim(),
      );
      if (!mounted) return;
      setState(() {
        _result = result;
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

  Future<void> _importFile() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      imageQuality: 85,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final name = file.name.isNotEmpty
        ? file.name
        : 'import-${DateTime.now().millisecondsSinceEpoch}';
    final path = 'imports/$name';
    final mime = file.mimeType ?? 'application/octet-stream';
    try {
      await client.importToLibrary(
        relativePath: path,
        contentBase64: base64Encode(bytes),
        mimeType: mime,
      );
      final homeId = ref.read(nodeProvider).activeNode?.id;
      if (homeId != null) {
        await LibraryReadCache.instance.invalidateBlob(vaultCacheKey(homeId, path));
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Imported $name')),
      );
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Import failed: $e')),
      );
    }
  }

  Future<void> _preview(LocalFileItem item) async {
    final client = ref.read(nodeServiceProvider);
    final homeId = ref.read(nodeProvider).activeNode?.id;
    if (client == null || homeId == null) return;
    try {
      final cacheKey = vaultCacheKey(homeId, item.relativePath);
      final cached = await LibraryReadCache.instance.peekBlobEntry(cacheKey);
      final now = DateTime.now().toUtc();
      Uint8List? bytes;
      var mime = _mimeGuess(item);
      if (cached != null &&
          now.difference(cached.cachedAt.toUtc()) < vaultCacheFreshTtl) {
        bytes = cached.bytes;
        if (bytes == null) {
          try {
            bytes = base64Decode(cached.body);
          } catch (_) {
            bytes = null;
          }
        }
        if (cached.contentType.isNotEmpty &&
            cached.contentType != 'application/octet-stream') {
          mime = cached.contentType;
        }
      }
      if (bytes == null) {
        final result = await client.readLibraryItemContent(
          relativePath: item.relativePath,
        );
        final b64 = result['contentBase64'] as String?;
        final remoteMime = (result['mimeType'] as String?) ?? '';
        if (remoteMime.isNotEmpty) mime = remoteMime;
        if (b64 == null || !mounted) return;
        bytes = base64Decode(b64);
        await LibraryReadCache.instance.putBlob(
          cacheKey,
          bytes,
          contentType: mime.isNotEmpty ? mime : 'application/octet-stream',
        );
      }
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) {
          Widget body;
          if (mime.startsWith('image/')) {
            body = InteractiveViewer(child: Image.memory(bytes!));
          } else if (mime.startsWith('text/') ||
              mime == 'application/json' ||
              item.extension == 'md') {
            body = SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: SelectableText(utf8.decode(bytes!, allowMalformed: true)),
            );
          } else {
            body = Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Preview not available for $mime (${item.byteLength} bytes).\n'
                'Path: ${item.relativePath}',
              ),
            );
          }
          return AlertDialog(
            title: Text(item.title),
            content: SizedBox(
              width: double.maxFinite,
              height: 360,
              child: body,
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Close'),
              ),
            ],
          );
        },
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Preview failed: $e')),
      );
    }
  }

  String _mimeGuess(LocalFileItem item) {
    switch (item.extension.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'md':
      case 'txt':
        return 'text/plain';
      case 'json':
        return 'application/json';
      default:
        return '';
    }
  }

  Future<void> _share(LocalFileItem item) async {
    final contacts = ref.read(contactProvider).bonds
        .where((c) => c.bondLevel != 'blocked')
        .toList();
    if (contacts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No bonded contacts to share with')),
      );
      return;
    }
    final chosen = await showModalBottomSheet<Contact>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(title: Text('Share with…')),
              for (final c in contacts)
                ListTile(
                  title: Text(c.displayName?.trim().isNotEmpty == true
                      ? c.displayName!
                      : c.ownerId),
                  onTap: () => Navigator.pop(ctx, c),
                ),
            ],
          ),
        );
      },
    );
    if (chosen == null) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.shareFile(
        targetOwnerId: chosen.ownerId,
        path: item.relativePath,
        sensitivity: 'friends',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Share sent')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Share failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final nodeState = ref.watch(nodeProvider);
    if (nodeState.activeNode == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Pair with a home node to manage My Files.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final items = (_result?.items ?? const <LocalFileItem>[])
        .where((i) => i.source == 'vault')
        .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: 'Search files',
                    isDense: true,
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (v) => _query = v,
                  onSubmitted: (_) => _reload(),
                ),
              ),
              IconButton(
                tooltip: 'Refresh',
                onPressed: _reload,
                icon: const Icon(Icons.refresh),
              ),
              IconButton(
                tooltip: 'Import',
                onPressed: _importFile,
                icon: const Icon(Icons.upload_file),
              ),
            ],
          ),
        ),
        if (_result != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${_result!.vaultCount} vault · ${_result!.workspaceCount} workspace',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, textAlign: TextAlign.center),
                            const SizedBox(height: 12),
                            FilledButton(
                              onPressed: _reload,
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _reload,
                      child: items.isEmpty
                          ? ListView(
                              children: const [
                                SizedBox(height: 80),
                                Center(child: Text('No vault files yet.')),
                              ],
                            )
                          : ListView.builder(
                              itemCount: items.length,
                              itemBuilder: (context, index) {
                                final item = items[index];
                                return ListTile(
                                  leading: Icon(_iconFor(item)),
                                  title: Text(item.title),
                                  subtitle: Text(
                                    '${item.relativePath} · ${_fmtBytes(item.byteLength)}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  onTap: () => _preview(item),
                                  trailing: IconButton(
                                    tooltip: 'Share',
                                    icon: const Icon(Icons.ios_share),
                                    onPressed: () => _share(item),
                                  ),
                                );
                              },
                            ),
                    ),
        ),
      ],
    );
  }

  IconData _iconFor(LocalFileItem item) {
    final ext = item.extension.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].contains(ext)) {
      return Icons.image_outlined;
    }
    if (ext == 'md' || ext == 'txt') return Icons.article_outlined;
    if (ext == 'pdf') return Icons.picture_as_pdf_outlined;
    return Icons.insert_drive_file_outlined;
  }

  String _fmtBytes(int n) {
    if (n < 1024) return '$n B';
    if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(1)} KiB';
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MiB';
  }
}
