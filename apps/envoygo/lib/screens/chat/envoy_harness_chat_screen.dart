import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../eh/eh_turn_queue.dart';
import '../../ext_agent/envoy_harness_slash_commands.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../widgets/chat/slash_command_suggest.dart';

/// Envoy Harness coding chat — multi-turn agent thread per project folder.
class EnvoyHarnessChatScreen extends ConsumerStatefulWidget {
  const EnvoyHarnessChatScreen({
    super.key,
    required this.threadId,
    required this.displayName,
    this.chatId,
  });

  final String threadId;
  final String displayName;
  final String? chatId;

  @override
  ConsumerState<EnvoyHarnessChatScreen> createState() =>
      _EnvoyHarnessChatScreenState();
}

class _EhMessage {
  _EhMessage({required this.role, required this.text, this.streaming = false});
  final String role;
  String text;
  bool streaming;
}

class _EnvoyHarnessChatScreenState extends ConsumerState<EnvoyHarnessChatScreen> {
  final List<_EhMessage> _messages = [];
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _loading = true;
  String? _error;
  String? _systemMessage;
  bool _systemIsError = false;
  int _slashHighlight = 0;
  Map<String, dynamic>? _status;
  EhTurnQueue? _queue;
  final List<void Function()> _unsubs = [];

  bool get _busy => _queue?.busy ?? false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wireQueue();
      unawaited(_loadHistory());
      unawaited(_refreshStatus());
    });
  }

  void _wireQueue() {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final queue = EhTurnQueue(
      chatId: widget.chatId,
      startTurn: (text) async {
        final result = await client.startEnvoyHarnessTurn(
          text,
          chatId: widget.chatId,
        );
        final turnId = result['turnId']?.toString() ?? '';
        if (turnId.isEmpty) {
          throw StateError('Missing turnId from startEnvoyHarnessTurn');
        }
        return turnId;
      },
      cancelTurn: () async {
        await client.cancelEnvoyHarnessTurn(chatId: widget.chatId);
      },
      onUserTurn: (text) {
        setState(() {
          _messages.add(_EhMessage(role: 'user', text: text));
          _error = null;
          _systemMessage = null;
        });
        _scrollToEnd();
      },
      onAssistantTurn: (text, turnId) {
        setState(() {
          final streaming = _findStreaming();
          if (streaming != null) {
            streaming
              ..text = text
              ..streaming = false;
          } else {
            _messages.add(_EhMessage(role: 'assistant', text: text));
          }
        });
        _scrollToEnd();
      },
      onAssistantStreaming: (text, turnId) {
        setState(() {
          final streaming = _findStreaming();
          if (streaming != null) {
            streaming.text = text;
          } else {
            _messages.add(
              _EhMessage(role: 'assistant', text: text, streaming: true),
            );
          }
        });
        _scrollToEnd();
      },
      onSystem: (text, {bool error = false}) {
        _setSystem(text, error: error);
      },
      onTurnStart: () {
        if (mounted) setState(() {});
      },
      onTurnEnd: () {
        if (mounted) setState(() {});
      },
    );
    queue.addListener(() {
      if (mounted) setState(() {});
    });
    _queue = queue;
    _unsubs.add(client.on('eh:turn_complete', (data) {
      if (data is Map) queue.handleTurnComplete(data);
    }));
    _unsubs.add(client.on('eh:turn_token', (data) {
      if (data is Map) queue.handleTurnToken(data);
    }));
    _unsubs.add(client.on('eh:prompt_busy', (data) {
      if (data is Map) queue.handlePromptBusy(data);
    }));
    unawaited(_recoverTurnStatus());
  }

  _EhMessage? _findStreaming() {
    for (var i = _messages.length - 1; i >= 0; i--) {
      if (_messages[i].streaming) return _messages[i];
    }
    return null;
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  void dispose() {
    for (final u in _unsubs) {
      u();
    }
    _queue?.dispose();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _setSystem(String text, {bool error = false}) {
    setState(() {
      _systemMessage = text;
      _systemIsError = error;
    });
  }

  Future<void> _refreshStatus() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final s = await client.getEnvoyHarnessStatus();
      if (mounted) setState(() => _status = s);
    } catch (_) {}
  }

  /// Friendly label for the permission policy value.
  String _policyLabel(String? policy) {
    switch (policy) {
      case 'always-confirm':
        return 'Always ask';
      case 'off':
      case 'never':
        return 'Always approve';
      case 'safe-only':
      default:
        return 'Default (safe auto-run)';
    }
  }

  Future<void> _changePolicy(String policy) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final s = await client.setEnvoyHarnessAutoRunPolicy(policy);
      if (mounted) {
        setState(() => _status = s);
        final mode = s['autoRunPolicy']?.toString() ?? policy;
        final when = _busy
            ? ' Applies from the next turn.'
            : '';
        if (mode == 'off' || mode == 'never') {
          _setSystem(
            'Permission policy → Always approve: every tool auto-runs with no '
            'prompts — including write/edit/bash. Only use this in workspaces '
            'you fully trust.$when',
          );
        } else {
          _setSystem(
            'Permission policy → ${_policyLabel(mode)}.$when',
          );
        }
      }
    } catch (e) {
      _setSystem('Failed to set permission policy: $e', error: true);
    }
  }

  Future<void> _recoverTurnStatus() async {
    final client = ref.read(nodeServiceProvider);
    final queue = _queue;
    if (client == null || queue == null) return;
    try {
      final status = await client.getEnvoyHarnessTurnStatus(
        chatId: widget.chatId,
      );
      if (!mounted) return;
      queue.restoreBusyFromStatus(status);
    } catch (_) {}
  }

  Future<void> _loadHistory() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final history = widget.chatId != null
          ? await client.openEnvoyHarnessChat(widget.chatId!)
          : await client.getEnvoyHarnessChatHistory();
      final turns = history['turns'] as List<dynamic>? ?? [];
      final loaded = <_EhMessage>[];
      for (final raw in turns) {
        if (raw is! Map) continue;
        final user = raw['user']?.toString().trim() ?? '';
        final assistant = raw['assistant']?.toString().trim() ?? '';
        if (user.isNotEmpty) {
          loaded.add(_EhMessage(role: 'user', text: user));
        }
        if (assistant.isNotEmpty) {
          loaded.add(_EhMessage(role: 'assistant', text: assistant));
        }
      }
      setState(() {
        _messages
          ..clear()
          ..addAll(loaded);
        _loading = false;
      });
      _scrollToEnd();
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _handleSlashCommand(String text) async {
    final client = ref.read(nodeServiceProvider);
    final l10n = AppLocalizations.of(context);
    if (client == null) return;

    final trimmed = text.trim();
    final slash = envoyHarnessSlashName(trimmed);

    if (slash == 'clear' || slash == 'new' || slash == 'reset') {
      if (_busy) {
        _setSystem(l10n.ehSlashWhileBusy);
        return;
      }
      try {
        await client.resetEnvoyHarnessChat(chatId: widget.chatId);
        _queue?.clearQueue();
        setState(() {
          _messages.clear();
          _controller.clear();
        });
        _setSystem(l10n.ehChatReset);
      } catch (e) {
        _setSystem(e.toString(), error: true);
      }
      return;
    }

    if (slash == 'cancel') {
      _controller.clear();
      if (_busy) {
        try {
          await _queue?.cancelActiveTurn();
          _setSystem(l10n.ehTurnCancelled);
        } catch (e) {
          _setSystem(e.toString(), error: true);
        }
      }
      return;
    }

    if (_busy) {
      _setSystem(l10n.ehSlashWhileBusy);
      _controller.clear();
      return;
    }

    if (slash == 'status') {
      await _refreshStatus();
      _setSystem(l10n.ehStatusRefreshed);
      _controller.clear();
      return;
    }

    if (slash == 'peers' || slash == 'list-agents') {
      try {
        final list = await client.listEnvoyHarnessPeers();
        if (list.isEmpty) {
          _setSystem(l10n.ehNoPeers);
        } else {
          _setSystem(
            list
                .map((p) {
                  final id = p['id']?.toString() ?? '?';
                  final model = p['model']?.toString();
                  return model != null ? '$id ($model)' : id;
                })
                .join('\n'),
          );
        }
      } catch (e) {
        _setSystem(e.toString(), error: true);
      }
      _controller.clear();
      return;
    }

    if (slash == 'cluster') {
      try {
        final cluster =
            await client.invokeEnvoyHarnessEhui({'op': 'clusterStatus'});
        _setSystem(formatEhClusterStatus(cluster));
      } catch (e) {
        _setSystem(e.toString(), error: true);
      }
      _controller.clear();
      return;
    }

    if (slash == 'team') {
      try {
        final jobs = await client.invokeEnvoyHarnessEhui({'op': 'teamJobs'});
        _setSystem(formatEhTeamJobs(jobs));
      } catch (e) {
        _setSystem(e.toString(), error: true);
      }
      _controller.clear();
      return;
    }

    if (slash == 'trace') {
      try {
        final events =
            await client.invokeEnvoyHarnessEhui({'op': 'discoverySnapshot'});
        _setSystem(formatEhDiscoveryEvents(events));
      } catch (e) {
        _setSystem(e.toString(), error: true);
      }
      _controller.clear();
      return;
    }

    if (slash == 'search') {
      final slashName = slash!;
      final term = trimmed.substring(slashName.length + 1).trim();
      if (term.isEmpty) {
        _setSystem(l10n.ehSearchUsage);
      } else {
        final needle = term.toLowerCase();
        final matches = <String>[];
        for (var i = 0; i < _messages.length; i++) {
          final m = _messages[i];
          if (m.text.toLowerCase().contains(needle)) {
            final preview = m.text.replaceAll(RegExp(r'\s+'), ' ').trim();
            final short =
                preview.length > 180 ? '${preview.substring(0, 180)}…' : preview;
            matches.add('[${i + 1}] (${m.role}) $short');
          }
        }
        _setSystem(
          matches.isEmpty ? l10n.ehSearchNoMatches(term) : matches.join('\n\n'),
        );
      }
      _controller.clear();
      return;
    }

    if (slash == 'help') {
      _setSystem(
        formatEnvoyHarnessSlashHelp(
          model: _status?['model']?.toString(),
          cwd: _status?['cwd']?.toString(),
        ),
      );
      _controller.clear();
      return;
    }

    final modelAction = parseEnvoyHarnessModelCommand(trimmed);
    if (modelAction != null) {
      final model = _status?['model']?.toString();
      _setSystem(
        model != null && model.isNotEmpty
            ? l10n.ehModelShow(model)
            : l10n.ehModelUnknown,
      );
      _controller.clear();
      return;
    }

    final cdAction = parseEnvoyHarnessCdCommand(trimmed);
    if (cdAction != null) {
      if (cdAction.type == 'show') {
        final cwd = _status?['cwd']?.toString();
        _setSystem(
          cwd != null && cwd.isNotEmpty
              ? l10n.ehProjectCurrent(cwd)
              : l10n.ehProjectUnset,
        );
        _controller.clear();
        return;
      }
      try {
        final s = await client.setEnvoyHarnessProjectPath(cdAction.path!);
        setState(() => _status = s);
        final cwd = s['cwd']?.toString();
        _setSystem(
          cwd != null && cwd.isNotEmpty
              ? l10n.ehProjectSet(cwd)
              : l10n.ehProjectSetUnknown,
        );
      } catch (e) {
        _setSystem(l10n.ehProjectSetFailed(e.toString()), error: true);
      }
      _controller.clear();
      return;
    }
  }

  Future<void> _send({EhSubmitMode mode = EhSubmitMode.send}) async {
    final queue = _queue;
    if (queue == null) return;
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    if (isEnvoyHarnessLocalSlashCommand(text)) {
      _controller.clear();
      await _handleSlashCommand(text);
      return;
    }

    if (_status != null && _status!['state'] != 'ready') {
      final state = _status!['state']?.toString();
      final l10n = AppLocalizations.of(context);
      _setSystem(
        state == 'disabled'
            ? l10n.ehConfigureModel
            : _status!['error']?.toString() ?? l10n.ehNotReady,
        error: true,
      );
      return;
    }

    // While busy, default send becomes queue (Social composer behavior).
    final effective =
        queue.busy && mode == EhSubmitMode.send ? EhSubmitMode.queue : mode;
    _controller.clear();
    await queue.submit(text, effective);
  }

  Widget _buildSlashSuggest() {
    final value = _controller.text;
    if (!isEnvoyHarnessSlashSuggestInput(value)) {
      return const SizedBox.shrink();
    }
    final hits =
        filterEnvoyHarnessSlashCommands(envoyHarnessSlashCommands, value);
    if (hits.isEmpty) return const SizedBox.shrink();
    final items = hits
        .map((c) {
          final slash = c['slash']?.toString() ?? '';
          final args = (c['argsHint'] as String?)?.trim();
          return (
            primary: args == null || args.isEmpty ? slash : '$slash $args',
            summary: c['summary']?.toString() ?? '',
          );
        })
        .toList();
    return SlashCommandSuggest(
      items: items,
      highlightIndex: _slashHighlight,
      onHighlight: (i) => setState(() => _slashHighlight = i),
      onPick: (slashWithSpace) {
        _controller.text = slashWithSpace;
        _controller.selection = TextSelection.collapsed(
          offset: _controller.text.length,
        );
      },
    );
  }

  Widget _buildQueueBar(AppLocalizations l10n) {
    final queue = _queue;
    if (queue == null || queue.queue.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHigh,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'Queued (${queue.queue.length})',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => queue.clearQueue(),
                  child: const Text('Clear'),
                ),
              ],
            ),
            ...queue.queue.map((item) {
              final preview = item.text.replaceAll(RegExp(r'\s+'), ' ').trim();
              final short =
                  preview.length > 80 ? '${preview.substring(0, 80)}…' : preview;
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(short, maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => queue.removeFromQueue(item.id),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.displayName),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Permission policy',
            onSelected: (value) => unawaited(_changePolicy(value)),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'safe-only',
                child: Text('Default (safe auto-run)'),
              ),
              const PopupMenuItem(
                value: 'always-confirm',
                child: Text('Always ask'),
              ),
              const PopupMenuItem(
                value: 'off',
                child: Text('Always approve'),
              ),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Text(
                _policyLabel(_status?['autoRunPolicy']?.toString()),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
          if (_busy)
            IconButton(
              tooltip: l10n.ehTurnCancelled,
              icon: const Icon(Icons.stop_circle_outlined),
              onPressed: () => unawaited(_queue?.cancelActiveTurn()),
            ),
          if (_status?['cwd'] != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Center(
                child: Text(
                  _status!['cwd']!.toString().split(RegExp(r'[/\\]')).last,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            Material(
              color: scheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  _error!,
                  style: TextStyle(color: scheme.onErrorContainer),
                ),
              ),
            ),
          if (_systemMessage != null)
            Material(
              color: _systemIsError
                  ? scheme.errorContainer
                  : scheme.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: SelectableText(
                  _systemMessage!,
                  style: TextStyle(
                    fontSize: 13,
                    color: _systemIsError
                        ? scheme.onErrorContainer
                        : scheme.onSecondaryContainer,
                  ),
                ),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final msg = _messages[index];
                      final isUser = msg.role == 'user';
                      return Align(
                        alignment: isUser
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * 0.85,
                          ),
                          decoration: BoxDecoration(
                            color: isUser
                                ? scheme.primaryContainer
                                : scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: SelectableText(
                            msg.streaming ? '${msg.text}▍' : msg.text,
                          ),
                        ),
                      );
                    },
                  ),
          ),
          _buildQueueBar(l10n),
          if (_busy)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                children: [
                  Text(
                    l10n.chatsEhThinking,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const Spacer(),
                  Text(
                    'Send queues next',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
            child: _buildSlashSuggest(),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      decoration: InputDecoration(
                        hintText: _busy
                            ? 'Queue a follow-up…'
                            : l10n.chatsEhPromptHint,
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.help_outline),
                          tooltip: l10n.termQuickHelp,
                          onPressed: () => unawaited(
                            _handleSlashCommand('/help'),
                          ),
                        ),
                      ),
                      onSubmitted: (_) => unawaited(_send()),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (_busy)
                    IconButton(
                      tooltip: 'Inject (cancel + send)',
                      onPressed: () =>
                          unawaited(_send(mode: EhSubmitMode.inject)),
                      icon: const Icon(Icons.fast_forward),
                    ),
                  IconButton.filled(
                    onPressed: () => unawaited(_send()),
                    icon: Icon(_busy ? Icons.playlist_add : Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
