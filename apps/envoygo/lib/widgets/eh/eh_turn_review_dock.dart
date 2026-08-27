import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../eh/eh_review_prefs.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import 'eh_changes_banner.dart';
import 'eh_turn_review_sheet.dart';

/// Shared EH turn-review host for chat + terminal surfaces.
class EhTurnReviewDock extends ConsumerStatefulWidget {
  const EhTurnReviewDock({
    super.key,
    this.chatId,
    this.onSystemMessage,
  });

  final String? chatId;
  final void Function(String text, {bool error})? onSystemMessage;

  @override
  ConsumerState<EhTurnReviewDock> createState() => EhTurnReviewDockState();
}

class EhTurnReviewDockState extends ConsumerState<EhTurnReviewDock> {
  final List<void Function()> _unsubs = [];
  List<String> _changedFiles = [];
  bool _dismissedChanges = false;
  String? _lastReviewTurnId;
  int _reviewMinFiles = 1;
  bool _reviewSheetOpen = false;
  String? _resolvedChatId;

  String? get _effectiveChatId => widget.chatId ?? _resolvedChatId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_bootstrap());
    });
  }

  @override
  void dispose() {
    for (final u in _unsubs) {
      u();
    }
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final minFiles = await getEhReviewMinFiles();
    if (mounted) setState(() => _reviewMinFiles = minFiles);
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    if (widget.chatId == null) {
      try {
        final status = await client.getEnvoyHarnessStatus();
        final cwd = status['cwd']?.toString();
        if (cwd != null && cwd.isNotEmpty) {
          final chats = await client.listEnvoyHarnessChats();
          Map<String, dynamic>? match;
          for (final c in chats) {
            if (c['cwd']?.toString() == cwd) {
              match = c;
              break;
            }
          }
          if (match != null && mounted) {
            setState(() => _resolvedChatId = match!['id']?.toString());
          }
        }
      } catch (_) {}
    }
    _unsubs.add(
      client.on('eh:turn_complete', (data) {
        if (data is! Map) return;
        _handleTurnComplete(Map<String, dynamic>.from(data));
      }),
    );
    _unsubs.add(
      client.on('eh:files_changed', (data) {
        if (data is! Map) return;
        if (!_eventMatchesChat(data['chatId']?.toString())) return;
        final files =
            (data['files'] as List?)?.map((v) => v.toString()).toList() ??
            const <String>[];
        if (files.isEmpty || !mounted) return;
        setState(() {
          _changedFiles = files;
          _dismissedChanges = false;
          final turnId = data['turnId']?.toString();
          if (turnId != null && turnId.isNotEmpty) {
            _lastReviewTurnId = turnId;
          }
        });
      }),
    );
    _unsubs.add(
      client.on('eh:turn_started', (data) {
        if (data is! Map) return;
        if (!_eventMatchesChat(data['chatId']?.toString())) return;
        if (!mounted) return;
        setState(() {
          _changedFiles = [];
          _dismissedChanges = false;
        });
      }),
    );
  }

  bool _eventMatchesChat(String? eventChatId) {
    final chatId = _effectiveChatId;
    if (eventChatId == null || chatId == null) return true;
    return chatId == eventChatId;
  }

  void _notify(String text, {bool error = false}) {
    widget.onSystemMessage?.call(text, error: error);
    if (widget.onSystemMessage == null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  void _clearReviewState() {
    setState(() {
      _changedFiles = [];
      _dismissedChanges = true;
      _lastReviewTurnId = null;
    });
  }

  void _handleTurnComplete(Map<String, dynamic> data) {
    if (!_eventMatchesChat(data['chatId']?.toString())) return;
    if (data['ok'] != true || data['cancelled'] == true) return;
    final turnId = data['turnId']?.toString();
    if (turnId == null || turnId.isEmpty) return;
    final files =
        (data['changedFiles'] as List?)?.map((v) => v.toString()).toList() ??
        const <String>[];
    if (files.isEmpty || !mounted) return;
    setState(() {
      _lastReviewTurnId = turnId;
      _changedFiles = files;
      _dismissedChanges = false;
    });
    if (files.length >= _reviewMinFiles && !_reviewSheetOpen) {
      unawaited(openReview(turnId));
    }
  }

  Future<void> openReview(String turnId, {String? focusPath}) async {
    if (_reviewSheetOpen || !mounted) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    unawaited(
      client.recordEnvoyHarnessUxEvent({
        'action': 'review_opened',
        'surface': 'envoygo',
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
      }).catchError((_) {}),
    );
    setState(() {
      _lastReviewTurnId = turnId;
      _reviewSheetOpen = true;
    });
    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.9,
          builder: (context, controller) => EhTurnReviewSheet(
            client: client,
            turnId: turnId,
            chatId: _effectiveChatId,
            focusPath: focusPath,
            onNotify: (text, {bool error = false}) =>
                _notify(text, error: error),
            onDismissed: _clearReviewState,
            onUx: (action, {String? outcome}) {
              unawaited(
                client.recordEnvoyHarnessUxEvent({
                  'action': action,
                  'surface': 'envoygo',
                  if (outcome != null) 'outcome': outcome,
                  'occurredAt': DateTime.now().toUtc().toIso8601String(),
                }).catchError((_) {}),
              );
            },
            onOpenGitDiffFallback: () => unawaited(_openGitDiffFallback()),
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _reviewSheetOpen = false);
      } else {
        _reviewSheetOpen = false;
      }
    }
  }

  Future<void> _openGitDiffFallback() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    final l10n = AppLocalizations.of(context);
    try {
      final result = await client.invokeEnvoyHarnessEhui({'op': 'gitDiff'});
      if (!mounted) return;
      final text = result is String
          ? result
          : const JsonEncoder.withIndent('  ').convert(result);
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (ctx) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          builder: (_, scrollController) => Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.ehReviewOpenGitDiff,
                  style: Theme.of(ctx).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: SingleChildScrollView(
                    controller: scrollController,
                    child: SelectableText(text),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (e) {
      _notify(e.toString(), error: true);
    }
  }

  Future<void> _keepAll() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    if (_lastReviewTurnId == null) {
      setState(() => _dismissedChanges = true);
      return;
    }
    try {
      final result = await client.acceptEnvoyHarnessTurnReview(
        _lastReviewTurnId!,
      );
      if (!mounted) return;
      if (result['accepted'] == true) {
        unawaited(
          client.recordEnvoyHarnessUxEvent({
            'action': 'review_kept_all',
            'surface': 'envoygo',
            'occurredAt': DateTime.now().toUtc().toIso8601String(),
          }).catchError((_) {}),
        );
        _clearReviewState();
        _notify(l10n.ehReviewKeptAll);
      } else {
        _notify(l10n.ehReviewKeepFailed, error: true);
      }
    } catch (error) {
      _notify(error.toString(), error: true);
    }
  }

  Future<void> _revertAll() async {
    final turnId = _lastReviewTurnId;
    if (turnId == null) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
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
    try {
      final result = await client.revertEnvoyHarnessTurn(turnId);
      if (!mounted) return;
      if (result['reverted'] == true) {
        _clearReviewState();
        _notify(l10n.ehRevertComplete);
      } else {
        final conflicts = (result['conflicts'] as List?)?.join(', ');
        _notify(
          conflicts == null || conflicts.isEmpty
              ? l10n.ehRevertUnavailable
              : l10n.ehRevertConflict(conflicts),
          error: true,
        );
      }
    } catch (e) {
      _notify(e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissedChanges || _changedFiles.isEmpty) {
      return const SizedBox.shrink();
    }
    return EhChangesBanner(
      files: _changedFiles,
      onReview: _lastReviewTurnId != null
          ? () => unawaited(openReview(_lastReviewTurnId!))
          : () => unawaited(_openGitDiffFallback()),
      onReviewFile: _lastReviewTurnId != null
          ? (path) => unawaited(openReview(_lastReviewTurnId!, focusPath: path))
          : null,
      onKeepAll: () => unawaited(_keepAll()),
      onRevertAll:
          _lastReviewTurnId != null ? () => unawaited(_revertAll()) : null,
      reviewMinFiles: _reviewMinFiles,
      onReviewMinFilesChange: (value) {
        setState(() => _reviewMinFiles = value);
        unawaited(setEhReviewMinFiles(value));
      },
    );
  }
}
