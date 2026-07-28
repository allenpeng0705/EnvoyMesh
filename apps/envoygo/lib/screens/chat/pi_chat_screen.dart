import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;

class _PiTurn {
  final String id;
  final String kind; // user | assistant | system
  final String text;
  final String? tone; // info | success | error

  const _PiTurn({
    required this.id,
    required this.kind,
    required this.text,
    this.tone,
  });
}

/// Lightweight Pi chat — one-shot `sendToPi` turns (mirrors Social PiChatPanel).
class PiChatScreen extends ConsumerStatefulWidget {
  const PiChatScreen({super.key});

  @override
  ConsumerState<PiChatScreen> createState() => _PiChatScreenState();
}

class _PiChatScreenState extends ConsumerState<PiChatScreen> {
  final _textController = TextEditingController();
  final _turns = <_PiTurn>[];
  bool _busy = false;
  String _stateLabel = '…';
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _stateLabel = 'not connected';
        _ready = false;
      });
      return;
    }
    try {
      final s = await client.getPiStatus();
      if (!mounted) return;
      final state = s['state']?.toString() ?? 'unknown';
      setState(() {
        _stateLabel = state;
        _ready = state == 'ready';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _stateLabel = 'error';
        _ready = false;
      });
    }
  }

  Future<void> _send() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _busy) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;

    final userTurn = _PiTurn(
      id: 'u_${DateTime.now().microsecondsSinceEpoch}',
      kind: 'user',
      text: text,
    );
    setState(() {
      _turns.add(userTurn);
      _busy = true;
      _textController.clear();
    });

    try {
      final reply = await client.sendToPi(text);
      if (!mounted) return;
      setState(() {
        _turns.add(_PiTurn(
          id: 'a_${DateTime.now().microsecondsSinceEpoch}',
          kind: 'assistant',
          text: reply.trim().isEmpty ? '(empty response)' : reply,
        ));
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _turns.add(_PiTurn(
          id: 'e_${DateTime.now().microsecondsSinceEpoch}',
          kind: 'system',
          text: e.toString(),
          tone: 'error',
        ));
      });
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _refreshStatus();
      }
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pi'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                _stateLabel,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: _ready ? Colors.green : scheme.onSurfaceVariant,
                    ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refreshStatus,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _turns.isEmpty
                ? Center(
                    child: Text(
                      _ready
                          ? 'Ask Pi a coding question'
                          : 'Pi is $_stateLabel — enable it in Settings',
                      style: const TextStyle(color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _turns.length,
                    itemBuilder: (context, index) {
                      final turn = _turns[index];
                      final isUser = turn.kind == 'user';
                      final isError = turn.tone == 'error';
                      return Align(
                        alignment: isUser
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.of(context).size.width * 0.85,
                          ),
                          decoration: BoxDecoration(
                            color: isError
                                ? scheme.errorContainer
                                : isUser
                                    ? scheme.primaryContainer
                                    : scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: SelectableText(turn.text),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      enabled: !_busy,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        hintText: 'Message Pi…',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(24)),
                        ),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _busy ? null : _send,
                    icon: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
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
