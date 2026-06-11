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

    // Subscribe to terminal output from push events.
    // The home node emits `homeTerminalWs:rx` with base64-encoded output.
    client.on('homeTerminalWs:rx', _onTerminalOutput);

    try {
      await _terminalService!.attach(widget.sessionId);
      setState(() => _attached = true);
    } catch (e) {
      setState(() {
        _output.add('[Failed to attach: $e]');
        _attached = true;
      });
    }
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
    setState(() {
      _output.add(text);
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
    _controller.clear();
    _output.add('\$ $text');
    _terminalService?.sendCommand(text);
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
