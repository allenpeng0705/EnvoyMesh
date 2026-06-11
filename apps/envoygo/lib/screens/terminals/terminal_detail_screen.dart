import 'dart:convert';
import 'package:flutter/material.dart';
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

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void dispose() {
    _terminalService?.detach();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final client = ref.read(nodeProvider.notifier).client;
    if (client == null) return;
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

  void _onTerminalOutput(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final b64 = data['dataBase64'] as String?;
    if (b64 == null || b64.isEmpty) return;
    String text;
    try {
      text = utf8.decode(base64Decode(b64));
    } catch (_) {
      text = '[binary data]';
    }
    if (text.isEmpty) return;
    text = _cleanTerminalOutput(text);
    if (text.isEmpty) return;
    // Accumulate streaming output into the buffer so the current
    // command's response stays together as a single entry.
    _streamBuffer.write(text);
    setState(() {
      // Always update the last entry in-place so streaming output
      // reads as one contiguous block.
      final updated = _streamBuffer.toString();
      if (_output.isNotEmpty && !_output.last.startsWith('\$')) {
        _output.last = updated;
      } else {
        _output.add(updated);
      }
      if (_output.length > 500) {
        _output.removeRange(0, _output.length - 500);
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
    // Clear the streaming buffer for the new command.
    _streamBuffer.clear();
    // Start a new output entry with the prompt.
    _output.add('\$ $command');
    _terminalService?.sendCommand(command).then((output) {
      if (output.isNotEmpty) {
        final cleaned = _cleanTerminalOutput(output);
        if (cleaned.isNotEmpty) {
          setState(() => _output.add(cleaned));
        }
      }
    }).catchError((e) {
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
    // 1. Replace clear-screen / cursor-home with a visible separator.
    text = text.replaceAll('\x1B[2J', '\n---\n');
    text = text.replaceAll('\x1B[H', '');
    text = text.replaceAll('\x1B[?1049h', ''); // enter alt screen
    text = text.replaceAll('\x1B[?1049l', ''); // exit alt screen

    // 2. Strip the rest of ANSI escape sequences.
    text = text.replaceAll(_ansiRegex, '');

    // 3. Normalise line endings.
    text = text.replaceAll('\r\n', '\n');
    text = text.replaceAll('\r', '\n');

    // 4. Collapse multiple blank lines.
    while (text.contains('\n\n\n\n')) {
      text = text.replaceAll('\n\n\n\n', '\n\n\n');
    }

    // 5. Remove duplicate consecutive identical lines (TUI redraws).
    final lines = text.split('\n');
    final cleaned = <String>[];
    String? last;
    for (final line in lines) {
      final trimmed = line.trimRight();
      if (trimmed.isEmpty) {
        if (last != null && last.isNotEmpty) cleaned.add('');
        continue;
      }
      if (trimmed != last) {
        cleaned.add(trimmed);
        last = trimmed;
      }
    }

    return cleaned.join('\n').trim();
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
