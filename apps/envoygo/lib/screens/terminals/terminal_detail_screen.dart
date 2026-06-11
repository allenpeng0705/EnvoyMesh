import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/node_provider.dart';
import '../../services/terminal_service.dart';
import '../../services/node_service_client.dart';

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
    _terminalService = TerminalService(nodeService);

    // Subscribe to terminal output from push events (real-time stream).
    client.on('homeTerminalWs:rx', _onTerminalOutput);

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

  void _detach() {
    final client = ref.read(nodeProvider.notifier).client;
    if (client != null) {
      client.off('homeTerminalWs:rx', _onTerminalOutput);
    }
    _terminalService?.detach();
    _terminalService = null;
    _attached = false;
    _streamingIndex = -1;
    _rawBuffer.clear();
  }

  /// Raw byte buffer for incomplete UTF-8 sequences / ANSI sequences that span chunks.
  final _rawBuffer = <int>[];

  void _onTerminalOutput(dynamic data) {
    if (data is! Map<String, dynamic>) return;
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
      if (output.isNotEmpty) {
        final cleaned = _cleanTerminalOutput(output);
        if (cleaned.isNotEmpty) {
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
        }
      }
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
      r'\x1B[@-Z\\-_]|'   // ESC + single-char sequences
      r'\x1B\[[\d;]*[A-Za-z]|' // CSI: ESC [ params letter
      r'\x1B\][^\x07]*\x07|' // OSC: ESC ] … BEL
      r'\x1B[PX^_][^\x1B]*\x1B\\'); // other sequences

  String _cleanTerminalOutput(String text) {
    // 1. Strip all ANSI / CSI escape sequences (no separators).
    text = text.replaceAll(_ansiRegex, '');

    // 2. Normalise line endings.
    text = text.replaceAll('\r\n', '\n');
    text = text.replaceAll('\r', '\n');

    // 3. Collapse 4+ blank lines to 2.
    while (text.contains('\n\n\n\n')) {
      text = text.replaceAll('\n\n\n\n', '\n\n');
    }

    return text.trim();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
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
                      _terminalService
                          ?.sendKeystrokes(base64Encode([3]));
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
