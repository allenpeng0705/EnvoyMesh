import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_heartbeat.dart';
import '../../eh/eh_timeline.dart';
import '../../ext_agent/ext_agent_presets.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/coding_ext_sessions.dart';
import 'coding_heartbeat_ui.dart';
import 'coding_new_workspace_sheet.dart';

/// Wire chatId for an Ext Agent coding session (`__ext__:$sessionId`).
String extTimelineChatId(String sessionId) => '__ext__:${sessionId.trim()}';

const _streamingExtHarnesses = {'codex', 'claudecode'};

class _LocalMsg {
  const _LocalMsg({
    required this.id,
    required this.role,
    required this.text,
    this.streaming = false,
  });

  final String id;
  final String role; // user | assistant | system
  final String text;
  final bool streaming;
}

/// Coding Tier B — Ext Agent ask in Coding chrome.
///
/// Streaming harnesses (codex / claudecode) reuse `eh:timeline` under
/// `__ext__:${sessionId}`; one-shot backends stay sync ask.
class ExtAgentCodingScreen extends ConsumerStatefulWidget {
  const ExtAgentCodingScreen({
    super.key,
    required this.sessionId,
    required this.harness,
    required this.cwd,
    this.title,
  });

  final String sessionId;
  final String harness;
  final String cwd;
  final String? title;

  @override
  ConsumerState<ExtAgentCodingScreen> createState() =>
      _ExtAgentCodingScreenState();
}

class _ExtAgentCodingScreenState extends ConsumerState<ExtAgentCodingScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<void Function()> _unsubs = [];

  late EhTimelineState _timeline;
  final List<_LocalMsg> _messages = [];
  Map<String, dynamic>? _reach;
  bool _busy = false;
  String? _localError;

  String get _agentId => widget.harness.trim();
  String get _chatId => extTimelineChatId(widget.sessionId);
  bool get _canStream => _streamingExtHarnesses.contains(_agentId);
  String get _label {
    final choice = codingHarnessFromWireId(widget.harness);
    if (choice != null) return codingHarnessDisplayName(choice);
    final t = widget.title?.trim() ?? '';
    return t.isNotEmpty ? t : widget.harness;
  }

  bool get _needsInstall {
    final reach = _reach;
    if (reach == null) return false;
    if (reach['installState']?.toString() == 'not-installed') return true;
    final guide = reach['installGuide'];
    if (guide is Map && guide['installed'] == false) return true;
    return false;
  }

  _LocalMsg? get _streamingAssistant {
    if (!_canStream || !_busy) return null;
    Map<String, dynamic>? item;
    for (final i in _timeline.items) {
      if (i['type']?.toString() == 'message' &&
          i['role']?.toString() == 'assistant' &&
          i['id']?.toString() == 'turn:${widget.sessionId}:assistant') {
        item = i;
        break;
      }
    }
    if (item == null) return null;
    final text = item['text']?.toString() ?? '';
    final streaming = item['streaming'] == true;
    if (text.trim().isEmpty && !streaming) return null;
    return _LocalMsg(
      id: item['id']?.toString() ?? 'stream',
      role: 'assistant',
      text: text,
      streaming: streaming,
    );
  }

  List<_LocalMsg> get _displayMessages {
    final stream = _streamingAssistant;
    if (stream == null) return List.unmodifiable(_messages);
    return [..._messages, stream];
  }

  @override
  void initState() {
    super.initState();
    _timeline = EhTimelineState(chatId: _chatId);
    _controller.addListener(() {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wireEvents();
      unawaited(_bootstrap());
      unawaited(touchCodingExtSession(widget.sessionId));
    });
  }

  @override
  void dispose() {
    for (final u in _unsubs) {
      u();
    }
    _controller.dispose();
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
          _scrollToEnd();
        }
      }),
    );
  }

  Future<void> _bootstrap() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.setExtAgentProjectPath(
        agentId: _agentId,
        projectPath: widget.cwd,
      );
    } catch (_) {
      // non-fatal — ask still works without cwd for some agents
    }
    await _refreshProbe();
  }

  Future<Map<String, dynamic>?> _refreshProbe() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return null;
    try {
      final r = await client.probeExtAgent(agentId: _agentId);
      if (!mounted) return r;
      setState(() {
        _reach = r;
        _localError = null;
      });
      return r;
    } catch (e) {
      if (!mounted) return null;
      setState(() {
        _localError = e.toString().replaceFirst('Exception: ', '');
      });
      return null;
    }
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

  String _installHintText(AppLocalizations l10n) {
    final guide = _reach?['installGuide'];
    if (guide is Map) {
      final cmd = guide['installCommand']?.toString().trim() ?? '';
      final hint = guide['startHint']?.toString().trim() ?? '';
      if (cmd.isNotEmpty) return cmd;
      if (hint.isNotEmpty) return hint;
    }
    final info = getExtAgentInstallInfo(_agentId);
    if (info.startHint.isNotEmpty) return info.startHint;
    return l10n.codingExtInstallHint(_label);
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    final l10n = AppLocalizations.of(context);

    final latest = await _refreshProbe();
    if (latest != null) {
      final notInstalled =
          latest['installState']?.toString() == 'not-installed' ||
              (latest['installGuide'] is Map &&
                  (latest['installGuide'] as Map)['installed'] == false);
      if (notInstalled) {
        if (!mounted) return;
        setState(() {
          _localError = l10n.codingExtInstallHint(_label);
        });
        return;
      }
    }

    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _localError = l10n.codingExtSendFailed('Not connected'));
      return;
    }

    setState(() {
      _busy = true;
      _localError = null;
      _messages.add(
        _LocalMsg(id: 'u-${DateTime.now().millisecondsSinceEpoch}', role: 'user', text: text),
      );
    });
    _controller.clear();
    _scrollToEnd();

    try {
      final reply = await client.askExtAgent(
        prompt: text,
        agentId: _agentId,
        streamSessionId: _canStream ? widget.sessionId : null,
      );
      if (!mounted) return;
      final body = reply.trim().isEmpty ? l10n.codingExtEmptyReply : reply.trim();
      setState(() {
        _messages.add(
          _LocalMsg(
            id: 'a-${DateTime.now().millisecondsSinceEpoch}',
            role: 'assistant',
            text: body,
          ),
        );
      });
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      setState(() {
        _localError = msg;
        _messages.add(
          _LocalMsg(
            id: 's-${DateTime.now().millisecondsSinceEpoch}',
            role: 'system',
            text: msg,
          ),
        );
      });
      if (RegExp(r'install|not found|ENOENT|missing', caseSensitive: false)
          .hasMatch(msg)) {
        unawaited(_refreshProbe());
      }
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final display = _displayMessages;
    final title = widget.title?.trim().isNotEmpty == true
        ? widget.title!.trim()
        : _label;

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value != 'add-heartbeat') return;
              unawaited(() async {
                final messenger = ScaffoldMessenger.of(context);
                final ok = await showCodingHeartbeatDialog(
                  context,
                  workspaceTitle: title,
                  target: CodingHeartbeatTargetExt(
                    sessionId: widget.sessionId,
                    agentId: _agentId,
                  ),
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
                    _label,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
                if (_reach != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    _needsInstall
                        ? l10n.codingExtNeedsInstall
                        : (_reach!['reachable'] == true
                            ? l10n.codingExtReady
                            : l10n.codingExtCheckInstall),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: _needsInstall
                              ? scheme.error
                              : scheme.onSurfaceVariant,
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
          if (widget.cwd.isNotEmpty)
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
                    widget.cwd,
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
          if (_needsInstall)
            Material(
              color: scheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      l10n.codingExtInstallHint(_label),
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            color: scheme.onErrorContainer,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _installHintText(l10n),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onErrorContainer,
                            fontFamily: 'monospace',
                          ),
                    ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: () => unawaited(_refreshProbe()),
                        child: Text(l10n.commonRefresh),
                      ),
                    ),
                  ],
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
                    child: Text(
                      l10n.codingExtEmpty(_label),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                for (final m in display)
                  _ExtMessageBubble(
                    role: m.role,
                    text: m.text,
                    streaming: m.streaming,
                  ),
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
                if (_busy && (_streamingAssistant?.text.trim().isEmpty ?? true))
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
                          l10n.codingExtThinking,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
              ],
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
                            ? l10n.codingExtThinking
                            : l10n.codingExtPlaceholder(_label),
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _busy || _controller.text.trim().isEmpty
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

class _ExtMessageBubble extends StatelessWidget {
  const _ExtMessageBubble({
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
    final isSystem = role == 'system';
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
            color: isSystem
                ? scheme.errorContainer
                : isUser
                    ? scheme.primaryContainer
                    : scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: SelectableText(
            streaming ? '$text▍' : text,
            style: TextStyle(
              color: isSystem ? scheme.onErrorContainer : null,
            ),
          ),
        ),
      ),
    );
  }
}
