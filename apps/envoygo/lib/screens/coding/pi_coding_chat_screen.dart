import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_heartbeat.dart';
import '../../eh/eh_timeline.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import 'coding_heartbeat_ui.dart';

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
  final ScrollController _scrollController = ScrollController();
  final List<void Function()> _unsubs = [];

  late EhTimelineState _timeline;
  Map<String, dynamic>? _status;
  Map<String, dynamic>? _pendingProposal;
  Timer? _statusPoll;
  Timer? _proposalTimeout;
  bool _busy = false;
  String? _localError;

  String get _chatId => piTimelineChatId(widget.sessionId);

  List<Map<String, dynamic>> get _messages => _timeline.items
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

  @override
  void initState() {
    super.initState();
    _timeline = EhTimelineState(chatId: _chatId);
    _controller.addListener(() {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wireEvents();
      unawaited(_refreshStatus());
    });
  }

  @override
  void dispose() {
    _statusPoll?.cancel();
    _proposalTimeout?.cancel();
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
      _statusPoll?.cancel();
      if (s['state']?.toString() != 'ready') {
        _statusPoll = Timer.periodic(const Duration(seconds: 5), (_) {
          unawaited(_refreshStatus());
        });
      }
    } catch (_) {
      // Keep last-known.
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

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    final l10n = AppLocalizations.of(context);
    final state = _status?['state']?.toString();
    if (state != null && state != 'ready') {
      setState(() {
        _localError = switch (state) {
          'disabled' => l10n.piDisabledHint,
          'not-installed' => l10n.piNotInstalledHint,
          _ => _status?['error']?.toString().trim().isNotEmpty == true
              ? l10n.piErrorHint(_status!['error'].toString())
              : l10n.piStartingHint,
        };
      });
      return;
    }

    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _localError = l10n.piSendFailed('Not connected'));
      return;
    }

    setState(() {
      _busy = true;
      _localError = null;
    });
    _controller.clear();
    try {
      await client.sendToPi(text, sessionId: widget.sessionId);
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

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value != 'add-heartbeat') return;
              unawaited(() async {
                final messenger = ScaffoldMessenger.of(context);
                final ok = await showCodingHeartbeatDialog(
                  context,
                  workspaceTitle: widget.sessionName,
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
                if (_messages.isEmpty && !_busy)
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
                for (final item in _messages)
                  _PiMessageBubble(
                    role: item['role']?.toString() ?? 'assistant',
                    text: item['text']?.toString() ?? '',
                    streaming: item['streaming'] == true,
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
          child: SelectableText(streaming ? '$text▍' : text),
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
