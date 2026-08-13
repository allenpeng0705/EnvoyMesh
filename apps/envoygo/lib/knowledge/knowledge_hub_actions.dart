// Knowledge hub Import/Export actions (mirrors Social LibraryView hub bar).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/web_content.dart';
import '../providers/contact_provider.dart' show nodeServiceProvider;
import 'knowledge_nav.dart';
import 'local_file_display.dart';

class KnowledgeHubActionsBar extends ConsumerStatefulWidget {
  final KnowledgeBrowseFilter filter;
  final List<LocalFileItem> visibleItems;
  final VoidCallback onChanged;

  const KnowledgeHubActionsBar({
    super.key,
    required this.filter,
    required this.visibleItems,
    required this.onChanged,
  });

  @override
  ConsumerState<KnowledgeHubActionsBar> createState() =>
      _KnowledgeHubActionsBarState();
}

class _KnowledgeHubActionsBarState
    extends ConsumerState<KnowledgeHubActionsBar> {
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

  @override
  Widget build(BuildContext context) {
    final filter = widget.filter;
    if (filter != KnowledgeBrowseFilter.obsidian &&
        filter != KnowledgeBrowseFilter.notion) {
      return const SizedBox.shrink();
    }
    final l10n = AppLocalizations.of(context);
    final client = ref.watch(nodeServiceProvider);
    if (client == null) return const SizedBox.shrink();
    final visibleItems = widget.visibleItems;

    final buttons = <Widget>[];
    if (filter == KnowledgeBrowseFilter.obsidian) {
      buttons.addAll([
        OutlinedButton(
          onPressed: _busy
              ? null
              : () => _run(() async {
                    final result =
                        await client.importLinkedObsidianNotes(all: true);
                    if (!context.mounted) return;
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
                  }),
          child: Text(l10n.knowledgeHubImportObsidianAll),
        ),
        OutlinedButton(
          onPressed: _busy
              ? null
              : () => _run(() async {
                    final paths = visibleItems
                        .where((i) =>
                            i.source == 'vault' &&
                            i.relativePath.endsWith('.md'))
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
                        relativePaths: paths);
                    if (!context.mounted) return;
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
                  }),
          child: Text(l10n.knowledgeHubExportToObsidian),
        ),
      ]);
    } else {
      buttons.addAll([
        OutlinedButton(
          onPressed: _busy
              ? null
              : () => _run(() async {
                    final paths = visibleItems
                        .where((i) => i.source == 'mcp-remote')
                        .map((i) => i.relativePath)
                        .toList();
                    if (paths.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                            content: Text(l10n.knowledgeHubImportMcpEmpty)),
                      );
                      return;
                    }
                    final result =
                        await client.importExternalMcpKnowledge(paths: paths);
                    if (!context.mounted) return;
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
                  }),
          child: Text(l10n.knowledgeHubImportNotionVisible),
        ),
        OutlinedButton(
          onPressed: _busy
              ? null
              : () => _run(() async {
                    final paths = visibleItems
                        .where((i) =>
                            i.source == 'vault' &&
                            i.relativePath.endsWith('.md'))
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
                    if (!context.mounted) return;
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
                  }),
          child: Text(l10n.knowledgeHubExportToNotion),
        ),
      ]);
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          ...buttons,
          OutlinedButton(
            onPressed: _busy
                ? null
                : () => openContentKnowledge(
                      ref,
                      panel: KnowledgeHubPanel.plugins,
                    ),
            child: Text(l10n.knowledgeHubOpenPlugins),
          ),
          if (_busy)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
        ],
      ),
    );
  }
}
