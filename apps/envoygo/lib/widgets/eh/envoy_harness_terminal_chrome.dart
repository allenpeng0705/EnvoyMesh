import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';

/// EH command rail + permission/question docks above an Envoy Harness TUI session.
class EnvoyHarnessTerminalChrome extends ConsumerStatefulWidget {
  const EnvoyHarnessTerminalChrome({
    super.key,
    required this.onSendToTerminal,
  });

  final void Function(String text) onSendToTerminal;

  @override
  ConsumerState<EnvoyHarnessTerminalChrome> createState() =>
      _EnvoyHarnessTerminalChromeState();
}

class _EnvoyHarnessTerminalChromeState
    extends ConsumerState<EnvoyHarnessTerminalChrome> {
  Map<String, dynamic>? _permission;
  Map<String, dynamic>? _question;
  Map<String, dynamic>? _turnHints;
  bool _promptBusy = false;
  String? _activitySummary;
  String? _projectCwd;
  String? _terminalChatId;
  String? _statusHint;

  final List<void Function()> _unsubs = [];

  @override
  void initState() {
    super.initState();
    _wireEvents();
    unawaited(_loadStatus());
  }

  @override
  void dispose() {
    for (final u in _unsubs) {
      u();
    }
    super.dispose();
  }

  bool _matchesChat(dynamic data) {
    if (data is! Map) return true;
    final eventChatId = data['chatId']?.toString();
    if (_terminalChatId == null || eventChatId == null) return true;
    return eventChatId == _terminalChatId;
  }

  void _wireEvents() {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;

    _unsubs.add(client.on('eh:user_question', (data) {
      if (!_matchesChat(data)) return;
      if (data is Map) {
        setState(() => _question = Map<String, dynamic>.from(data));
      }
    }));
    _unsubs.add(client.on('eh:permission', (data) {
      if (!_matchesChat(data)) return;
      if (data is Map) {
        setState(() => _permission = Map<String, dynamic>.from(data));
      }
    }));
    _unsubs.add(client.on('eh:turn_hints', (data) {
      if (!_matchesChat(data)) return;
      if (data is Map) {
        setState(() => _turnHints = Map<String, dynamic>.from(data));
      }
    }));
    _unsubs.add(client.on('eh:prompt_busy', (data) {
      if (!_matchesChat(data)) return;
      if (data is Map) {
        final busy = data['busy'] == true;
        setState(() {
          _promptBusy = busy;
          if (!busy) {
            _activitySummary = null;
            _question = null;
            _permission = null;
          }
        });
      }
    }));
    _unsubs.add(client.on('eh:activity', (data) {
      if (!_matchesChat(data)) return;
      if (data is Map) {
        final summary = data['summary']?.toString().trim() ?? '';
        if (summary.isNotEmpty) {
          setState(() => _activitySummary = summary);
        }
      }
    }));
  }

  Future<void> _loadStatus() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final status = await client.getEnvoyHarnessStatus();
      final cwd = status['cwd']?.toString().trim();
      setState(() {
        _projectCwd = cwd?.isNotEmpty == true ? cwd : null;
        _statusHint = _statusMessage(status);
      });
      if (cwd != null && cwd.isNotEmpty) {
        unawaited(_resolveChatId(client, cwd));
      }
    } catch (_) {}
  }

  String? _statusMessage(Map<String, dynamic> status) {
    final state = status['state']?.toString();
    if (state == 'ready') return null;
    if (state == 'disabled') {
      return 'Configure a model in Settings → AI.';
    }
    return status['error']?.toString() ?? 'envoy-harness is not ready.';
  }

  Future<void> _resolveChatId(NodeServiceClient client, String cwd) async {
    try {
      final chats = await client.listEnvoyHarnessChats();
      final normalized = cwd.replaceAll(RegExp(r'[/\\]+$'), '');
      for (final raw in chats) {
        final chatCwd = raw['cwd']?.toString().replaceAll(RegExp(r'[/\\]+$'), '');
        if (chatCwd == normalized) {
          setState(() => _terminalChatId = raw['id']?.toString());
          break;
        }
      }
    } catch (_) {}
  }

  Future<void> _cancelTurn() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.cancelEnvoyHarnessTurn(chatId: _terminalChatId);
    } catch (_) {}
  }

  Future<void> _respondPermission(bool allowed) async {
    final client = ref.read(nodeServiceProvider);
    final perm = _permission;
    if (client == null || perm == null) return;
    final requestId = perm['requestId']?.toString() ?? '';
    if (requestId.isEmpty) return;
    setState(() => _permission = null);
    try {
      await client.ehRespondToPermission(
        requestId: requestId,
        allowed: allowed,
      );
    } catch (_) {}
  }

  Future<void> _respondQuestion({
    required String value,
    int? optionIndex,
    bool cancelled = false,
  }) async {
    final client = ref.read(nodeServiceProvider);
    final q = _question;
    if (client == null || q == null) return;
    final requestId = q['requestId']?.toString() ?? '';
    if (requestId.isEmpty) return;
    setState(() => _question = null);
    try {
      await client.ehRespondToUserQuestion(
        requestId: requestId,
        value: value,
        optionIndex: optionIndex,
        cancelled: cancelled ? true : null,
      );
    } catch (_) {}
  }

  Future<void> _openEhuiPanel(
    BuildContext context,
    String label,
    Map<String, dynamic> request,
  ) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final result = await client.invokeEnvoyHarnessEhui(request);
      final text = _formatEhuiBody(result);
      if (!context.mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (ctx) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          minChildSize: 0.3,
          maxChildSize: 0.92,
          builder: (_, scrollController) => Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(label, style: Theme.of(ctx).textTheme.titleMedium),
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
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  String _formatEhuiBody(dynamic result) {
    if (result is String) return result;
    try {
      return const JsonEncoder.withIndent('  ').convert(result);
    } catch (_) {
      return result.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Material(
      color: scheme.surfaceContainerLow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_statusHint != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Text(
                _statusHint!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
            ),
          if (_statusHint == null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Row(
                    children: [
                      for (final panel in _ehuiPanels)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: OutlinedButton(
                            onPressed: () => unawaited(
                              _openEhuiPanel(context, panel.$1, panel.$2),
                            ),
                            child: Text(panel.$1),
                          ),
                        ),
                    ],
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
                  child: Row(
                    children: [
                      for (final cmd in _terminalSlashQuick)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ActionChip(
                            label: Text(cmd, style: const TextStyle(fontSize: 12)),
                            onPressed: () => widget.onSendToTerminal('$cmd\n'),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          if (_projectCwd != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
              child: Text(
                _projectCwd!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          if (_promptBusy || _question != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _question != null
                          ? l10n.ehQuestionTitle
                          : (_activitySummary ?? l10n.chatsEhThinking),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  TextButton(
                    onPressed: () => unawaited(_cancelTurn()),
                    child: Text(l10n.commonCancel),
                  ),
                ],
              ),
            ),
          if (_permission != null) _PermissionCard(
            permission: _permission!,
            onAllow: () => unawaited(_respondPermission(true)),
            onDeny: () => unawaited(_respondPermission(false)),
          ),
          if (_question != null)
            _UserQuestionCard(
              question: _question!,
              onOption: (label, index) => unawaited(
                _respondQuestion(value: label, optionIndex: index),
              ),
              onDismiss: () => unawaited(
                _respondQuestion(value: '', cancelled: true),
              ),
            ),
          if (_turnHints != null)
            _TurnHintsChips(
              hints: _turnHints!,
              onSelect: (text) {
                widget.onSendToTerminal(text);
                setState(() => _turnHints = null);
              },
            ),
        ],
      ),
    );
  }

  static const _ehuiPanels = [
    ('Plan', {'op': 'plan', 'action': 'show'}),
    ('Memory', {'op': 'memory', 'memoryOp': 'list'}),
    ('Diff', {'op': 'gitDiff'}),
    ('Status', {'op': 'gitStatus'}),
    ('Cluster', {'op': 'clusterStatus'}),
    ('Sessions', {'op': 'listSessions'}),
  ];

  static const _terminalSlashQuick = [
    '/help',
    '/cancel',
    '/review',
    '/compact',
    '/diff',
  ];
}

class _TurnHintsChips extends StatelessWidget {
  const _TurnHintsChips({
    required this.hints,
    required this.onSelect,
  });

  final Map<String, dynamic> hints;
  final void Function(String text) onSelect;

  @override
  Widget build(BuildContext context) {
    final followUps = (hints['followUps'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .where((s) => s.trim().isNotEmpty)
            .toList() ??
        [];
    if (followUps.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final hint in followUps)
            ActionChip(
              label: Text(hint, maxLines: 2),
              onPressed: () => onSelect(hint),
            ),
        ],
      ),
    );
  }
}

class _PermissionCard extends StatelessWidget {
  const _PermissionCard({
    required this.permission,
    required this.onAllow,
    required this.onDeny,
  });

  final Map<String, dynamic> permission;
  final VoidCallback onAllow;
  final VoidCallback onDeny;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tool = permission['toolName']?.toString() ?? 'tool';
    final desc = permission['description']?.toString() ?? '';
    final preview = permission['preview']?.toString();

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.ehPermissionTitle, style: Theme.of(context).textTheme.titleSmall),
            Text('$tool — $desc'),
            if (preview != null && preview.trim().isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: SingleChildScrollView(
                  child: Text(
                    preview,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onDeny,
                    child: Text(l10n.ehPermissionDeny),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: onAllow,
                    child: Text(l10n.ehPermissionAllow),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _UserQuestionCard extends StatelessWidget {
  const _UserQuestionCard({
    required this.question,
    required this.onOption,
    required this.onDismiss,
  });

  final Map<String, dynamic> question;
  final void Function(String label, int index) onOption;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final prompt = question['prompt']?.toString() ?? '';
    final options = (question['options'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        [];
    final recommended = question['recommendedIndex'];

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.ehQuestionTitle, style: Theme.of(context).textTheme.titleSmall),
            if (prompt.isNotEmpty) Text(prompt),
            if (options.isNotEmpty)
              ...options.asMap().entries.map((e) {
                final isRec = recommended == e.key;
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: OutlinedButton(
                    onPressed: () => onOption(e.value, e.key),
                    child: Text(
                      isRec ? '${e.value} (${l10n.ehRecommended})' : e.value,
                    ),
                  ),
                );
              })
            else
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: onDismiss, child: Text(l10n.commonCancel)),
              ),
          ],
        ),
      ),
    );
  }
}
