import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_composer.dart';
import '../../coding/coding_heartbeat.dart';
import '../../coding/coding_transcript_store.dart';
import '../../eh/eh_timeline.dart';
import '../../ext_agent/agent_attachments.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/terminal_provider.dart';
import '../../screens/files/home_file_pick_screen.dart';
import '../../widgets/agent_attachment_bar.dart';
import '../../widgets/coding_composer_toolbar.dart';
import 'coding_heartbeat_ui.dart';
import 'coding_import_session_sheet.dart';

/// Wire chatId for a Pi coding session (`__pi__:$sessionId`).
String piTimelineChatId(String sessionId) => '__pi__:${sessionId.trim()}';

/// Pi coding agent stream — `eh:timeline` under [piTimelineChatId], composer
/// via [NodeServiceClient.sendToPi] with [sessionId].
class PiCodingChatScreen extends ConsumerStatefulWidget {
  const PiCodingChatScreen({
    super.key,
    required this.sessionId,
    required this.sessionName,
    this.cwd,
  });

  final String sessionId;
  final String sessionName;
  final String? cwd;

  @override
  ConsumerState<PiCodingChatScreen> createState() => _PiCodingChatScreenState();
}

class _PiCodingChatScreenState extends ConsumerState<PiCodingChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final TextEditingController _modelController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<void Function()> _unsubs = [];
  final List<AgentDraftAttachment> _attachments = [];

  late EhTimelineState _timeline;
  List<CodingTranscriptMessage> _seedMessages = const [];
  late CodingComposerPrefs _prefs;
  late final CodingComposerCapabilities _caps;
  late final String _prefsKey;
  Map<String, dynamic>? _status;
  Map<String, dynamic>? _pendingProposal;
  Timer? _statusPoll;
  Timer? _proposalTimeout;
  bool _busy = false;
  bool _didWarmStart = false;
  String? _localError;

  String get _chatId => piTimelineChatId(widget.sessionId);

  List<Map<String, dynamic>> get _liveMessages => _timeline.items
      .where((item) => item['type'] == 'message')
      .toList(growable: false);

  List<Map<String, dynamic>> get _feedItems => _timeline.items
      .where((item) {
        final type = item['type']?.toString();
        if (type == 'message') return false;
        if (type == 'activity' && item['status']?.toString() != 'failed') {
          return false;
        }
        return true;
      })
      .toList(growable: false);

  List<_PiDisplayMsg> get _displayMessages {
    final liveIds = <String>{};
    final live = <_PiDisplayMsg>[];
    for (final item in _liveMessages) {
      final id = item['id']?.toString() ?? '';
      if (id.isNotEmpty) liveIds.add(id);
      live.add(
        _PiDisplayMsg(
          id: id,
          role: item['role']?.toString() ?? 'assistant',
          text: item['text']?.toString() ?? '',
          streaming: item['streaming'] == true,
        ),
      );
    }
    final seed = [
      for (final m in _seedMessages)
        if (!liveIds.contains(m.id))
          _PiDisplayMsg(id: m.id, role: m.role, text: m.text),
    ];
    return [...seed, ...live];
  }

  @override
  void initState() {
    super.initState();
    _timeline = EhTimelineState(chatId: _chatId);
    _caps = codingComposerCapabilities('pi');
    _prefsKey = codingComposerSessionKey(kind: 'pi', id: widget.sessionId);
    _prefs = const CodingComposerPrefs();
    _controller.addListener(() {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wireEvents();
      unawaited(_loadLocalState());
      unawaited(_refreshStatus());
    });
  }

  Future<void> _loadLocalState() async {
    final prefs = await loadCodingComposerPrefs(_prefsKey);
    final seed = await loadCodingTranscript(
      kind: 'pi',
      id: widget.sessionId,
    );
    if (!mounted) return;
    setState(() {
      _prefs = prefs;
      _seedMessages = seed;
      if ((prefs.model ?? '').trim().isNotEmpty) {
        _modelController.text = prefs.model!.trim();
      }
    });
  }

  Future<void> _persistTranscript([
    List<CodingTranscriptMessage>? messages,
  ]) async {
    final next = messages ??
        () {
          final byId = <String, CodingTranscriptMessage>{
            for (final m in _seedMessages) m.id: m,
          };
          for (final m in codingMessagesFromTimelineItems(_timeline.items)) {
            byId[m.id] = m;
          }
          return byId.values.toList();
        }();
    await saveCodingTranscript(
      kind: 'pi',
      id: widget.sessionId,
      messages: next,
    );
    if (mounted) setState(() => _seedMessages = next);
  }

  void _mergeTimelineIntoTranscript() {
    final completed = codingMessagesFromTimelineItems(_timeline.items);
    if (completed.isEmpty) return;
    final byId = <String, CodingTranscriptMessage>{
      for (final m in _seedMessages) m.id: m,
    };
    var changed = false;
    for (final m in completed) {
      final prev = byId[m.id];
      if (prev == null || prev.text != m.text || prev.role != m.role) {
        byId[m.id] = m;
        changed = true;
      }
    }
    if (!changed) return;
    final next = byId.values.toList();
    unawaited(_persistTranscript(next));
  }

  @override
  void dispose() {
    _statusPoll?.cancel();
    _proposalTimeout?.cancel();
    for (final u in _unsubs) {
      u();
    }
    unawaited(_persistTranscript());
    _controller.dispose();
    _modelController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _wireEvents() {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    _unsubs.add(
      client.on('eh:timeline', (data) {
        if (data is! Map) return;
        final next = reduceEhTimeline(
          _timeline,
          Map<String, dynamic>.from(data),
        );
        if (!identical(next, _timeline) && mounted) {
          setState(() => _timeline = next);
          _mergeTimelineIntoTranscript();
          _scrollToEnd();
        }
      }),
    );
    _unsubs.add(
      client.on('pi:proposal', (data) {
        if (data is! Map) return;
        final proposal = data['proposal'];
        if (proposal is! Map) return;
        _proposalTimeout?.cancel();
        final map = Map<String, dynamic>.from(proposal);
        if (!mounted) return;
        setState(() {
          _pendingProposal = map;
          _localError = null;
        });
        final timeoutMs = (map['timeoutMs'] is int)
            ? map['timeoutMs'] as int
            : int.tryParse('${map['timeoutMs']}') ?? 60_000;
        _proposalTimeout = Timer(Duration(milliseconds: timeoutMs + 500), () {
          if (!mounted || _pendingProposal == null) return;
          setState(() {
            _pendingProposal = null;
            _localError = AppLocalizations.of(context).piProposalTimedOut;
          });
        });
      }),
    );
  }

  Future<void> _refreshStatus() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final s = await client.getPiStatus();
      if (!mounted) return;
      setState(() => _status = s);
      final modelSpec = s['modelSpec']?.toString().trim() ?? '';
      if (modelSpec.isNotEmpty && _modelController.text.trim().isEmpty) {
        _modelController.text = modelSpec;
        unawaited(_patchPrefs(_prefs.copyWith(model: modelSpec)));
      }
      final state = s['state']?.toString();
      // Warm-start once when stopped so the first send is not blocked forever.
      if (!_didWarmStart && state == 'stopped') {
        _didWarmStart = true;
        unawaited(_ensurePiRunning());
      }
      _statusPoll?.cancel();
      if (state != null && state != 'ready' && state != 'disabled') {
        _statusPoll = Timer.periodic(const Duration(seconds: 5), (_) {
          unawaited(_refreshStatus());
        });
      }
    } catch (_) {
      // Keep last-known.
    }
  }

  /// Start Pi chat runtime on the home node (distinct from the TUI terminal).
  Future<bool> _ensurePiRunning() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return false;
    try {
      final s = await client.restartPi();
      if (!mounted) return false;
      setState(() => _status = s);
      return s['state']?.toString() == 'ready';
    } catch (_) {
      try {
        final s = await client.getPiStatus();
        if (mounted) setState(() => _status = s);
      } catch (_) {}
      return false;
    }
  }

  Future<void> _patchPrefs(CodingComposerPrefs next) async {
    final saved = await saveCodingComposerPrefs(_prefsKey, next);
    if (!mounted) return;
    setState(() => _prefs = saved);
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _respondToProposal(bool confirmed) async {
    final proposal = _pendingProposal;
    if (proposal == null) return;
    final uiRequestId = proposal['uiRequestId']?.toString() ?? '';
    if (uiRequestId.isEmpty) return;
    _proposalTimeout?.cancel();
    setState(() => _pendingProposal = null);
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.piRespondToProposal(
        uiRequestId: uiRequestId,
        confirmed: confirmed,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _localError = AppLocalizations.of(context).piProposalRespondFailed(
          e.toString().replaceFirst('Exception: ', ''),
        );
      });
    }
  }

  Future<void> _pickAttachment() async {
    final path = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => HomeFilePickScreen(
          initialPath:
              (widget.cwd != null && widget.cwd!.trim().isNotEmpty)
                  ? widget.cwd
                  : null,
        ),
      ),
    );
    if (!mounted || path == null || path.isEmpty) return;
    setState(() {
      _attachments.add(
        AgentDraftAttachment(
          id: 'att_${DateTime.now().microsecondsSinceEpoch}',
          path: path,
          name: attachmentBasename(path),
          mimeType: guessMimeFromName(path),
        ),
      );
    });
  }

  Future<void> _importSession() async {
    final cwd = widget.cwd?.trim() ?? '';
    final sessions = ref.read(terminalProvider).sessions.where((s) {
      if (!s.isPi || s.id == widget.sessionId) return false;
      if (cwd.isEmpty) return true;
      return (s.cwd ?? '').trim() == cwd;
    }).toList();
    await showCodingImportSessionSheet(
      context,
      rows: [
        for (final s in sessions)
          CodingImportSessionRow(
            id: s.id,
            title: s.name,
            subtitle: s.cwd,
          ),
      ],
      onPick: (id) {
        final s = ref
            .read(terminalProvider)
            .sessions
            .where((x) => x.id == id)
            .firstOrNull;
        if (s == null || !mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => PiCodingChatScreen(
              sessionId: s.id,
              sessionName: s.name,
              cwd: s.cwd,
            ),
          ),
        );
      },
    );
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if ((text.isEmpty && _attachments.isEmpty) || _busy) return;
    final l10n = AppLocalizations.of(context);
    final state = _status?['state']?.toString();

    // Only hard-block when Pi cannot be started. `stopped` / `starting` are OK —
    // sendToPi calls ensurePiReady on the home node. The old UI treated `stopped`
    // like "starting" and never sent, so users saw "Pi is starting" forever.
    if (state == 'disabled') {
      setState(() => _localError = l10n.piDisabledHint);
      return;
    }
    if (state == 'not-installed') {
      setState(() => _localError = l10n.piNotInstalledHint);
      return;
    }
    if (state == 'error') {
      setState(() => _localError = l10n.piStartingHint);
      final ok = await _ensurePiRunning();
      if (!mounted) return;
      if (!ok && _status?['state']?.toString() != 'ready') {
        final err = _status?['error']?.toString().trim();
        setState(() {
          _localError = (err != null && err.isNotEmpty)
              ? l10n.piErrorHint(err)
              : l10n.piStartingHint;
        });
        return;
      }
      setState(() => _localError = null);
    }

    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _localError = l10n.piSendFailed('Not connected'));
      return;
    }

    if (state == 'stopped' || state == 'starting' || state == null) {
      setState(() => _localError = l10n.piStartingHint);
      final ok = await _ensurePiRunning();
      if (!mounted) return;
      if (!ok && _status?['state']?.toString() != 'ready') {
        final err = _status?['error']?.toString().trim();
        setState(() {
          _localError = (err != null && err.isNotEmpty)
              ? l10n.piErrorHint(err)
              : l10n.piStartingHint;
        });
        if (_status?['state']?.toString() == 'disabled') {
          setState(() => _localError = l10n.piDisabledHint);
        }
        return;
      }
      setState(() => _localError = null);
    }

    var outbound = shapeCodingComposerPrompt(text, _prefs, _caps);
    final atts = List<AgentDraftAttachment>.from(_attachments);
    if (atts.isNotEmpty) {
      try {
        final built = await client.buildAgentAttachmentContext(
          atts.map((a) => a.toRpc()).toList(),
        );
        if (built['ok'] != true) {
          throw StateError(
            built['error']?.toString() ?? 'Attachment context failed',
          );
        }
        outbound = mergeAgentPromptWithAttachments(
          outbound,
          built['contextText']?.toString(),
        );
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _localError = l10n.piSendFailed(
            e.toString().replaceFirst('Exception: ', ''),
          );
        });
        return;
      }
    }
    if (outbound.trim().isEmpty) return;

    setState(() {
      _busy = true;
      _localError = null;
      _attachments.clear();
    });
    _controller.clear();
    try {
      await client.sendToPi(outbound, sessionId: widget.sessionId);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _localError = l10n.piSendFailed(
          e.toString().replaceFirst('Exception: ', ''),
        );
      });
      unawaited(_refreshStatus());
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  String _stateLabel(AppLocalizations l10n, String? state) {
    return switch (state) {
      'ready' => l10n.piStateReady,
      'starting' => l10n.piStateStarting,
      'disabled' => l10n.piStateDisabled,
      'not-installed' => l10n.piStateNotInstalled,
      'error' => l10n.piStateError,
      'stopped' => l10n.piStateStopped,
      _ => state ?? '',
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final agentLabel = _timeline.agentState?['label']?.toString();
    final statusState = _status?['state']?.toString();
    final modelSpec = _status?['modelSpec']?.toString();
    final display = _displayMessages;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
          if (statusState == 'stopped' ||
              statusState == 'error' ||
              statusState == 'not-installed')
            TextButton(
              onPressed: _busy
                  ? null
                  : () {
                      _didWarmStart = true;
                      unawaited(_ensurePiRunning());
                    },
              child: Text(l10n.piStartAction),
            ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value != 'add-heartbeat') return;
              unawaited(() async {
                final messenger = ScaffoldMessenger.of(context);
                final ok = await showCodingHeartbeatDialog(
                  context,
                  taskTitle: widget.sessionName,
                  target: CodingHeartbeatTargetPi(sessionId: widget.sessionId),
                );
                if (!mounted || !ok) return;
                messenger.showSnackBar(
                  SnackBar(content: Text(l10n.codingHeartbeatSaved)),
                );
              }());
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'add-heartbeat',
                child: Text(l10n.codingHeartbeatAdd),
              ),
            ],
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(36),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Row(
              children: [
                if (statusState != null && statusState.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _stateLabel(l10n, statusState),
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                if (modelSpec != null && modelSpec.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      modelSpec,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                ],
                if (agentLabel != null && agentLabel.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      agentLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          if (widget.cwd != null && widget.cwd!.isNotEmpty)
            Material(
              color: scheme.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    widget.cwd!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                          fontFamily: 'monospace',
                        ),
                  ),
                ),
              ),
            ),
          Expanded(
            child: ListView(
              controller: _scrollController,
              padding: const EdgeInsets.all(12),
              children: [
                if (display.isEmpty && !_busy)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 32),
                    child: Column(
                      children: [
                        Text(
                          l10n.piEmptyTitle,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          l10n.piEmptyBody,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                for (final item in display)
                  _PiMessageBubble(
                    role: item.role,
                    text: item.text,
                    streaming: item.streaming,
                  ),
                for (final item in _feedItems) _PiTimelineCard(item: item),
                if (_localError != null)
                  Card(
                    color: scheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        _localError!,
                        style: TextStyle(color: scheme.onErrorContainer),
                      ),
                    ),
                  ),
                if (_busy)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: scheme.primary,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          l10n.piThinking,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          if (_pendingProposal != null)
            Material(
              elevation: 2,
              color: scheme.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      l10n.piProposalTitle(
                        _pendingProposal!['title']?.toString() ?? '',
                      ),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    if ((_pendingProposal!['message']?.toString() ?? '')
                        .isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        _pendingProposal!['message'].toString(),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontFamily: 'monospace',
                            ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        FilledButton(
                          onPressed: () => unawaited(_respondToProposal(true)),
                          child: Text(l10n.piAllow),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: () => unawaited(_respondToProposal(false)),
                          child: Text(l10n.piDeny),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          CodingComposerToolbar(
            caps: _caps,
            prefs: _prefs,
            modelController: _modelController,
            onPrefsChanged: (p) => unawaited(_patchPrefs(p)),
            onImportSession: _importSession,
            onAttach: _pickAttachment,
          ),
          if (_attachments.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
              child: AgentAttachmentBar(
                attachments: _attachments,
                onRemove: (id) => setState(
                  () => _attachments.removeWhere((a) => a.id == id),
                ),
                onClearAll: () => setState(() => _attachments.clear()),
              ),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: !_busy,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => unawaited(_send()),
                      decoration: InputDecoration(
                        hintText: _busy
                            ? l10n.piThinking
                            : l10n.piPromptPlaceholder,
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _busy ||
                            (_controller.text.trim().isEmpty &&
                                _attachments.isEmpty)
                        ? null
                        : () => unawaited(_send()),
                    icon: const Icon(Icons.send),
                    tooltip: l10n.piSend,
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

class _PiDisplayMsg {
  const _PiDisplayMsg({
    required this.id,
    required this.role,
    required this.text,
    this.streaming = false,
  });

  final String id;
  final String role;
  final String text;
  final bool streaming;
}

class _PiMessageBubble extends StatelessWidget {
  const _PiMessageBubble({
    required this.role,
    required this.text,
    this.streaming = false,
  });

  final String role;
  final String text;
  final bool streaming;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUser = role == 'user';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.85,
        ),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: isUser
                ? scheme.primaryContainer
                : scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: SelectableText(streaming ? '$text…' : text),
        ),
      ),
    );
  }
}

class _PiTimelineCard extends StatelessWidget {
  const _PiTimelineCard({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final type = item['type']?.toString();
    final status = item['status']?.toString();
    final title = switch (type) {
      'activity' => item['summary']?.toString() ?? l10n.ehWorking,
      'completion' => item['summary']?.toString() ?? l10n.ehCompleted,
      'approval' => item['toolName']?.toString() ??
          item['description']?.toString() ??
          l10n.ehUpdate,
      'error' => item['message']?.toString() ?? l10n.ehUpdate,
      _ => item['message']?.toString() ?? type ?? l10n.ehUpdate,
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: status == 'failed' || type == 'error'
          ? scheme.errorContainer
          : scheme.surfaceContainerLow,
      child: ListTile(
        dense: true,
        leading: Icon(
          status == 'failed' || type == 'error'
              ? Icons.error_outline
              : status == 'running'
                  ? Icons.sync
                  : Icons.check_circle_outline,
          size: 20,
        ),
        title: Text(title, style: Theme.of(context).textTheme.bodyMedium),
        subtitle: item['toolName'] != null && type != 'approval'
            ? Text(l10n.ehToolLabel(item['toolName'].toString()))
            : null,
      ),
    );
  }
}
