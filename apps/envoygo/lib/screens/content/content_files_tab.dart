import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/contact.dart';
import '../../models/web_content.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../knowledge/knowledge_hub_actions.dart';
import '../../knowledge/knowledge_nav.dart';
import '../../services/chat_voice_note.dart';
import '../../services/library_read_cache.dart';
import '../../services/vault_content_fetch.dart';
import 'note_editor_screen.dart';

/// My Files — list / import / preview / share home vault files via thin client.
class ContentFilesTab extends ConsumerStatefulWidget {
  /// When true (Knowledge → Browse), show Notes/Documents/Published filters + index chip.
  final bool knowledgeBrowse;

  /// Optional seed for the search field (e.g. from Browse hub).
  final String? initialQuery;

  const ContentFilesTab({
    super.key,
    this.knowledgeBrowse = false,
    this.initialQuery,
  });

  @override
  ConsumerState<ContentFilesTab> createState() => _ContentFilesTabState();
}

class _ContentFilesTabState extends ConsumerState<ContentFilesTab> {
  ListAllLocalFilesResult? _result;
  bool _loading = true;
  String? _error;
  late String _query;
  KnowledgeBrowseFilter _browseFilter = KnowledgeBrowseFilter.all;
  Map<String, dynamic>? _indexStatus;
  void Function()? _unsubRag;
  late final TextEditingController _searchController;

  @override
  void initState() {
    super.initState();
    _query = widget.initialQuery?.trim() ?? '';
    _searchController = TextEditingController(text: _query);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _reload();
      if (widget.knowledgeBrowse) {
        _refreshIndex();
        _subscribeRag();
      }
    });
  }

  @override
  void dispose() {
    _unsubRag?.call();
    _searchController.dispose();
    super.dispose();
  }

  void _subscribeRag() {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    _unsubRag?.call();
    _unsubRag = client.on('rag:reindex', (_) {
      if (mounted) _refreshIndex();
    });
  }

  Future<void> _refreshIndex() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final st = await client.getRagIndexStatus();
      if (!mounted) return;
      setState(() => _indexStatus = st);
    } catch (_) {}
  }

  Future<void> _reload() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = AppLocalizations.of(context).filesConnectHint;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await client.listAllLocalFiles();
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
    final picked = await FilePicker.platform.pickFiles(
      withData: true,
      allowMultiple: false,
      type: FileType.any,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.first;
    final bytes = file.bytes;
    if (bytes == null || bytes.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).filesImportFailed('empty')),
        ),
      );
      return;
    }
    final name = file.name.isNotEmpty
        ? file.name
        : 'import-${DateTime.now().millisecondsSinceEpoch}';
    final path = 'imports/$name';
    final mime = file.extension == null
        ? 'application/octet-stream'
        : _mimeForExt(file.extension!);
    try {
      await client.importToLibrary(
        relativePath: path,
        contentBase64: base64Encode(bytes),
        mimeType: mime,
      );
      final homePeerId = ref.read(nodeProvider).activeNode?.homePeerId.trim();
      if (homePeerId != null && homePeerId.isNotEmpty) {
        await LibraryReadCache.instance
            .invalidateBlob(vaultCacheKey(homePeerId, path));
      }
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.filesImported(name))),
      );
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).filesImportFailed('$e')),
        ),
      );
    }
  }

  String _mimeForExt(String ext) {
    switch (ext.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'md':
        return 'text/markdown';
      case 'txt':
        return 'text/plain';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default:
        return 'application/octet-stream';
    }
  }

  Future<void> _openNoteEditor({String mode = 'create', String? path}) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => NoteEditorScreen(mode: mode, relativePath: path),
      ),
    );
    if (saved == true) await _reload();
  }

  Future<void> _togglePublished(LocalFileItem item) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    final next = !(item.published ?? false);
    final id = item.documentId;

    try {
      if (id != null && id.isNotEmpty && item.source == 'vault') {
        await client.setLibraryItemPublished(documentId: id, published: next);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              next
                  ? l10n.knowledgeFilePublish
                  : l10n.knowledgeFileMakePrivate,
            ),
          ),
        );
        await _reload();
        return;
      }

      if (!next) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.knowledgeBrowsePublishImportOnly),
          ),
        );
        return;
      }

      String? docId;
      if (item.source == 'linked-obsidian') {
        final result = await client.importLinkedObsidianNotes(
          paths: [item.relativePath],
        );
        final ok = result['ok'] == true;
        final imported = (result['imported'] as List?) ?? const [];
        if (!ok || imported.isEmpty) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                result['reason']?.toString() ?? l10n.knowledgeHubImportFailed,
              ),
            ),
          );
          return;
        }
        final first = imported.first;
        if (first is Map) {
          docId = first['documentId']?.toString();
        }
      } else if (item.source == 'mcp-remote') {
        final result = await client.importExternalMcpKnowledge(
          paths: [item.relativePath],
        );
        final ok = result['ok'] == true;
        final imported = (result['imported'] as List?) ?? const [];
        if (!ok || imported.isEmpty) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                result['reason']?.toString() ?? l10n.knowledgeHubImportFailed,
              ),
            ),
          );
          return;
        }
        final first = imported.first;
        if (first is Map) {
          docId = first['documentId']?.toString();
        }
      } else {
        return;
      }

      if (docId == null || docId.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.knowledgeBrowsePublishImportNoDoc),
          ),
        );
        await _reload();
        return;
      }

      await client.setLibraryItemPublished(documentId: docId, published: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.knowledgeBrowseImportedAndPublished)),
      );
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    }
  }

  Future<void> _openOnHome(LocalFileItem item) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.openLocalFile(
        source: item.source,
        relativePath: item.relativePath,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).knowledgeFileOpenedOnHome),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    }
  }

  Future<void> _deleteItem(LocalFileItem item) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || item.source != 'vault') return;
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.knowledgeFileDeleteTitle),
        content: Text(l10n.knowledgeFileDeleteBody(item.title)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.knowledgeFileDeleteConfirm),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await client.deleteVaultItem(relativePath: item.relativePath);
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    }
  }

  Future<void> _convertItem(LocalFileItem item) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final result = await client.convertLibraryItemToMarkdown(
        documentId: item.documentId,
        relativePath: item.relativePath,
      );
      if (!mounted) return;
      final ok = result['ok'] == true;
      final path = result['markdownRelativePath']?.toString();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok && path != null
                ? AppLocalizations.of(context).knowledgeFileConvertOk(path)
                : (result['reason']?.toString() ??
                    AppLocalizations.of(context).knowledgeFileConvertFailed),
          ),
        ),
      );
      if (ok) await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    }
  }

  Future<void> _showRowActions(LocalFileItem item) async {
    final l10n = AppLocalizations.of(context);
    final isVault = item.source == 'vault';
    final canEdit = isVault &&
        item.relativePath.startsWith('notes/') &&
        (item.extension == '.md' || item.extension == 'md');
    final canPublish = _canPublish(item);
    final canConvert = isVault &&
        !item.relativePath.startsWith('notes/') &&
        const {'.pdf', 'pdf', '.docx', 'docx', '.doc', 'doc', '.xlsx', 'xlsx'}
            .contains(item.extension.toLowerCase());

    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.visibility_outlined),
                title: Text(l10n.knowledgeFilePreview),
                onTap: () {
                  Navigator.pop(ctx);
                  _preview(item);
                },
              ),
              ListTile(
                leading: const Icon(Icons.open_in_new),
                title: Text(l10n.knowledgeFileOpenOnHome),
                onTap: () {
                  Navigator.pop(ctx);
                  _openOnHome(item);
                },
              ),
              if (canPublish)
                ListTile(
                  leading: Icon(
                    (item.published ?? false)
                        ? Icons.lock_open_outlined
                        : Icons.lock_outline,
                  ),
                  title: Text(
                    (item.published ?? false)
                        ? l10n.knowledgeFileMakePrivate
                        : (item.source == 'linked-obsidian' ||
                                item.source == 'mcp-remote')
                            ? l10n.knowledgeBrowseImportAndPublish
                            : l10n.knowledgeFilePublish,
                  ),
                  onTap: () {
                    Navigator.pop(ctx);
                    _togglePublished(item);
                  },
                ),
              if (canEdit)
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: Text(l10n.knowledgeNoteEditTitle),
                  onTap: () {
                    Navigator.pop(ctx);
                    _openNoteEditor(mode: 'edit', path: item.relativePath);
                  },
                ),
              if (canConvert)
                ListTile(
                  leading: const Icon(Icons.notes_outlined),
                  title: Text(l10n.knowledgeFileConvert),
                  onTap: () {
                    Navigator.pop(ctx);
                    _convertItem(item);
                  },
                ),
              if (isVaultShareableSource(item.source))
                ListTile(
                  leading: const Icon(Icons.ios_share),
                  title: Text(l10n.commonShare),
                  onTap: () {
                    Navigator.pop(ctx);
                    _share(item);
                  },
                ),
              if (isVault)
                ListTile(
                  leading: Icon(Icons.delete_outline,
                      color: Theme.of(ctx).colorScheme.error),
                  title: Text(l10n.knowledgeFileDeleteConfirm),
                  onTap: () {
                    Navigator.pop(ctx);
                    _deleteItem(item);
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _preview(LocalFileItem item) async {
    final client = ref.read(nodeServiceProvider);
    final homePeerId = ref.read(nodeProvider).activeNode?.homePeerId.trim();
    if (client == null || homePeerId == null || homePeerId.isEmpty) return;
    try {
      late final Uint8List bytes;
      var mime = '';
      if (item.source == 'vault') {
        final fetched = await getOrFetchVaultContent(
          ({required relativePath, int? maxBytes, int? offset}) =>
              client.readLibraryItemContent(
            relativePath: relativePath,
            maxBytes: maxBytes,
            offset: offset,
          ),
          homePeerId: homePeerId,
          relativePath: item.relativePath,
        );
        if (fetched.bytes.isEmpty || !mounted) return;
        bytes = fetched.bytes;
        mime = fetched.mimeType;
      } else {
        final raw = await client.readLocalFileContent(
          source: item.source,
          relativePath: item.relativePath,
          documentId: item.documentId,
        );
        final b64 = (raw['contentBase64'] as String?) ?? '';
        if (b64.isEmpty || !mounted) return;
        bytes = base64Decode(b64);
        mime = (raw['mimeType'] as String?) ?? '';
      }
      if (mime.isEmpty || mime == 'application/octet-stream') {
        mime = _mimeGuess(item);
      }
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      await showDialog<void>(
        context: context,
        builder: (ctx) {
          Widget body;
          if (mime.startsWith('image/')) {
            body = InteractiveViewer(child: Image.memory(bytes));
          } else if (mime.startsWith('text/') ||
              mime == 'application/json' ||
              mime.contains('markdown') ||
              item.extension == 'md' ||
              item.extension == '.md') {
            body = SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: SelectableText(utf8.decode(bytes, allowMalformed: true)),
            );
          } else {
            body = Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                l10n.filesPreviewUnavailable(mime, item.byteLength),
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
                child: Text(AppLocalizations.of(ctx).commonClose),
              ),
            ],
          );
        },
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).filesPreviewFailed('$e')),
        ),
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
    final l10n = AppLocalizations.of(context);
    if (!isVaultShareableSource(item.source)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.knowledgeHubShareVaultOnly)),
      );
      return;
    }
    final contacts = ref.read(contactProvider).bonds
        .where((c) => c.bondLevel != 'blocked')
        .toList();
    if (contacts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.filesNoContactsShare)),
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
              ListTile(title: Text(AppLocalizations.of(ctx).filesShareWith)),
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
        SnackBar(content: Text(AppLocalizations.of(context).filesShareSent)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).filesShareFailed('$e')),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final nodeState = ref.watch(nodeProvider);
    if (nodeState.activeNode == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            l10n.filesPairHint,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final items = (_result?.items ?? const <LocalFileItem>[])
        .where(
          (i) =>
              !isHiddenFromLibraryList(i.relativePath) &&
              (i.source == 'vault' ||
                  (widget.knowledgeBrowse &&
                      (i.source == 'linked-obsidian' || i.source == 'mcp-remote'))),
        )
        .where(
          (i) =>
              !widget.knowledgeBrowse ||
              matchesKnowledgeBrowseFilter(
                relativePath: i.relativePath,
                published: i.published,
                source: i.source,
                filter: _browseFilter,
              ),
        )
        .where((i) {
          final q = _query.trim().toLowerCase();
          if (q.isEmpty) return true;
          return i.title.toLowerCase().contains(q) ||
              i.relativePath.toLowerCase().contains(q);
        })
        .toList();

    final tracked = (_indexStatus?['trackedDocuments'] as num?)?.toInt() ?? 0;
    final linked =
        (_indexStatus?['linkedObsidianNoteCount'] as num?)?.toInt() ?? 0;
    final indexing = _indexStatus?['isIndexing'] == true;
    String indexLabel;
    if (indexing) {
      indexLabel = l10n.knowledgeBrowseIndexIndexing;
    } else if (tracked > 0) {
      indexLabel = linked > 0
          ? l10n.knowledgeBrowseIndexReadyLinked(tracked, linked)
          : l10n.knowledgeBrowseIndexReady(tracked);
    } else {
      indexLabel = l10n.knowledgeBrowseIndexEmpty;
    }

    return Column(
      children: [
        if (widget.knowledgeBrowse)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final f in KnowledgeBrowseFilter.values)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: FilterChip(
                              label: Text(_filterLabel(l10n, f)),
                              selected: _browseFilter == f,
                              showCheckmark: false,
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              onSelected: (_) =>
                                  setState(() => _browseFilter = f),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                ActionChip(
                  label: Text(indexLabel),
                  visualDensity: VisualDensity.compact,
                  onPressed: () {
                    // Leave full-screen library so Setup is visible.
                    final nav = Navigator.of(context);
                    if (nav.canPop()) nav.pop();
                    openContentKnowledge(
                      ref,
                      panel: KnowledgeHubPanel.setup,
                    );
                    _refreshIndex();
                  },
                ),
              ],
            ),
          ),
        if (widget.knowledgeBrowse)
          KnowledgeHubActionsBar(
            filter: _browseFilter,
            visibleItems: items,
            onChanged: () {
              _reload();
              _refreshIndex();
            },
          ),
        if (widget.knowledgeBrowse &&
            (_result?.mcpRemoteError?.isNotEmpty ?? false) &&
            _result!.mcpRemoteError != 'mcp_url_missing')
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              l10n.knowledgeHubMcpListError(_result!.mcpRemoteError!),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: l10n.filesSearchHint,
                    isDense: true,
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder(),
                  ),
                  onChanged: (v) => setState(() => _query = v),
                  onSubmitted: (_) => _reload(),
                ),
              ),
              IconButton(
                tooltip: l10n.commonRefresh,
                onPressed: () {
                  _reload();
                  if (widget.knowledgeBrowse) _refreshIndex();
                },
                icon: const Icon(Icons.refresh),
              ),
              IconButton(
                tooltip: l10n.filesImport,
                onPressed: _importFile,
                icon: const Icon(Icons.upload_file),
              ),
              if (widget.knowledgeBrowse)
                IconButton(
                  tooltip: l10n.knowledgeNoteNewTitle,
                  onPressed: () => _openNoteEditor(mode: 'create'),
                  icon: const Icon(Icons.note_add_outlined),
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
                l10n.filesVaultHint,
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
                              child: Text(l10n.commonRetry),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _reload,
                      child: items.isEmpty
                          ? ListView(
                              children: [
                                const SizedBox(height: 80),
                                Center(child: Text(l10n.filesEmpty)),
                              ],
                            )
                          : ListView.builder(
                              itemCount: items.length,
                              itemBuilder: (context, index) {
                                final item = items[index];
                                return ListTile(
                                  leading: Icon(_iconFor(item)),
                                  title: widget.knowledgeBrowse
                                      ? Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                item.title,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            if (_shouldShowSourceChip(item)) ...[
                                              const SizedBox(width: 8),
                                              _SourceChip(
                                                source: knowledgeBrowseSource(
                                                  item.relativePath,
                                                ),
                                                origin: knowledgeObsidianOrigin(
                                                  item.relativePath,
                                                ),
                                              ),
                                            ],
                                          ],
                                        )
                                      : Text(item.title),
                                  subtitle: Text(
                                    '${widget.knowledgeBrowse ? knowledgeBrowseDisplayPath(item.relativePath) : item.relativePath} · ${_fmtBytes(item.byteLength)}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  onTap: () => _preview(item),
                                  onLongPress: () => _showRowActions(item),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      if (_canPublish(item))
                                        IconButton(
                                          tooltip: (item.published ?? false)
                                              ? l10n.knowledgeFileMakePrivate
                                              : (item.source ==
                                                          'linked-obsidian' ||
                                                      item.source ==
                                                          'mcp-remote')
                                                  ? l10n.knowledgeBrowseImportAndPublish
                                                  : l10n.knowledgeFilePublish,
                                          icon: Icon(
                                            (item.published ?? false)
                                                ? Icons.lock_open_outlined
                                                : Icons.lock_outline,
                                          ),
                                          onPressed: () =>
                                              _togglePublished(item),
                                        ),
                                      IconButton(
                                        tooltip: l10n.knowledgeFileMore,
                                        icon: const Icon(Icons.more_vert),
                                        onPressed: () => _showRowActions(item),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                    ),
        ),
      ],
    );
  }

  String _filterLabel(AppLocalizations l10n, KnowledgeBrowseFilter f) {
    switch (f) {
      case KnowledgeBrowseFilter.all:
        return l10n.knowledgeBrowseFilterAll;
      case KnowledgeBrowseFilter.notes:
        return l10n.knowledgeBrowseFilterNotes;
      case KnowledgeBrowseFilter.obsidian:
        return l10n.knowledgeBrowseFilterObsidian;
      case KnowledgeBrowseFilter.notion:
        return l10n.knowledgeBrowseFilterNotion;
      case KnowledgeBrowseFilter.blog:
        return l10n.knowledgeBrowseFilterBlog;
      case KnowledgeBrowseFilter.documents:
        return l10n.knowledgeBrowseFilterDocuments;
      case KnowledgeBrowseFilter.published:
        return l10n.knowledgeBrowseFilterPublished;
    }
  }

  bool _canPublish(LocalFileItem item) {
    if (item.source == 'vault' &&
        (item.documentId?.isNotEmpty ?? false)) {
      return true;
    }
    return item.source == 'linked-obsidian' || item.source == 'mcp-remote';
  }

  bool _shouldShowSourceChip(LocalFileItem item) {
    if (!widget.knowledgeBrowse) return false;
    final source = knowledgeBrowseSource(item.relativePath);
    if (source == 'document') return false;
    if (_browseFilter == KnowledgeBrowseFilter.obsidian &&
        source == 'obsidian') {
      return false;
    }
    if (_browseFilter == KnowledgeBrowseFilter.notion && source == 'notion') {
      return false;
    }
    if (_browseFilter == KnowledgeBrowseFilter.blog && source == 'blog') {
      return false;
    }
    return true;
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

class _SourceChip extends StatelessWidget {
  final String source;
  final String? origin;
  const _SourceChip({required this.source, this.origin});

  @override
  Widget build(BuildContext context) {
    if (source == 'obsidian') {
      final tip = origin == 'linked'
          ? 'Obsidian · Linked vault'
          : origin == 'imported'
              ? 'Obsidian · Imported'
              : 'Obsidian';
      return Tooltip(
        message: tip,
        child: Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFF6C5CE7),
            borderRadius: BorderRadius.circular(4),
          ),
          child: const Icon(Icons.auto_awesome, size: 12, color: Colors.white),
        ),
      );
    }

    final label = switch (source) {
      'notion' => 'Notion',
      'blog' => 'Blog',
      'note' => 'Note',
      _ => 'File',
    };
    final scheme = Theme.of(context).colorScheme;
    final accent = switch (source) {
      'notion' => const Color(0xFF2F3437),
      'blog' => const Color(0xFF0F766E),
      'note' => scheme.outline,
      _ => scheme.outline,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: accent.withValues(alpha: 0.28)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
      ),
    );
  }
}
