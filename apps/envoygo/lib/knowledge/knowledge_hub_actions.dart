// Knowledge hub Import/Export/Plugins overflow (mirrors Social LibraryView hub bar).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/web_content.dart';
import '../providers/contact_provider.dart' show nodeServiceProvider;
import 'knowledge_nav.dart';
import 'local_file_display.dart';

enum _HubOverflowAction {
  importAll,
  exportVisible,
  openPlugins,
}

/// Compact `…` menu for Obsidian/Notion sync actions + Plugins.
///
/// Keeps the filter chip row free of long status chips and button rows.
class KnowledgeHubOverflowButton extends ConsumerStatefulWidget {
  final KnowledgeBrowseFilter filter;
  final List<LocalFileItem> visibleItems;
  final VoidCallback onChanged;

  const KnowledgeHubOverflowButton({
    super.key,
    required this.filter,
    required this.visibleItems,
    required this.onChanged,
  });

  @override
  ConsumerState<KnowledgeHubOverflowButton> createState() =>
      _KnowledgeHubOverflowButtonState();
}

class _KnowledgeHubOverflowButtonState
    extends ConsumerState<KnowledgeHubOverflowButton> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() work) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await work();
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _onSelected(_HubOverflowAction action) async {
    final l10n = AppLocalizations.of(context);
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final filter = widget.filter;
    final visibleItems = widget.visibleItems;

    switch (action) {
      case _HubOverflowAction.openPlugins:
        openContentKnowledge(ref, panel: KnowledgeHubPanel.plugins);
        return;
      case _HubOverflowAction.importAll:
        if (filter == KnowledgeBrowseFilter.obsidian) {
          await _run(() async {
            final result = await client.importLinkedObsidianNotes(all: true);
            if (!mounted) return;
            final ok = result['ok'] == true;
            final count = (result['imported'] as List?)?.length ?? 0;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  ok
                      ? l10n.knowledgeHubImportObsidianOk(count)
                      : (result['reason']?.toString() ??
                          l10n.knowledgeHubImportFailed),
                ),
              ),
            );
          });
        } else if (filter == KnowledgeBrowseFilter.notion) {
          await _run(() async {
            final paths = visibleItems
                .where((i) => i.source == 'mcp-remote')
                .map((i) => i.relativePath)
                .toList();
            if (paths.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(l10n.knowledgeHubImportMcpEmpty)),
              );
              return;
            }
            final result =
                await client.importExternalMcpKnowledge(paths: paths);
            if (!mounted) return;
            final ok = result['ok'] == true;
            final count = (result['imported'] as List?)?.length ?? 0;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  ok
                      ? l10n.knowledgeHubImportNotionOk(count)
                      : (result['reason']?.toString() ??
                          l10n.knowledgeHubImportFailed),
                ),
              ),
            );
          });
        }
        return;
      case _HubOverflowAction.exportVisible:
        if (filter == KnowledgeBrowseFilter.obsidian) {
          await _run(() async {
            final paths = visibleItems
                .where((i) =>
                    i.source == 'vault' && i.relativePath.endsWith('.md'))
                .take(20)
                .map((i) => i.relativePath)
                .toList();
            if (paths.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(l10n.knowledgeHubExportEmpty)),
              );
              return;
            }
            final result = await client.exportNotesToLinkedObsidian(
              relativePaths: paths,
            );
            if (!mounted) return;
            final ok = result['ok'] == true;
            final count = (result['exported'] as List?)?.length ?? 0;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  ok
                      ? l10n.knowledgeHubExportObsidianOk(count)
                      : (result['reason']?.toString() ??
                          l10n.knowledgeHubExportFailed),
                ),
              ),
            );
          });
        } else if (filter == KnowledgeBrowseFilter.notion) {
          await _run(() async {
            final paths = visibleItems
                .where((i) =>
                    i.source == 'vault' && i.relativePath.endsWith('.md'))
                .take(10)
                .map((i) => i.relativePath)
                .toList();
            if (paths.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(l10n.knowledgeHubExportEmpty)),
              );
              return;
            }
            final result =
                await client.exportNotesToMcp(relativePaths: paths);
            if (!mounted) return;
            final ok = result['ok'] == true;
            final count = (result['exported'] as List?)?.length ?? 0;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  ok
                      ? l10n.knowledgeHubExportNotionOk(count)
                      : (result['reason']?.toString() ??
                          l10n.knowledgeHubExportFailed),
                ),
              ),
            );
          });
        }
        return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final filter = widget.filter;
    final showSync = filter == KnowledgeBrowseFilter.obsidian ||
        filter == KnowledgeBrowseFilter.notion;

    if (_busy) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    return PopupMenuButton<_HubOverflowAction>(
      tooltip: l10n.knowledgeFileMore,
      icon: const Icon(Icons.more_horiz),
      onSelected: _onSelected,
      itemBuilder: (context) => [
        if (showSync && filter == KnowledgeBrowseFilter.obsidian) ...[
          PopupMenuItem(
            value: _HubOverflowAction.importAll,
            child: Text(l10n.knowledgeHubImportObsidianAll),
          ),
          PopupMenuItem(
            value: _HubOverflowAction.exportVisible,
            child: Text(l10n.knowledgeHubExportToObsidian),
          ),
        ],
        if (showSync && filter == KnowledgeBrowseFilter.notion) ...[
          PopupMenuItem(
            value: _HubOverflowAction.importAll,
            child: Text(l10n.knowledgeHubImportNotionVisible),
          ),
          PopupMenuItem(
            value: _HubOverflowAction.exportVisible,
            child: Text(l10n.knowledgeHubExportToNotion),
          ),
        ],
        PopupMenuItem(
          value: _HubOverflowAction.openPlugins,
          child: Text(l10n.knowledgeHubOpenPlugins),
        ),
      ],
    );
  }
}
