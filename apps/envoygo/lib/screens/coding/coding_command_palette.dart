import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_projects.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../models/terminal_session.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/terminal_provider.dart';
import '../../services/coding_ext_sessions.dart';
import 'coding_mesh_work_ui.dart';
import 'coding_scheduler_ui.dart';

/// Host navigation hooks for the Coding command palette (Phase 68-C5).
class CodingCommandPaletteHost {
  const CodingCommandPaletteHost({
    required this.onNewTask,
    required this.onAddProject,
    required this.onOpenEh,
    required this.onOpenPi,
    required this.onOpenExt,
  });

  final Future<void> Function({String? cwd}) onNewTask;
  final Future<void> Function() onAddProject;
  final Future<void> Function(ChatThread thread) onOpenEh;
  final Future<void> Function(TerminalSession session) onOpenPi;
  final Future<void> Function(CodingExtSession session) onOpenExt;
}

Future<void> showCodingCommandPalette(
  BuildContext context,
  WidgetRef ref,
  CodingCommandPaletteHost host,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _CodingCommandPalette(ref: ref, host: host),
  );
}

class _PaletteRow {
  const _PaletteRow({
    required this.label,
    required this.detail,
    required this.onTap,
  });
  final String label;
  final String detail;
  final VoidCallback onTap;
}

class _CodingCommandPalette extends ConsumerStatefulWidget {
  const _CodingCommandPalette({required this.ref, required this.host});

  final WidgetRef ref;
  final CodingCommandPaletteHost host;

  @override
  ConsumerState<_CodingCommandPalette> createState() =>
      _CodingCommandPaletteState();
}

class _CodingCommandPaletteState extends ConsumerState<_CodingCommandPalette> {
  final _query = TextEditingController();
  List<_PaletteRow> _all = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _query.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // ignore: discarded_futures
      _buildItems();
    });
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _buildItems() async {
    final l10n = AppLocalizations.of(context);
    final chat = ref.read(chatProvider);
    final term = ref.read(terminalProvider);
    final projects = await loadCodingProjects();
    final ext = await loadCodingExtSessions();
    final client = ref.read(nodeServiceProvider);

    final rows = <_PaletteRow>[
      _PaletteRow(
        label: l10n.codingNewTaskTitle,
        detail: l10n.codingViewSearchKindAction,
        onTap: () {
          Navigator.of(context).pop();
          // ignore: discarded_futures
          widget.host.onNewTask();
        },
      ),
      _PaletteRow(
        label: l10n.codingAddProjectCta,
        detail: l10n.codingViewSearchKindAction,
        onTap: () {
          Navigator.of(context).pop();
          // ignore: discarded_futures
          widget.host.onAddProject();
        },
      ),
      _PaletteRow(
        label: l10n.codingSchedulerTitle,
        detail: l10n.codingViewSearchKindAction,
        onTap: () {
          Navigator.of(context).pop();
          // ignore: discarded_futures
          showCodingSchedulerSheet(context);
        },
      ),
      _PaletteRow(
        label: l10n.codingMeshWorkTitle,
        detail: l10n.codingViewSearchKindAction,
        onTap: () {
          Navigator.of(context).pop();
          // ignore: discarded_futures
          showCodingMeshWorkSheet(context);
        },
      ),
      for (final p in projects)
        _PaletteRow(
          label: p.label,
          detail: p.path,
          onTap: () {
            Navigator.of(context).pop();
            // ignore: discarded_futures
            widget.host.onNewTask(cwd: p.path);
          },
        ),
      for (final t in chat.threads.where(
        (x) => x.type == ChatThreadType.envoyHarness,
      ))
        _PaletteRow(
          label: t.displayName,
          detail: t.description ?? '',
          onTap: () {
            Navigator.of(context).pop();
            // ignore: discarded_futures
            widget.host.onOpenEh(t);
          },
        ),
      for (final s in term.sessions.where((x) => x.isPi))
        _PaletteRow(
          label: s.name,
          detail: s.cwd ?? '',
          onTap: () {
            Navigator.of(context).pop();
            // ignore: discarded_futures
            widget.host.onOpenPi(s);
          },
        ),
      for (final s in ext)
        _PaletteRow(
          label: s.title,
          detail: s.cwd,
          onTap: () {
            Navigator.of(context).pop();
            // ignore: discarded_futures
            widget.host.onOpenExt(s);
          },
        ),
    ];

    if (!mounted) return;
    setState(() {
      _all = rows;
      _loading = false;
    });
    // Silence unused warning when client is only for future cwd file search.
    // ignore: unused_local_variable
    final _ = client;
  }

  List<_PaletteRow> get _filtered {
    final q = _query.text.trim().toLowerCase();
    if (q.isEmpty) return _all;
    return _all
        .where(
          (r) =>
              r.label.toLowerCase().contains(q) ||
              r.detail.toLowerCase().contains(q),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final maxH = MediaQuery.sizeOf(context).height * 0.85;
    return SafeArea(
      child: SizedBox(
        height: maxH,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.codingSearchTitle,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _query,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: l10n.codingSearchHint,
                  prefixIcon: const Icon(Icons.search),
                ),
              ),
              const SizedBox(height: 8),
              if (_loading)
                const Expanded(
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_filtered.isEmpty)
                Expanded(
                  child: Center(child: Text(l10n.codingSearchEmpty)),
                )
              else
                Expanded(
                  child: ListView.builder(
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final row = _filtered[i];
                      return ListTile(
                        title: Text(row.label),
                        subtitle: Text(
                          row.detail,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onTap: row.onTap,
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}