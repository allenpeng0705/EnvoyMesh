import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import '../../services/terminal_service.dart';

/// Terminal detail screen — hosts an xterm.js WebView for full terminal
/// emulation.  PTY output from the home node is forwarded to xterm.js
/// via `evaluateJavascript`; keystrokes from xterm.js are forwarded
/// back to the home node via `TerminalService.sendRaw`.
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
    extends ConsumerState<TerminalDetailScreen> with WidgetsBindingObserver {
  InAppWebViewController? _webController;
  TerminalService? _terminalService;
  bool _attached = false;
  bool _tunnelUp = true;

  void Function()? _unsubRx;
  void Function()? _unsubClosed;

  late final PullToRefreshController _pullToRefreshController;

  @override
  void initState() {
    super.initState();
    _pullToRefreshController = PullToRefreshController(
      onRefresh: () => _attach(),
    );
    _attach();
    // Re-fit xterm.js when the keyboard shows/hides.
    WidgetsBinding.instance.addObserver(this);
  }

  Timer? _resizeTimer;

  @override
  void didChangeMetrics() {
    // Debounce: cancel the previous timer before scheduling a new one.
    _resizeTimer?.cancel();
    _resizeTimer = Timer(const Duration(milliseconds: 150), () {
      _webController?.evaluateJavascript(source: 'fitAddon.fit();');
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _detach();
    super.dispose();
  }

  // -- Attach / detach --

  Future<void> _attach() async {
    final client = ref.read(nodeProvider.notifier).client;
    if (client == null) return;
    final nodeService = NodeServiceClient(client);
    _terminalService = TerminalService(nodeService, client);

    // Subscribe to PTY output from home node push events.
    _unsubRx = client.on('homeTerminalWs:rx', _onTerminalOutput);
    _unsubClosed = client.on('homeTerminalWs:closed', (_) {
      if (mounted) setState(() => _tunnelUp = false);
    });

    try {
      await _terminalService!.attach(widget.sessionId);
      setState(() => _attached = true);
    } catch (e) {
      _terminalService!.setActiveSession(widget.sessionId);
      setState(() => _attached = true);
    }

    // Focus the xterm.js WebView after attach.
    Future.delayed(const Duration(milliseconds: 500), () {
      _webController?.evaluateJavascript(
        source: 'term.focus(); fitAddon.fit();',
      );
    });
  }

  void _detach() {
    _unsubRx?.call();
    _unsubRx = null;
    _terminalService?.detach();
    _terminalService = null;
    _attached = false;
    _tunnelUp = true;
  }

  // -- PTY output → xterm.js --

  void _onTerminalOutput(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final eventSessionId = data['sessionId'] as String?;
    if (eventSessionId != null && eventSessionId != widget.sessionId) return;
    final b64 = data['dataBase64'] as String?;
    if (b64 == null || b64.isEmpty) return;
    _writeToXterm(b64);
  }

  void _writeToXterm(String base64) {
    _webController?.evaluateJavascript(
      source: 'writeToTerminal("$base64")',
    );
  }

  // -- xterm.js keystrokes → Flutter → home node --

  void _onKeyFromWeb(String data) {
    _terminalService?.sendRaw(utf8.encode(data));
  }

  void _onResizeFromWeb(int cols, int rows) {
    _terminalService?.sendResize(cols, rows);
  }

  // -- Copy All --

  Future<void> _copyAll() async {
    if (_webController == null) return;
    final result = await _webController!.evaluateJavascript(
      source: 'getTerminalText()',
    );
    final text = result?.toString() ?? '';
    if (text.isNotEmpty) {
      await Clipboard.setData(ClipboardData(text: text));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Copied to clipboard')),
        );
      }
    }
  }

  // -- Paste --

  Future<void> _onPaste() async {
    final data = await Clipboard.getData('text/plain');
    final text = data?.text ?? '';
    if (text.isEmpty) return;
    _terminalService?.sendKey(text);
  }

  // -- Build --

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
          if (!_tunnelUp)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Chip(
                label: Text('Reconnecting…', style: TextStyle(fontSize: 12)),
                backgroundColor: Colors.orange,
              ),
            ),
          if (!_attached)
            TextButton(
              onPressed: _attach,
              child: const Text('Reconnect'),
            ),
          IconButton(
            tooltip: 'Copy all output',
            icon: const Icon(Icons.copy_all),
            onPressed: _copyAll,
          ),
          IconButton(
            tooltip: 'Paste',
            icon: const Icon(Icons.paste),
            onPressed: _onPaste,
          ),
          IconButton(
            tooltip: 'Close session',
            icon: const Icon(Icons.close),
            onPressed: () {
              _terminalService?.closeSession(widget.sessionId);
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Container(
                color: Colors.black,
                child: Column(
                  children: [
                    Expanded(
                      child: InAppWebView(
                  pullToRefreshController: _pullToRefreshController,
                  initialData: InAppWebViewInitialData(
                    data: _terminalHtml,
                    mimeType: 'text/html',
                    encoding: 'utf-8',
                  ),
                  initialSettings: InAppWebViewSettings(
                    javaScriptEnabled: true,
                    transparentBackground: true,
                    disableHorizontalScroll: true,
                    disableVerticalScroll: false, // let xterm.js handle its own viewport
                    supportZoom: false,
                    useWideViewPort: false,
                  ),
                  onWebViewCreated: (controller) {
                    _webController = controller;
                    // Register JS → Flutter handlers.
                    controller.addJavaScriptHandler(
                      handlerName: 'termKey',
                      callback: (args) {
                        if (args.isNotEmpty) {
                          _onKeyFromWeb(args[0].toString());
                        }
                      },
                    );
                    controller.addJavaScriptHandler(
                      handlerName: 'termResize',
                      callback: (args) {
                        if (args.isNotEmpty) {
                          try {
                            final decoded =
                                jsonDecode(args[0].toString())
                                    as Map<String, dynamic>;
                            _onResizeFromWeb(
                              decoded['cols'] as int,
                              decoded['rows'] as int,
                            );
                          } catch (_) {}
                        }
                      },
                    );
                    // Focus xterm after a short delay.
                    Future.delayed(const Duration(milliseconds: 500), () {
                      controller.evaluateJavascript(
                        source: 'term.focus(); fitAddon.fit();',
                      );
                    });
                  },
                  onConsoleMessage: (_, msg) {
                    // Debug: log JS console messages in Flutter debug mode.
                    debugPrint('[xterm] ${msg.message}');
                    },
                  ),
                ),
                // Special keys bar below the terminal.
                _buildSpecialKeysBar(),
              ],
            ),
          ),
          ),
        ],
        ),
      ),
    );
  }

  // -- Special keys bar --

  Widget _buildSpecialKeysBar() {
    return Container(
      color: Colors.grey[900],
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _keyBtn('Esc', '\x1B'),
            _keyBtn('Tab', '\x09'),
            _keyBtn('↑', '\x1B[A'),
            _keyBtn('↓', '\x1B[B'),
            _keyBtn('←', '\x1B[D'),
            _keyBtn('→', '\x1B[C'),
            const SizedBox(width: 8),
            _keyBtn('Ctrl', '', ctrl: true),
            _keyBtn('C', 'c', ctrl: true),
            _keyBtn('D', 'd', ctrl: true),
            _keyBtn('V', '', ctrl: true, onTap: _onPaste),
            const SizedBox(width: 8),
            const SizedBox(width: 8),
            _keyBtn('⌨', '', onTap: () {
              _webController?.evaluateJavascript(
                source: 'term.focus();',
              );
            }),
            const SizedBox(width: 8),
            _keyBtn('/', '/'),
          ],
        ),
      ),
    );
  }

  Widget _keyBtn(String label, String bytes, {
    bool ctrl = false,
    VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: TextButton(
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          minimumSize: Size.zero,
          backgroundColor: Colors.grey[800],
          foregroundColor: ctrl ? Colors.orange : Colors.white70,
          textStyle: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
        ),
        onPressed: onTap ?? () {
          if (ctrl) {
            // Send Ctrl+key: ASCII 0x01-0x1A for Ctrl+A through Ctrl+Z.
            final code = bytes.isNotEmpty ? bytes.codeUnitAt(0) : 0;
            if (code >= 0x61 && code <= 0x7A) {
              _terminalService?.sendRaw(Uint8List.fromList([code - 0x60]));
            }
          } else {
            _terminalService?.sendRaw(utf8.encode(bytes));
          }
        },
        child: Text(label),
      ),
    );
  }

  /// Inlined HTML that loads xterm.js from CDN.
  /// Using [InAppWebViewInitialData] so we don't need the assets/ file
  /// at runtime (it's still kept as a reference).
  static const _terminalHtml = '''
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.css" />
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  html,body { width:100%;height:100%;overflow:hidden;background:#000; }
  #terminal { width:100%;height:100%; }
  .xterm .xterm-viewport { scrollbar-width:none; }
</style>
</head>
<body>
<div id="terminal"></div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.9/lib/addon-fit.js"></script>
<script>
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Menlo,Monaco,"Courier New",monospace',
    theme: { background:'#000', foreground:'#0f0', cursor:'#0f0' },
    allowProposedApi: true,
    scrollback: 10000,
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  term.onData(function(data) {
    try { window.flutter_inappwebview.callHandler('termKey', data); } catch(e) {}
  });
  term.onResize(function(size) {
    try { window.flutter_inappwebview.callHandler('termResize', JSON.stringify(size)); } catch(e) {}
  });
  window.writeToTerminal = function(b64) {
    try {
      var raw = atob(b64);
      var arr = new Uint8Array(raw.length);
      for (var i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
      term.write(arr);
    } catch(e) {}
  };
  window.getTerminalText = function() {
    try {
      var sel = term.getSelection();
      if (sel) return sel;
      term.selectAll();
      var all = term.getSelection();
      term.clearSelection();
      return all||'';
    } catch(e) { return ''; }
  };
  setTimeout(function(){ term.focus(); fitAddon.fit(); }, 200);
</script>
</body>
</html>
''';
}
