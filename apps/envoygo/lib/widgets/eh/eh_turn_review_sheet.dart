import 'dart:async';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../services/node_service_client.dart';
import 'eh_split_diff.dart';

typedef EhReviewNotify = void Function(String message, {bool error});
typedef EhReviewUx = void Function(String action, {String? outcome});

class EhTurnReviewSheet extends StatefulWidget {
  const EhTurnReviewSheet({
    super.key,
    required this.client,
    required this.turnId,
    this.chatId,
    this.focusPath,
    required this.onNotify,
    required this.onDismissed,
    this.onUx,
    this.onOpenGitDiffFallback,
  });

  final NodeServiceClient client;
  final String turnId;
  final String? chatId;
  final String? focusPath;
  final EhReviewNotify onNotify;
  final VoidCallback onDismissed;
  final EhReviewUx? onUx;
  final VoidCallback? onOpenGitDiffFallback;

  @override
  State<EhTurnReviewSheet> createState() => _EhTurnReviewSheetState();
}

class _EhTurnReviewSheetState extends State<EhTurnReviewSheet> {
  Map<String, dynamic>? _review;
  bool _loading = true;
  final Map<String, GlobalKey> _fileKeys = {};

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  GlobalKey _keyFor(String path) =>
      _fileKeys.putIfAbsent(path, GlobalKey.new);

  void _scrollToFocus() {
    final path = widget.focusPath;
    if (path == null) return;
    final key = _fileKeys[path];
    final ctx = key?.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      alignment: 0.1,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final review = await widget.client.getEnvoyHarnessTurnReview(
        widget.turnId,
      );
      if (!mounted) return;
      if (review == null || (review['files'] as List?)?.isEmpty == true) {
        // Keep banner state — user can retry. Do not call onDismissed.
        final l10n = AppLocalizations.of(context);
        widget.onNotify(l10n.ehReviewUnavailable, error: true);
        Navigator.of(context).pop();
        widget.onOpenGitDiffFallback?.call();
        return;
      }
      setState(() {
        _review = review;
        _loading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _scrollToFocus();
      });
    } catch (error) {
      if (!mounted) return;
      widget.onNotify(error.toString(), error: true);
      Navigator.of(context).pop();
    }
  }

  List<Map<String, dynamic>> get _files {
    final raw = _review?['files'] as List?;
    if (raw == null) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  bool get _canRevert => _review?['canRevert'] == true;

  int get _revertibleCount =>
      _files.where((f) => f['revertible'] == true).length;

  int? _remainingFiles(Map<String, dynamic> result) =>
      (result['remainingFiles'] as num?)?.toInt();

  Future<void> _keepAll() async {
    try {
      final result = await widget.client.acceptEnvoyHarnessTurnReview(
        widget.turnId,
      );
      if (!mounted) return;
      if (result['accepted'] != true) {
        widget.onNotify(
          AppLocalizations.of(context).ehReviewKeepFailed,
          error: true,
        );
        return;
      }
      widget.onUx?.call('review_kept_all');
      widget.onNotify(AppLocalizations.of(context).ehReviewKeptAll);
      widget.onDismissed();
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) widget.onNotify(error.toString(), error: true);
    }
  }

  Future<void> _keepFile(String path) async {
    try {
      final result = await widget.client.acceptEnvoyHarnessTurnReview(
        widget.turnId,
        paths: [path],
      );
      if (!mounted) return;
      if (result['accepted'] != true) {
        widget.onNotify(
          AppLocalizations.of(context).ehReviewKeepFailed,
          error: true,
        );
        return;
      }
      if (result['cleared'] == true || _remainingFiles(result) == 0) {
        widget.onNotify(AppLocalizations.of(context).ehReviewKeptAll);
        widget.onDismissed();
        if (mounted) Navigator.of(context).pop();
        return;
      }
      await _load();
    } catch (error) {
      if (mounted) widget.onNotify(error.toString(), error: true);
    }
  }

  Future<void> _revertAll() async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.ehRevertTitle),
        content: Text(l10n.ehRevertBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.ehRevertAction),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    widget.onUx?.call('revert_attempted');
    try {
      final result = await widget.client.revertEnvoyHarnessTurn(widget.turnId);
      if (!mounted) return;
      if (result['reverted'] == true) {
        widget.onUx?.call('revert_completed', outcome: 'success');
        widget.onNotify(l10n.ehRevertComplete);
        widget.onDismissed();
        if (mounted) Navigator.of(context).pop();
        return;
      }
      final conflicts = (result['conflicts'] as List?)?.join(', ');
      widget.onUx?.call(
        conflicts == null || conflicts.isEmpty
            ? 'revert_completed'
            : 'revert_conflicted',
        outcome: conflicts == null || conflicts.isEmpty
            ? 'unavailable'
            : 'conflict',
      );
      widget.onNotify(
        conflicts == null || conflicts.isEmpty
            ? l10n.ehRevertUnavailable
            : l10n.ehRevertConflict(conflicts),
        error: true,
      );
    } catch (error) {
      if (mounted) widget.onNotify(error.toString(), error: true);
    }
  }

  Future<void> _revertFile(String path) async {
    final l10n = AppLocalizations.of(context);
    widget.onUx?.call('revert_attempted');
    try {
      final result = await widget.client.revertEnvoyHarnessTurnFiles(
        widget.turnId,
        [path],
      );
      if (!mounted) return;
      if (result['reverted'] == true) {
        widget.onUx?.call('revert_completed', outcome: 'success');
        widget.onNotify(l10n.ehReviewRevertedFile(path));
        await _load();
        if (!mounted) return;
        if (_files.isEmpty) {
          widget.onDismissed();
          Navigator.of(context).pop();
        }
        return;
      }
      final conflicts = (result['conflicts'] as List?)?.join(', ');
      widget.onUx?.call(
        conflicts == null || conflicts.isEmpty
            ? 'revert_completed'
            : 'revert_conflicted',
        outcome: conflicts == null || conflicts.isEmpty
            ? 'unavailable'
            : 'conflict',
      );
      widget.onNotify(
        conflicts == null || conflicts.isEmpty
            ? l10n.ehRevertUnavailable
            : l10n.ehRevertConflict(conflicts),
        error: true,
      );
    } catch (error) {
      if (mounted) widget.onNotify(error.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.ehReviewChanges,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    Text(l10n.ehChangesCount(_files.length)),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _files.length,
            itemBuilder: (context, index) {
              final raw = _files[index];
              final path = raw['path']?.toString() ?? l10n.ehReviewFile;
              final status = raw['status']?.toString() ?? 'modified';
              final attribution = raw['attribution']?.toString();
              final revertible = raw['revertible'] == true;
              final diff = raw['diff']?.toString();
              final focused = widget.focusPath == path;
              return Card(
                key: _keyFor(path),
                color: focused
                    ? Theme.of(context).colorScheme.primaryContainer.withValues(
                        alpha: 0.25,
                      )
                    : null,
                child: ExpansionTile(
                  initiallyExpanded: focused || _files.length <= 3,
                  title: Text(path),
                  subtitle: Text(
                    attribution == 'workspace'
                        ? '$status · ${l10n.ehReviewOnly}'
                        : status,
                  ),
                  childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  children: [
                    if (diff != null && diff.isNotEmpty)
                      EhSplitDiff(diff: diff)
                    else
                      Text(l10n.ehReviewDiffUnavailable),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: () => unawaited(_keepFile(path)),
                          child: Text(l10n.ehReviewKeepFile),
                        ),
                        if (revertible)
                          OutlinedButton(
                            onPressed: () => unawaited(_revertFile(path)),
                            child: Text(l10n.ehReviewRevertFile),
                          ),
                        if (status != 'deleted')
                          OutlinedButton.icon(
                            onPressed: () => unawaited(() async {
                              try {
                                await widget.client.openEnvoyHarnessFile(
                                  path,
                                  chatId: widget.chatId,
                                );
                              } catch (error) {
                                widget.onNotify(error.toString(), error: true);
                              }
                            }()),
                            icon: const Icon(Icons.open_in_new, size: 16),
                            label: Text(l10n.ehReviewOpenFile),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(l10n.commonClose),
                ),
                const Spacer(),
                if (_files.isNotEmpty)
                  FilledButton(
                    onPressed: () => unawaited(_keepAll()),
                    child: Text(l10n.ehChangesKeepAll),
                  ),
                if (_canRevert && _revertibleCount > 0) ...[
                  const SizedBox(width: 8),
                  FilledButton.tonal(
                    onPressed: () => unawaited(_revertAll()),
                    child: Text(l10n.ehChangesRevert),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
