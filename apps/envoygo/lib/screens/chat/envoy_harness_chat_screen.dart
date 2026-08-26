import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../eh/eh_timeline.dart';
import '../../eh/eh_turn_queue.dart';
import '../../eh/envoy_harness_history.dart';
import '../../ext_agent/envoy_harness_slash_commands.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../widgets/chat/slash_command_suggest.dart';
import '../../widgets/eh/envoy_harness_terminal_chrome.dart';

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
  _EhMessage({
    required this.id,
    required this.role,
    required this.text,
    this.streaming = false,
  });
  final String id;
  final String role;
  String text;
  bool streaming;
}

class _EnvoyHarnessChatScreenState
    extends ConsumerState<EnvoyHarnessChatScreen> {
  final List<_EhMessage> _messages = [];
  final TextEditingController _controller = TextEditingController();
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _loading = true;
  String? _error;
  String? _systemMessage;
  bool _systemIsError = false;
  int _slashHighlight = 0;
  Map<String, dynamic>? _status;
  EhTurnQueue? _queue;
  final List<void Function()> _unsubs = [];
  late EhTimelineState _timeline;
  Timer? _draftSaveTimer;
  bool _searching = false;
  bool _searchTelemetryActive = false;

  bool get _busy => _queue?.busy ?? false;
  List<Map<String, dynamic>> get _nonMessageTimeline => _timeline.items
      .where(
        (item) =>
            item['type'] != 'message' && item['type'] != 'activity',
      )
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    _timeline = EhTimelineState(chatId: widget.chatId ?? '__envoy_harness__');
    _controller.addListener(_onDraftChanged);
    _searchController.addListener(_onSearchChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wireQueue();
      unawaited(_restoreComposerState());
      unawaited(_loadHistory());
      unawaited(_refreshStatus());
    });
  }

  void _onSearchChanged() {
    if (!mounted) return;
    final active = _searchController.text.trim().isNotEmpty;
    setState(() {});
    if (active && !_searchTelemetryActive) {
      final count = _messages
          .where(
            (message) => message.text.toLowerCase().contains(
              _searchController.text.trim().toLowerCase(),
            ),
          )
          .length;
      _recordUx('search_used', resultCount: count);
    }
    _searchTelemetryActive = active;
  }

  void _recordUx(String action, {String? outcome, int? resultCount}) {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    unawaited(
      client
          .recordEnvoyHarnessUxEvent({
            'action': action,
            'surface': 'envoygo',
            if (outcome != null) 'outcome': outcome,
            if (resultCount != null) 'resultCount': resultCount,
            'occurredAt': DateTime.now().toUtc().toIso8601String(),
          })
          .catchError((_) {}),
    );
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
          _messages.add(
            _EhMessage(
              id: 'local-user-${DateTime.now().microsecondsSinceEpoch}',
              role: 'user',
              text: text,
            ),
          );
          _error = null;
          _systemMessage = null;
        });
        _scrollToEnd();
      },
      onAssistantTurn: (text, turnId) {
        setState(() {
          final streaming = _findStreaming();
          final trimmed = _stripThinking(text).trim();
          if (trimmed.isEmpty) {
            // Thinking-only / empty completion: never leave a blank
            // assistant row, and never touch the user bubble above it.
            if (streaming != null) _messages.remove(streaming);
            _systemMessage =
                'envoy-harness finished without a visible reply. Your message is still here — try again or rephrase.';
            _systemIsError = false;
          } else if (streaming != null) {
            streaming
              ..text = trimmed
              ..streaming = false;
          } else {
            _messages.add(
              _EhMessage(id: turnId, role: 'assistant', text: trimmed),
            );
          }
        });
        _scrollToEnd();
      },
      onAssistantStreaming: (text, turnId) {
        // Don't paint thinking-only tokens as the reply bubble.
        final visible = _stripThinking(text);
        if (visible.isEmpty) return;
        setState(() {
          final streaming = _findStreaming();
          if (streaming != null) {
            streaming.text = visible;
          } else {
            _messages.add(
              _EhMessage(
                id: turnId,
                role: 'assistant',
                text: visible,
                streaming: true,
              ),
            );
          }
        });
        _scrollToEnd();
      },
      onSystem: (text, {bool error = false}) {
        // On failure, drop any empty/thinking streaming bubble so the
        // transcript doesn't look like the reply vanished into a blank row.
        setState(() {
          final streaming = _findStreaming();
          if (streaming != null &&
              (streaming.text.trim().isEmpty ||
                  _stripThinking(streaming.text).isEmpty)) {
            _messages.remove(streaming);
          }
        });
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
      unawaited(_persistQueue());
    });
    _queue = queue;
    _unsubs.add(
      client.on('eh:turn_complete', (data) {
        if (data is Map) queue.handleTurnComplete(data);
      }),
    );
    _unsubs.add(
      client.on('eh:turn_token', (data) {
        if (data is Map) queue.handleTurnToken(data);
      }),
    );
    _unsubs.add(
      client.on('eh:prompt_busy', (data) {
        if (data is Map) queue.handlePromptBusy(data);
      }),
    );
    _unsubs.add(
      client.on('eh:timeline', (data) {
        if (data is! Map) return;
        final next = reduceEhTimeline(
          _timeline,
          Map<String, dynamic>.from(data),
        );
        if (!identical(next, _timeline) && mounted) {
          setState(() => _timeline = next);
          _scrollToEnd();
        }
      }),
    );
    unawaited(_recoverTurnStatus());
  }

  String get _composerStorageKey =>
      'envoy_harness_composer_${widget.chatId ?? widget.threadId}';

  void _onDraftChanged() {
    if (mounted) setState(() {});
    _draftSaveTimer?.cancel();
    _draftSaveTimer = Timer(const Duration(milliseconds: 250), () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('${_composerStorageKey}_draft', _controller.text);
    });
  }

  Future<void> _persistQueue() async {
    final queue = _queue;
    if (queue == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      '${_composerStorageKey}_queue',
      queue.queue.map((item) => item.text).toList(),
    );
  }

  Future<void> _restoreComposerState() async {
    final prefs = await SharedPreferences.getInstance();
    final draft = prefs.getString('${_composerStorageKey}_draft');
    final queued =
        prefs.getStringList('${_composerStorageKey}_queue') ?? const [];
    if (!mounted) return;
    if (draft != null && _controller.text.isEmpty) _controller.text = draft;
    final queue = _queue;
    if (queue != null && queue.queue.isEmpty) {
      for (final text in queued) {
        queue.enqueue(text);
      }
    }
  }

  _EhMessage? _findStreaming() {
    for (var i = _messages.length - 1; i >= 0; i--) {
      if (_messages[i].streaming) return _messages[i];
    }
    return null;
  }

  /// Strip `<think>` / `<thinking>` wrappers so stream tokens don't become
  /// a blank-looking final bubble after the host strips them.
  static final RegExp _thinkingBlock = RegExp(
    r'<(?:redacted_thinking|thinking|think)>[\s\S]*?</(?:redacted_thinking|thinking|think)>',
    caseSensitive: false,
  );
  static final RegExp _thinkingUnclosed = RegExp(
    r'<(?:redacted_thinking|thinking|think)>[\s\S]*$',
    caseSensitive: false,
  );

  String _stripThinking(String text) {
    return text
        .replaceAll(_thinkingBlock, '')
        .replaceAll(_thinkingUnclosed, '')
        .replaceAll(RegExp(r'\n{3,}'), '\n\n')
        .trim();
  }

  /// Keep optimistic local messages (esp. the in-flight user turn) when a
  /// late history RPC would otherwise wipe them.
  List<_EhMessage> _mergeHistoryWithLocal(
    List<_EhMessage> incoming,
    List<_EhMessage> local,
  ) {
    if (local.isEmpty) return incoming;
    if (incoming.isEmpty) return local;
    final covered = {
      for (final m in incoming) '${m.role}\0${m.text}',
    };
    final extras = <_EhMessage>[];
    for (var i = local.length - 1; i >= 0; i--) {
      final m = local[i];
      final key = '${m.role}\0${m.text}';
      if (covered.contains(key)) break;
      extras.insert(0, m);
    }
    if (extras.isEmpty) return incoming;
    return [...incoming, ...extras];
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
    _draftSaveTimer?.cancel();
    _controller.removeListener(_onDraftChanged);
    _queue?.dispose();
    _controller.dispose();
    _searchController
      ..removeListener(_onSearchChanged)
      ..dispose();
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
        final when = _busy ? ' Applies from the next turn.' : '';
        if (mode == 'off' || mode == 'never') {
          _setSystem(
            'Permission policy → Always approve: every tool auto-runs with no '
            'prompts — including write/edit/bash. Only use this in workspaces '
            'you fully trust.$when',
          );
        } else {
          _setSystem('Permission policy → ${_policyLabel(mode)}.$when');
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

  Future<void> _copyMessage(_EhMessage msg) async {
    await Clipboard.setData(ClipboardData(text: msg.text));
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l10n.commonCopied)),
    );
  }

  Future<void> _deleteMessage(_EhMessage msg) async {
    if (msg.streaming) return;
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatDeleteMessageTitle),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final client = ref.read(nodeServiceProvider);
    if (client == null) return;

    // Optimistic remove; restore from history if the RPC fails.
    final snapshot = List<_EhMessage>.from(_messages);
    setState(() => _messages.removeWhere((m) => m.id == msg.id));

    try {
      var turnId = msg.id;
      if (!turnId.startsWith('eh-msg-')) {
        // Local/temp ids: resolve the persisted turn by role + text.
        final history = widget.chatId != null
            ? await client.openEnvoyHarnessChat(widget.chatId!)
            : await client.getEnvoyHarnessChatHistory();
        final matches = parseEnvoyHarnessHistory(history['turns'])
            .where((t) => t.role == msg.role && t.text == msg.text)
            .toList();
        if (matches.isEmpty) return;
        turnId = matches.last.id;
      }
      final result = await client.deleteEnvoyHarnessChatTurn(
        turnId: turnId,
        chatId: widget.chatId,
      );
      if (!mounted) return;
      final loaded = parseEnvoyHarnessHistory(result['turns'])
          .map(
            (m) => _EhMessage(id: m.id, role: m.role, text: m.text),
          )
          .toList();
      setState(() {
        _messages
          ..clear()
          ..addAll(loaded);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(snapshot);
      });
      _setSystem(e.toString(), error: true);
    }
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
      final loaded = parseEnvoyHarnessHistory(history['turns'])
          .map(
            (message) => _EhMessage(
              id: message.id,
              role: message.role,
              text: message.text,
            ),
          )
          .toList();
      // Snapshot BEFORE mutating — cascade `..clear()..addAll(merge(..., List.of(_messages)))`
      // would merge against an already-empty list and drop the in-flight human bubble.
      final localSnapshot = List<_EhMessage>.from(_messages);
      final merged = _mergeHistoryWithLocal(loaded, localSnapshot);
      setState(() {
        _messages
          ..clear()
          ..addAll(merged);
        _loading = false;
        _timeline = EhTimelineState(
          chatId:
              history['chatId']?.toString() ??
              widget.chatId ??
              '__envoy_harness__',
          items: dedupeEhTimelineItems(history['timeline']),
        );
      });
      _scrollToEnd();
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _revertTurn(String turnId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context).ehRevertTitle),
        content: Text(AppLocalizations.of(context).ehRevertBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(AppLocalizations.of(context).commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(AppLocalizations.of(context).ehRevertAction),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    _recordUx('revert_attempted');
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final result = await client.revertEnvoyHarnessTurn(turnId);
      if (!mounted) return;
      if (result['reverted'] == true) {
        _recordUx('revert_completed', outcome: 'success');
        _setSystem(AppLocalizations.of(context).ehRevertComplete);
        await _loadHistory();
      } else {
        final conflicts = (result['conflicts'] as List?)?.join(', ');
        _recordUx(
          conflicts == null || conflicts.isEmpty
              ? 'revert_completed'
              : 'revert_conflicted',
          outcome: conflicts == null || conflicts.isEmpty
              ? 'unavailable'
              : 'conflict',
        );
        _setSystem(
          conflicts == null || conflicts.isEmpty
              ? AppLocalizations.of(context).ehRevertUnavailable
              : AppLocalizations.of(context).ehRevertConflict(conflicts),
          error: true,
        );
      }
    } catch (error) {
      _setSystem(error.toString(), error: true);
    }
  }

  Future<void> _reviewTurn(String turnId) async {
    _recordUx('review_opened');
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final review = await client.getEnvoyHarnessTurnReview(turnId);
      if (!mounted) return;
      if (review == null) {
        _setSystem(
          AppLocalizations.of(context).ehReviewUnavailable,
          error: true,
        );
        return;
      }
      final files =
          (review['files'] as List?)?.whereType<Map>().toList() ?? const [];
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.85,
          builder: (context, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                AppLocalizations.of(context).ehReviewTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              for (final raw in files)
                Card(
                  child: ExpansionTile(
                    initiallyExpanded: true,
                    title: Text(
                      raw['path']?.toString() ??
                          AppLocalizations.of(context).ehReviewFile,
                    ),
                    subtitle: Text(
                      raw['attribution']?.toString() == 'workspace'
                          ? '${raw['status']?.toString() ?? 'modified'} · ${AppLocalizations.of(context).ehReviewOnly}'
                          : raw['status']?.toString() ?? 'modified',
                    ),
                    trailing: raw['status']?.toString() == 'deleted'
                        ? null
                        : IconButton(
                            tooltip: AppLocalizations.of(
                              context,
                            ).ehReviewOpenFile,
                            icon: const Icon(Icons.open_in_new),
                            onPressed: () => unawaited(() async {
                              try {
                                await client.openEnvoyHarnessFile(
                                  raw['path'].toString(),
                                  chatId: widget.chatId,
                                );
                              } catch (error) {
                                if (mounted) {
                                  _setSystem(error.toString(), error: true);
                                }
                              }
                            }()),
                          ),
                    childrenPadding: const EdgeInsets.all(12),
                    children: [
                      SelectableText(
                        raw['diff']?.toString() ??
                            AppLocalizations.of(
                              context,
                            ).ehReviewDiffUnavailable,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
    } catch (error) {
      _setSystem(error.toString(), error: true);
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
        final cluster = await client.invokeEnvoyHarnessEhui({
          'op': 'clusterStatus',
        });
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
        final events = await client.invokeEnvoyHarnessEhui({
          'op': 'discoverySnapshot',
        });
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
            final short = preview.length > 180
                ? '${preview.substring(0, 180)}…'
                : preview;
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
    final effective = queue.busy && mode == EhSubmitMode.send
        ? EhSubmitMode.queue
        : mode;
    _controller.clear();
    await queue.submit(text, effective);
  }

  Widget _buildSlashSuggest() {
    final value = _controller.text;
    if (!isEnvoyHarnessSlashSuggestInput(value)) {
      return const SizedBox.shrink();
    }
    final hits = filterEnvoyHarnessSlashCommands(
      envoyHarnessSlashCommands,
      value,
    );
    if (hits.isEmpty) return const SizedBox.shrink();
    final items = hits.map((c) {
      final slash = c['slash']?.toString() ?? '';
      final args = (c['argsHint'] as String?)?.trim();
      return (
        primary: args == null || args.isEmpty ? slash : '$slash $args',
        summary: c['summary']?.toString() ?? '',
      );
    }).toList();
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
              final short = preview.length > 80
                  ? '${preview.substring(0, 80)}…'
                  : preview;
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  short,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
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
    final transcriptQuery = _searchController.text.trim().toLowerCase();
    final transcriptMatches = transcriptQuery.isEmpty
        ? _messages
        : _messages
              .where(
                (message) =>
                    message.text.toLowerCase().contains(transcriptQuery),
              )
              .toList();
    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: l10n.ehSearchTranscript,
                  border: InputBorder.none,
                ),
              )
            : Text(widget.displayName),
        actions: [
          IconButton(
            tooltip: _searching ? l10n.ehSearchClose : l10n.ehSearchTranscript,
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) _searchController.clear();
            }),
          ),
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
              const PopupMenuItem(value: 'off', child: Text('Always approve')),
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
        bottom: _searching
            ? PreferredSize(
                preferredSize: const Size.fromHeight(28),
                child: Semantics(
                  liveRegion: true,
                  label: l10n.ehMatchCount(transcriptMatches.length),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(
                      l10n.ehMatchCount(transcriptMatches.length),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ),
              )
            : null,
      ),
      body: Column(
        children: [
          if (_timeline.agentState != null)
            Container(
              width: double.infinity,
              color: scheme.surfaceContainerHighest,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
              child: Row(
                children: [
                  Icon(Icons.circle, size: 8, color: scheme.primary),
                  const SizedBox(width: 8),
                  Text(
                    _timeline.agentState!['label']?.toString() ?? 'Working',
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  if (_timeline.agentState!['activitySummary'] != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _timeline.agentState!['activitySummary'].toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ],
              ),
            ),
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
          EnvoyHarnessTerminalChrome(
            chatId: widget.chatId,
            showCommandRails: false,
            onSendToTerminal: (text) {
              final value = text.trim();
              if (value.isEmpty) return;
              _controller.text = value;
              unawaited(_send());
            },
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : Builder(
                    builder: (context) {
                      final query = transcriptQuery;
                      final visibleMessages = transcriptMatches;
                      if (query.isNotEmpty && visibleMessages.isEmpty) {
                        return Center(child: Text(l10n.ehNoMatches));
                      }
                      return ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(12),
                        itemCount:
                            visibleMessages.length +
                            (query.isEmpty ? _nonMessageTimeline.length : 0),
                        itemBuilder: (context, index) {
                          if (index >= visibleMessages.length) {
                            return _MobileTimelineCard(
                              item:
                                  _nonMessageTimeline[index -
                                      visibleMessages.length],
                              onReview: (turnId) =>
                                  unawaited(_reviewTurn(turnId)),
                              onRevert: (turnId) =>
                                  unawaited(_revertTurn(turnId)),
                            );
                          }
                          final msg = visibleMessages[index];
                          final isUser = msg.role == 'user';
                          return Align(
                            alignment: isUser
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth:
                                    MediaQuery.sizeOf(context).width * 0.85,
                              ),
                              child: Column(
                                crossAxisAlignment: isUser
                                    ? CrossAxisAlignment.end
                                    : CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    margin: const EdgeInsets.only(bottom: 2),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 8,
                                    ),
                                    decoration: BoxDecoration(
                                      color: isUser
                                          ? scheme.primaryContainer
                                          : scheme.surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: _CodingMessageBody(
                                      text: msg.streaming
                                          ? '${msg.text}▍'
                                          : msg.text,
                                      assistant: !isUser,
                                    ),
                                  ),
                                  if (!msg.streaming)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 2),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          _EhBubbleIconButton(
                                            icon: Icons.content_copy,
                                            tooltip: l10n.ehCopyTurn,
                                            onPressed: () =>
                                                unawaited(_copyMessage(msg)),
                                          ),
                                          _EhBubbleIconButton(
                                            icon: Icons.delete_outline,
                                            tooltip: l10n.commonDelete,
                                            onPressed: () =>
                                                unawaited(_deleteMessage(msg)),
                                          ),
                                        ],
                                      ),
                                    ),
                                  const SizedBox(height: 6),
                                ],
                              ),
                            ),
                          );
                        },
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
                          onPressed: () =>
                              unawaited(_handleSlashCommand('/help')),
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

class _MobileTimelineCard extends StatelessWidget {
  const _MobileTimelineCard({required this.item, this.onReview, this.onRevert});

  final Map<String, dynamic> item;
  final ValueChanged<String>? onReview;
  final ValueChanged<String>? onRevert;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final type = item['type']?.toString();
    final status = item['status']?.toString();
    final scheme = Theme.of(context).colorScheme;
    final icon = status == 'failed'
        ? Icons.error_outline
        : status == 'running'
        ? Icons.sync
        : type == 'changes'
        ? Icons.difference_outlined
        : Icons.check_circle_outline;
    final title = switch (type) {
      'activity' => item['summary']?.toString() ?? l10n.ehWorking,
      'changes' => '${(item['files'] as List?)?.length ?? 0} file(s) changed',
      'completion' => item['summary']?.toString() ?? l10n.ehCompleted,
      _ => item['message']?.toString() ?? type ?? l10n.ehUpdate,
    };
    final files =
        (item['files'] as List?)?.map((value) => '$value').toList() ??
        const <String>[];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: status == 'failed'
          ? scheme.errorContainer
          : scheme.surfaceContainerLow,
      child: ExpansionTile(
        leading: Icon(icon, size: 20),
        title: Text(title, style: Theme.of(context).textTheme.bodyMedium),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          if (item['toolName'] != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Text(l10n.ehToolLabel(item['toolName'].toString())),
            ),
          for (final file in files)
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                file,
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            ),
          if (type == 'changes' && item['turnId'] != null && onRevert != null)
            Align(
              alignment: Alignment.centerRight,
              child: Wrap(
                children: [
                  if (onReview != null)
                    TextButton.icon(
                      onPressed: () => onReview!(item['turnId'].toString()),
                      icon: const Icon(Icons.rate_review_outlined),
                      label: Text(l10n.ehReviewDiff),
                    ),
                  TextButton.icon(
                    onPressed: () => onRevert!(item['turnId'].toString()),
                    icon: const Icon(Icons.undo),
                    label: Text(l10n.ehRevertThisTurn),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Compact icon-only action (matches Social chat bubble copy/delete).
class _EhBubbleIconButton extends StatelessWidget {
  const _EhBubbleIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(
              icon,
              size: 16,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}

/// Lightweight coding-agent renderer: prose remains selectable while fenced
/// code and diffs get a distinct monospace surface and copy affordance.
class _CodingMessageBody extends StatelessWidget {
  const _CodingMessageBody({required this.text, required this.assistant});

  final String text;
  final bool assistant;

  @override
  Widget build(BuildContext context) {
    if (!assistant || !text.contains('```')) return SelectableText(text);
    final chunks = text.split('```');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < chunks.length; i++)
          if (chunks[i].trim().isNotEmpty)
            i.isEven
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: SelectableText(chunks[i].trim()),
                  )
                : _CodeBlock(raw: chunks[i]),
      ],
    );
  }
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock({required this.raw});

  final String raw;

  @override
  Widget build(BuildContext context) {
    final firstBreak = raw.indexOf('\n');
    final language = firstBreak < 0 ? '' : raw.substring(0, firstBreak).trim();
    final code = (firstBreak < 0 ? raw : raw.substring(firstBreak + 1))
        .trimRight();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 5),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border.all(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (language.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 10),
                  child: Text(
                    language,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
              const Spacer(),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Copy code',
                icon: const Icon(Icons.copy, size: 17),
                onPressed: () => Clipboard.setData(ClipboardData(text: code)),
              ),
            ],
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: SelectableText(
              code,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
