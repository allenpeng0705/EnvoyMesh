import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';
import '../../terminal/terminal_slash_commands.dart';
import '../chat/slash_command_suggest.dart';

/// Shell Terminal Agent bar — Social `TerminalAgentBar` slash parity for EnvoyGo.
class TerminalAgentBar extends ConsumerStatefulWidget {
  const TerminalAgentBar({
    super.key,
    required this.sessionId,
    required this.onEditInTerminal,
  });

  final String sessionId;
  final void Function(String command) onEditInTerminal;

  @override
  ConsumerState<TerminalAgentBar> createState() => _TerminalAgentBarState();
}

class _AgentTurn {
  _AgentTurn({required this.kind, required this.text, this.error = false});
  final String kind; // user | assistant | system | explain
  final String text;
  final bool error;
}

class _TerminalAgentBarState extends ConsumerState<TerminalAgentBar> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scroll = ScrollController();
  TerminalPanelMode _mode = TerminalPanelMode.agent;
  bool _busy = false;
  bool _expanded = true;
  bool _showHelp = false;
  Map<String, dynamic>? _assistState;
  Map<String, dynamic>? _pending;
  final List<_AgentTurn> _turns = [];
  int _slashHighlight = 0;
  void Function()? _unsubProposal;

  NodeServiceClient? get _client => ref.read(nodeServiceProvider);

  String get _modelLabel {
    final s = _assistState;
    if (s == null) return 'default';
    final override = s['assistModelOverride']?.toString();
    if (override != null && override.isNotEmpty) return override;
    final def = s['defaultModelName']?.toString();
    if (def != null && def.isNotEmpty) return def;
    return 'default';
  }

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_refreshAssistState());
      final client = _client;
      if (client != null) {
        _unsubProposal = client.on('terminal:assistant-proposal', (event) {
          if (event is! Map) return;
          if (event['sessionId']?.toString() != widget.sessionId) return;
          unawaited(_refreshAssistState());
        });
      }
    });
  }

  @override
  void dispose() {
    _unsubProposal?.call();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _append(_AgentTurn turn) {
    setState(() => _turns.add(turn));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 160),
        curve: Curves.easeOut,
      );
    });
  }

  void _setMessage(String text, {bool error = false}) {
    final t = text.trim();
    if (t.isEmpty) return;
    _append(_AgentTurn(kind: 'system', text: t, error: error));
  }

  Future<void> _refreshAssistState() async {
    final client = _client;
    if (client == null) return;
    try {
      final state = await client.terminalGetAssistState(widget.sessionId);
      if (!mounted) return;
      setState(() {
        _assistState = state;
        final pending = state['pendingProposal'];
        _pending = pending is Map ? Map<String, dynamic>.from(pending) : null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _assistState = null;
        _pending = null;
      });
    }
  }

  void _applyGoalLoopResult(Map<String, dynamic> result) {
    final proposal = result['proposal'];
    if (proposal is Map) {
      setState(() => _pending = Map<String, dynamic>.from(proposal));
    }
    switch (result['status']?.toString()) {
      case 'complete':
        _setMessage('Goal complete');
        setState(() => _pending = null);
      case 'max_steps':
        _setMessage('Goal reached max steps (${result['stepCount']})');
      case 'failed_output':
        _setMessage('Goal stopped — failed output', error: true);
      case 'awaiting_confirm':
        _setMessage('Awaiting confirm (step ${result['stepCount']})');
      case 'continuing':
        _setMessage('Continuing goal (step ${result['stepCount']})');
      default:
        break;
    }
  }

  Future<void> _advanceGoalLoop() async {
    final client = _client;
    if (client == null) return;
    var result =
        await client.terminalAdvanceGoalLoop(sessionId: widget.sessionId);
    _applyGoalLoopResult(result);
    while (result['status'] == 'continuing' && result['executed'] == true) {
      result =
          await client.terminalAdvanceGoalLoop(sessionId: widget.sessionId);
      _applyGoalLoopResult(result);
    }
    await _refreshAssistState();
  }

  Future<void> _runProposal(
    Map<String, dynamic> proposal, {
    required bool confirmed,
  }) async {
    final client = _client;
    if (client == null) return;
    final proposalId = proposal['proposalId']?.toString();
    if (proposalId == null || proposalId.isEmpty) return;
    final needsConfirm = proposal['requiresConfirmation'] == true;
    setState(() => _busy = true);
    try {
      await client.terminalExecuteProposal(
        sessionId: widget.sessionId,
        proposalId: proposalId,
        confirmed: needsConfirm ? confirmed : null,
      );
      setState(() => _pending = null);
      _setMessage('Executed');
      await _refreshAssistState();
      final state = await client.terminalGetAssistState(widget.sessionId);
      final loop = state['goalLoop'];
      if (loop is Map && loop['active'] == true) {
        await _advanceGoalLoop();
      }
    } catch (e) {
      _setMessage(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _handleSubmit(String line) async {
    final trimmed = line.trim();
    if (trimmed.isEmpty || _busy) return;
    final client = _client;
    if (client == null) return;

    setState(() {
      _busy = true;
      _showHelp = false;
    });

    final action = parseTerminalSlashCommand(trimmed);
    if (action == null) {
      setState(() => _busy = false);
      return;
    }

    try {
      switch (action) {
        case TerminalSlashHelp():
          setState(() => _showHelp = true);
          _setMessage('Help opened');
        case TerminalSlashManual():
          setState(() => _mode = TerminalPanelMode.manual);
          _setMessage('Switched to Manual');
        case TerminalSlashAgent():
          setState(() => _mode = TerminalPanelMode.agent);
          _setMessage('Switched to Agent');
        case TerminalSlashModelShow():
          _setMessage('Assist model: $_modelLabel');
        case TerminalSlashModelList():
          final cfg = await client.getNodeConfig();
          final names = <String>[
            if (cfg['terminalAssistModelName'] != null)
              cfg['terminalAssistModelName'].toString(),
            if (cfg['modelProviders'] is Map) ...[
              if ((cfg['modelProviders'] as Map)['modelName'] != null)
                (cfg['modelProviders'] as Map)['modelName'].toString(),
              if ((cfg['modelProviders'] as Map)['mode'] != null)
                (cfg['modelProviders'] as Map)['mode'].toString(),
            ],
          ].where((n) => n.isNotEmpty).toList();
          _setMessage(names.isEmpty ? 'default' : names.join(', '));
        case TerminalSlashModelSet(:final modelName):
          await client.terminalSetAssistModelOverride(
            sessionId: widget.sessionId,
            modelName: modelName,
          );
          await _refreshAssistState();
          _setMessage('Model set: $modelName');
        case TerminalSlashModelDefault():
          await client.terminalSetAssistModelOverride(
            sessionId: widget.sessionId,
            modelName: '',
          );
          await _refreshAssistState();
          _setMessage('Model override cleared');
        case TerminalSlashExplain(:final topic):
          final result = await client.terminalExplainScrollback(
            sessionId: widget.sessionId,
            topic: topic,
          );
          final text = result['explanation']?.toString().trim() ?? '';
          if (text.isNotEmpty) {
            _append(_AgentTurn(kind: 'explain', text: text));
          }
        case TerminalSlashSuggestOn():
          await client.terminalSetInlineSuggestEnabled(
            sessionId: widget.sessionId,
            enabled: true,
          );
          await _refreshAssistState();
          setState(() => _mode = TerminalPanelMode.manual);
          _setMessage('Inline suggest on');
        case TerminalSlashSuggestOff():
          await client.terminalSetInlineSuggestEnabled(
            sessionId: widget.sessionId,
            enabled: false,
          );
          await _refreshAssistState();
          _setMessage('Inline suggest off');
        case TerminalSlashRun() || TerminalSlashConfirm():
          final pending = _pending;
          if (pending != null) {
            await _runProposal(pending, confirmed: true);
          } else {
            _setMessage('No pending proposal');
          }
        case TerminalSlashCancel():
          setState(() => _pending = null);
          _setMessage('Cancelled');
        case TerminalSlashHistory():
          final state = await client.terminalGetAssistState(widget.sessionId);
          final recent = state['recentProposals'] as List<dynamic>? ?? [];
          if (recent.isEmpty) {
            _setMessage('No history');
          } else {
            _setMessage(
              recent.map((p) {
                if (p is! Map) return p.toString();
                return '[${p['riskTier']}] ${p['command']} (${p['createdAt']})';
              }).join('\n'),
            );
          }
        case TerminalSlashObserve():
          final loop = _assistState?['goalLoop'];
          final goal = (loop is Map ? loop['goal']?.toString() : null) ??
              _assistState?['lastGoal']?.toString();
          if (goal == null || goal.isEmpty) {
            _setMessage('No goal set — use /goal first');
            break;
          }
          _setMessage('Observing…');
          final result = await client.terminalObserveStep(
            sessionId: widget.sessionId,
            goal: goal,
          );
          final next = result['nextProposal'];
          if (next is Map) {
            setState(() => _pending = Map<String, dynamic>.from(next));
            await _refreshAssistState();
            _setMessage(
              result['stable'] == true ? 'Observe ready' : 'Observe timed out',
            );
          } else {
            _setMessage(
              result['stable'] == true ? 'Output stable' : 'Observe timed out',
            );
          }
        case TerminalSlashOpenClaw(:final prompt):
          await client.terminalOpenClawPlan(
            sessionId: widget.sessionId,
            prompt: prompt,
          );
          await _refreshAssistState();
          _setMessage('Plan ready');
        case TerminalSlashPrepareOn():
          final result = await client.terminalEnablePrepareMode(
            sessionId: widget.sessionId,
            enabled: true,
          );
          await _refreshAssistState();
          _setMessage(
            result['markerWritten'] == true
                ? 'Prepare mode on'
                : 'Prepare mode failed',
            error: result['markerWritten'] != true,
          );
        case TerminalSlashPrepareOff():
          await client.terminalEnablePrepareMode(
            sessionId: widget.sessionId,
            enabled: false,
          );
          await _refreshAssistState();
          _setMessage('Prepare mode off');
        case TerminalSlashWatch(:final goal):
          final g = goal.isNotEmpty
              ? goal
              : (_assistState?['lastGoal']?.toString() ??
                  _assistState?['watchGoal']?.toString() ??
                  '');
          if (g.isEmpty) {
            _setMessage('No goal set — use /goal or /watch <goal>');
            break;
          }
          final result = await client.terminalWatchStep(
            sessionId: widget.sessionId,
            goal: g,
          );
          final proposal = result['proposal'];
          if (proposal is Map) {
            setState(() => _pending = Map<String, dynamic>.from(proposal));
            await _refreshAssistState();
            _setMessage('Watch proposal ready');
          } else {
            _setMessage(
              result['changed'] == true ? 'Scrollback changed' : 'No change',
            );
          }
        case TerminalSlashPin(:final contextSessionId):
          await client.terminalPinContextSession(
            sessionId: widget.sessionId,
            contextSessionId: contextSessionId,
          );
          await _refreshAssistState();
          _setMessage(
            contextSessionId != null
                ? 'Pinned $contextSessionId'
                : 'Unpinned context',
          );
        case TerminalSlashStep(:final stepIndex):
          final plan = _assistState?['activePlan'];
          if (plan is! Map) {
            _setMessage('No active plan — use /openclaw first');
            break;
          }
          final planId = plan['planId']?.toString();
          if (planId == null) break;
          final proposal = await client.terminalRunPlanStep(
            sessionId: widget.sessionId,
            planId: planId,
            stepIndex: stepIndex,
          );
          setState(() => _pending = proposal);
          await _refreshAssistState();
          _setMessage('Plan step ${stepIndex + 1}');
        case TerminalSlashGoal(:final prompt):
          final result = await client.terminalStartGoalLoop(
            sessionId: widget.sessionId,
            goal: prompt,
          );
          _applyGoalLoopResult(result);
          await _refreshAssistState();
          if (result['status'] == 'continuing' && result['executed'] == true) {
            await _advanceGoalLoop();
          }
        case TerminalSlashGoalStop():
          await client.terminalCancelGoalLoop(sessionId: widget.sessionId);
          await _refreshAssistState();
          _setMessage('Goal stopped');
        case TerminalSlashGoalContinue():
          await _advanceGoalLoop();
        case TerminalSlashWatchBg(:final goal):
          await client.terminalSetBackgroundWatch(
            sessionId: widget.sessionId,
            goal: goal,
          );
          await _refreshAssistState();
          _setMessage('Background watch on');
        case TerminalSlashWatchBgOff():
          await client.terminalClearBackgroundWatch(
            sessionId: widget.sessionId,
          );
          await _refreshAssistState();
          _setMessage('Background watch off');
        case TerminalSlashExecOn():
          await client.terminalEnableExecPane(
            sessionId: widget.sessionId,
            enabled: true,
          );
          await _refreshAssistState();
          _setMessage('Exec pane on');
        case TerminalSlashExecOff():
          await client.terminalEnableExecPane(
            sessionId: widget.sessionId,
            enabled: false,
          );
          await _refreshAssistState();
          _setMessage('Exec pane off');
        case TerminalSlashNl(:final prompt):
          _append(_AgentTurn(kind: 'user', text: prompt));
          final proposal = await client.terminalRunFromNaturalLanguage(
            sessionId: widget.sessionId,
            prompt: prompt,
          );
          setState(() => _pending = proposal);
          final cmd = proposal['command']?.toString().trim() ?? '';
          if (cmd.isNotEmpty) {
            _append(_AgentTurn(kind: 'assistant', text: '→ $cmd'));
          }
          await _refreshAssistState();
      }
    } catch (e) {
      _setMessage(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _buildSlashSuggest() {
    final value = _controller.text;
    final hits = filterTerminalAgentSlashCommands(value);
    if (hits.isEmpty) return const SizedBox.shrink();
    final items = hits
        .map((c) {
          final slash = c['slash'] ?? '';
          final args = c['argsHint']?.trim();
          return (
            primary: args == null || args.isEmpty ? slash : '$slash $args',
            summary: c['summary'] ?? '',
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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pendingCmd = _pending?['command']?.toString();

    return Material(
      color: scheme.surfaceContainerHigh,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            dense: true,
            title: Text(
              'Terminal Agent · ${_mode == TerminalPanelMode.agent ? 'agent' : 'manual'}',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            subtitle: Text(
              _modelLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: IconButton(
              icon: Icon(_expanded ? Icons.expand_more : Icons.expand_less),
              onPressed: () => setState(() => _expanded = !_expanded),
            ),
          ),
          if (_expanded) ...[
            if (_showHelp)
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 160),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: SelectableText(
                    terminalSlashHelpText(
                      mode: _mode,
                      modelLabel: _modelLabel,
                      autoRunPolicy:
                          _assistState?['autoRunPolicy']?.toString() ?? 'ask',
                      inlineSuggest:
                          _assistState?['inlineSuggestEnabled'] == true,
                    ),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontFamily: 'monospace',
                          fontSize: 11,
                        ),
                  ),
                ),
              ),
            if (_turns.isNotEmpty)
              SizedBox(
                height: 120,
                child: ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: _turns.length,
                  itemBuilder: (context, i) {
                    final t = _turns[i];
                    final color = t.error
                        ? scheme.error
                        : t.kind == 'user'
                            ? scheme.primary
                            : scheme.onSurface;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        t.text,
                        style: TextStyle(
                          fontSize: 12,
                          color: color,
                          fontFamily:
                              t.kind == 'assistant' ? 'monospace' : null,
                        ),
                      ),
                    );
                  },
                ),
              ),
            if (pendingCmd != null && pendingCmd.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '→ $pendingCmd',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => unawaited(
                                _runProposal(_pending!, confirmed: true),
                              ),
                      child: const Text('Run'),
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () {
                              widget.onEditInTerminal(pendingCmd);
                              setState(() => _pending = null);
                            },
                      child: const Text('Edit'),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () => setState(() => _pending = null),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 0),
              child: _buildSlashSuggest(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: !_busy,
                      minLines: 1,
                      maxLines: 3,
                      decoration: InputDecoration(
                        isDense: true,
                        hintText: _mode == TerminalPanelMode.agent
                            ? '/goal … or ask in natural language'
                            : '/agent to enable assist',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.help_outline, size: 20),
                          onPressed: () => unawaited(_handleSubmit('/help')),
                        ),
                      ),
                      onSubmitted: (v) {
                        _controller.clear();
                        unawaited(_handleSubmit(v));
                      },
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    onPressed: _busy
                        ? null
                        : () {
                            final v = _controller.text;
                            _controller.clear();
                            unawaited(_handleSubmit(v));
                          },
                    icon: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send, size: 18),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
