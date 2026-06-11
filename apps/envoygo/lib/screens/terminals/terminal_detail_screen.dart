import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import '../../services/terminal_service.dart';

/// Terminal PTY view — sends commands via JSON-RPC and displays output
/// from `terminal:rx` push events.
class TerminalDetailScreen extends ConsumerStatefulWidget {
  final String sessionId;
  final String sessionName;

  const TerminalDetailScreen({
    super.key,
    required this.sessionId,
    required this.sessionName,
  });

  @override
  ConsumerState<TerminalDetailScreen> createState() =>
      _TerminalDetailScreenState();
}

class _TerminalDetailScreenState
    extends ConsumerState<TerminalDetailScreen> {
  final _controller = TextEditingController();
  final _output = <String>[];
  final _scrollController = ScrollController();
  TerminalService? _terminalService;
  bool _attached = false;

  /// True when the home-tunnel is reachable. The relay emits `tunnel-down`
  /// when the home's `/ws/home` connection is lost and `tunnel-up` when a
  /// new tunnel is re-claimed. We surface a small "reconnecting…" chip in
  /// the AppBar while down so the user knows their input is being buffered
  /// by the relay (I4) and not lost. The terminal session itself stays
  /// alive on the home; the relay re-attaches the mobile ws transparently.
  bool _tunnelUp = true;

  /// Streaming response buffer for long-running commands.
  /// Accumulated output is appended to the last entry in [_output].
  final _streamBuffer = StringBuffer();

  /// Index into [_output] where the current streaming response is accumulating.
  /// -1 means no streaming accumulation is in progress.
  int _streamingIndex = -1;

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void dispose() {
    _detach();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final client = ref.read(nodeProvider.notifier).client;
    if (client == null) return;

    // Clean up any prior state before re-attaching.
    _detach();

    final nodeService = NodeServiceClient(client);
    _terminalService = TerminalService(nodeService, client);

    // Subscribe to terminal output from push events (real-time stream).
    // The home emits one `homeTerminalWs:rx` event per companion, so we
    // filter by `sessionId` to make sure multi-tab/multi-screen works.
    _unsubscribeRx = client.on('homeTerminalWs:rx', _onTerminalOutput);

    // Subscribe to home-tunnel state events (I4). The relay emits
    // `tunnel-down` when the home's `/ws/home` connection is lost and
    // `tunnel-up` when a new tunnel is re-claimed. The relay keeps the
    // mobile's WebSocket open across the re-claim and buffers any
    // frames the user types in the meantime, so input is not lost.
    _unsubscribeTunnelDown = client.on('tunnel-down', (_) {
      if (!mounted) return;
      setState(() => _tunnelUp = false);
    });
    _unsubscribeTunnelUp = client.on('tunnel-up', (_) {
      if (!mounted) return;
      setState(() => _tunnelUp = true);
    });

    // Try the persistent WebSocket stream first; fall back to simple
    // terminalExec RPC if the stream can't be established.
    try {
      await _terminalService!.attach(widget.sessionId);
    } catch (e) {
      // Stream attach failed — use simple RPC mode instead.
      _terminalService!.setActiveSession(widget.sessionId);
      setState(() => _output.add('[Stream not available, using basic mode: $e]'));
    }
    setState(() => _attached = true);
  }

  void Function()? _unsubscribeRx;
  void Function()? _unsubscribeTunnelDown;
  void Function()? _unsubscribeTunnelUp;

  void _detach() {
    _unsubscribeRx?.call();
    _unsubscribeRx = null;
    _unsubscribeTunnelDown?.call();
    _unsubscribeTunnelDown = null;
    _unsubscribeTunnelUp?.call();
    _unsubscribeTunnelUp = null;
    _terminalService?.detach();
    _terminalService = null;
    _attached = false;
    _tunnelUp = true;
    _streamingIndex = -1;
    _rawBuffer.clear();
  }

  /// Raw byte buffer for incomplete UTF-8 sequences / ANSI sequences that span chunks.
  final _rawBuffer = <int>[];

  void _onTerminalOutput(dynamic data) {
    // Drop late events that arrive after detach() to avoid mutating
    // already-disposed state. The listener is removed synchronously
    // in _detach() so under normal flow this guard is just belt-and-
    // suspenders for events already in the message queue.
    if (_terminalService == null) return;
    if (data is! Map<String, dynamic>) return;
    // Filter to this session — one home companion can have multiple
    // open terminal sub-channels. Older home versions (pre-C2) emit
    // the event without a sessionId; in that case we accept it as
    // a best-effort match.
    final eventSessionId = data['sessionId'] as String?;
    if (eventSessionId != null && eventSessionId != widget.sessionId) {
      return;
    }
    final b64 = data['dataBase64'] as String?;
    if (b64 == null || b64.isEmpty) return;
    List<int> chunk;
    try {
      chunk = base64Decode(b64);
    } catch (_) {
      return;
    }

    // Accumulate raw bytes so split UTF-8 / ANSI sequences are reassembled
    // before cleaning.  Only flush when we hit a newline or the
    // buffer grows large enough to contain a complete sequence.
    _rawBuffer.addAll(chunk);
    if (!_rawBuffer.contains(0x0A) && _rawBuffer.length < 256) return;

    // Decode the buffer, clean it, and flush.
    String text;
    try {
      text = utf8.decode(_rawBuffer, allowMalformed: true);
    } catch (_) {
      text = String.fromCharCodes(_rawBuffer);
    }
    _rawBuffer.clear();

    text = _cleanTerminalOutput(text);
    if (text.isEmpty) return;

    // Accumulate streaming output into the buffer so the current
    // command's response stays together as a single entry.
    _streamBuffer.write(text);
    final buffered = _streamBuffer.toString();

    setState(() {
      if (_streamingIndex >= 0 && _streamingIndex < _output.length) {
        // Replace the streaming accumulation slot with the new combined output.
        _output[_streamingIndex] = buffered;
      } else {
        // No active streaming slot — add as a new entry.
        _output.add(buffered);
        _streamingIndex = _output.length - 1;
      }
      if (_output.length > 500) {
        _output.removeRange(0, _output.length - 500);
        // After trimming, streaming index may be stale — reset so the next
        // streaming output re-creates a slot rather than referencing a
        // shifted (or removed) index.
        _streamingIndex = -1;
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 100),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendCommand(String text) {
    if (text.trim().isEmpty) return;
    final command = text.trim();
    _controller.clear();

    // Clear streaming state — any pending streaming output is stale now.
    _streamBuffer.clear();
    _streamingIndex = -1;

    setState(() {
      // Start a new output entry with the prompt.
      _output.add('\$ $command');
      if (_output.length > 500) {
        _output.removeRange(0, _output.length - 500);
      }
    });

    _terminalService?.sendCommand(command).then((output) {
      if (!mounted) return;
      // In streaming (WS) mode `output` is null because the response
      // arrives via `homeTerminalWs:rx` push events. Only the
      // `terminalExec` RPC fallback produces a captured-output value.
      if (output == null || output.isEmpty) return;
      final cleaned = _cleanTerminalOutput(output);
      if (cleaned.isEmpty) return;
      setState(() {
        // If streaming output already wrote to the last entry (the
        // prompt), replace it; otherwise append.
        final lastIsPrompt = _output.isNotEmpty &&
            _output.last.startsWith('\$ $command');
        if (lastIsPrompt) {
          _output.last = '\$ $command\n$cleaned';
        } else {
          _output.add(cleaned);
        }
        if (_output.length > 500) {
          _output.removeRange(0, _output.length - 500);
        }
      });
    }).catchError((e) {
      if (!mounted) return;
      setState(() => _output.add('[Error: $e]'));
    });
  }

  /// Clean terminal output for display:
  /// 1. Strip all ANSI / CSI escape sequences (colors, cursor, etc.)
  /// 2. Handle carriage returns: \r\n → \n, inline \r updates → keep
  ///    last content on the line
  /// 3. Strip remaining control characters (except tab, newline)
  static final _ansiRegex = RegExp(
      r'\x1B[@-Z\\-_]|' // ESC + single-char sequences (other than CSI/osc)
      r'\x1B\[[\d;]*[A-Za-z]|' // CSI: ESC [ params letter
      r'\x1B\][^\x07]*\x07|' // OSC: ESC ] … BEL
      r'\x1B[PX^_][^\x1B]*\x1B\\|' // DCS / SOS / PAC / PM sequences
      r'\x1B\[[\d;]*[A-Za-z]\x1B\\'); // terminated CSI (DCS-like)

  String _cleanTerminalOutput(String text) {
    // 1. Strip all ANSI / CSI escape sequences.
    text = text.replaceAll(_ansiRegex, '');

    // 2. Handle CRLF → LF.
    text = text.replaceAll('\r\n', '\n');

    // 3. For lines containing standalone \r (inline updates / spinners),
    //    keep only the content AFTER the last \r — this discards the
    //    intermediate spinner frames and preserves the final line state.
    final lines = text.split('\n');
    final cleaned = <String>[];
    for (final line in lines) {
      final lastCr = line.lastIndexOf('\r');
      if (lastCr >= 0) {
        cleaned.add(line.substring(lastCr + 1));
      } else {
        cleaned.add(line);
      }
    }
    text = cleaned.join('\n');

    // 4. Collapse 3+ blank lines to 2.
    while (text.contains('\n\n\n')) {
      text = text.replaceAll('\n\n\n', '\n\n');
    }

    return text.trim();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
          if (!_tunnelUp)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8.0),
              child: Center(
                child: Chip(
                  label: Text('Reconnecting…'),
                  backgroundColor: Colors.orange,
                  labelStyle: TextStyle(color: Colors.white, fontSize: 12),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ),
          if (!_attached)
            TextButton(
              onPressed: _attach,
              child: const Text('Reconnect'),
            ),
          IconButton(
            icon: const Icon(Icons.copy_all),
            tooltip: 'Copy all output',
            onPressed: () {
              Clipboard.setData(
                  ClipboardData(text: _output.join('\n')));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text('Copied to clipboard')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () {
              _terminalService?.closeSession(widget.sessionId);
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              color: Colors.black,
              padding: const EdgeInsets.all(12),
              child: GestureDetector(
                onTap: () {
                  FocusScope.of(context).requestFocus(FocusNode());
                },
                child: ListView.builder(
                  controller: _scrollController,
                  itemCount: _output.length,
                  itemBuilder: (_, index) => SelectableText(
                    _output[index],
                    style: const TextStyle(
                      color: Colors.green,
                      fontFamily: 'monospace',
                      fontSize: 14,
                      height: 1.4,
                    ),
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Container(
              color: Colors.grey[900],
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: _attached,
                      style: const TextStyle(
                        color: Colors.white,
                        fontFamily: 'monospace',
                      ),
                      decoration: InputDecoration(
                        hintText: _attached ? '\$ ' : 'Not connected...',
                        hintStyle: const TextStyle(
                          color: Colors.grey,
                          fontFamily: 'monospace',
                        ),
                        border: InputBorder.none,
                      ),
                      onSubmitted: _sendCommand,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.control_camera,
                        color: Colors.grey, size: 20),
                    onPressed: () {
                      // Ctrl-C (ETX) — kills the foreground process.
                      _terminalService?.sendControlByte(0x03);
                    },
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
