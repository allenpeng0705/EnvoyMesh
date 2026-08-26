import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import '../../services/terminal_service.dart';
import '../../widgets/eh/envoy_harness_terminal_chrome.dart';
import '../../widgets/terminal/terminal_accessory_bar.dart';
import '../../widgets/terminal/terminal_agent_bar.dart';

/// Terminal detail screen — hosts an xterm.js WebView for full terminal
/// emulation.  PTY output from the home node is forwarded to xterm.js
/// via `evaluateJavascript`; keystrokes from xterm.js are forwarded
/// back to the home node via `TerminalService.sendRaw`.
class TerminalDetailScreen extends ConsumerStatefulWidget {
  final String sessionId;
  final String sessionName;
  final String? sessionRole;

  const TerminalDetailScreen({
    super.key,
    required this.sessionId,
    required this.sessionName,
    this.sessionRole,
  });

  bool get isEnvoyHarnessSession => sessionRole == 'envoy-harness';

  /// Shell Terminal Agent slash bar (not Pi / Envoy Harness TUI sessions).
  bool get isShellAgentSession =>
      sessionRole != 'envoy-harness' && sessionRole != 'pi';

  @override
  ConsumerState<TerminalDetailScreen> createState() =>
      _TerminalDetailScreenState();
}

class _TerminalDetailScreenState extends ConsumerState<TerminalDetailScreen>
    with WidgetsBindingObserver {
  InAppWebViewController? _webController;
  TerminalService? _terminalService;
  bool _attached = false;
  bool _tunnelUp = true;
  Set<String> _terminalCommands = const {};

  void Function()? _unsubRx;

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
    client.on('homeTerminalWs:closed', (_) {
      if (mounted) setState(() => _tunnelUp = false);
    });

    try {
      if (widget.isEnvoyHarnessSession || widget.sessionRole == 'pi') {
        final catalog = widget.isEnvoyHarnessSession
            ? await nodeService.getEnvoyHarnessCommandCatalog()
            : await nodeService.getExtAgentCommandCatalog();
        final commands = (catalog['commands'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((entry) => entry['slash']?.toString())
            .whereType<String>()
            .toSet();
        if (mounted) setState(() => _terminalCommands = commands);
      }
      await _terminalService!.attach(widget.sessionId);
      if (mounted) setState(() => _attached = true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _attached = false;
          _tunnelUp = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).termAttachFailed('$e')),
          ),
        );
      }
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
    _webController?.evaluateJavascript(source: 'writeToTerminal("$base64")');
  }

  // -- xterm.js keystrokes → Flutter → home node --

  void _onKeyFromWeb(String data) {
    _terminalService?.sendRaw(utf8.encode(data));
  }

  void _onResizeFromWeb(int cols, int rows) {
    _terminalService?.sendResize(cols, rows);
  }

  void _sendToTerminal(String text) {
    _terminalService?.sendKey(text);
    if (!text.endsWith('\n')) {
      _terminalService?.sendKey('\n');
    }
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
          SnackBar(content: Text(AppLocalizations.of(context).termCopied)),
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
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
          if (!_tunnelUp)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Chip(
                label: Text(
                  l10n.termReconnecting,
                  style: const TextStyle(fontSize: 12),
                ),
                backgroundColor: Colors.orange,
              ),
            ),
          if (!_attached)
            TextButton(onPressed: _attach, child: Text(l10n.commonReconnect)),
          IconButton(
            tooltip: l10n.termCopyAll,
            icon: const Icon(Icons.copy_all),
            onPressed: _copyAll,
          ),
          IconButton(
            tooltip: l10n.termPaste,
            icon: const Icon(Icons.paste),
            onPressed: _onPaste,
          ),
          IconButton(
            tooltip: l10n.termCloseSession,
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
            if (widget.isEnvoyHarnessSession)
              EnvoyHarnessTerminalChrome(
                onSendToTerminal: _sendToTerminal,
                showCommandRails: false,
              ),
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
                          disableVerticalScroll:
                              false, // let xterm.js handle its own viewport
                          supportZoom: false,
                          useWideViewPort: false,
                        ),
                        onWebViewCreated: (controller) {
                          _webController = controller;
                          // Register JS → Flutter handlers.
                          controller.addJavaScriptHandler(
                            handlerName: 'termKey',
                            callback: (List<dynamic> args) {
                              if (args.isNotEmpty) {
                                _onKeyFromWeb(args[0].toString());
                              }
                            },
                          );
                          controller.addJavaScriptHandler(
                            handlerName: 'termResize',
                            callback: (List<dynamic> args) {
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
                    TerminalAccessoryBar(
                      mode: _accessoryMode,
                      enabled: _attached && _tunnelUp,
                      onKey: (bytes) => _terminalService?.sendKey(bytes),
                      onPaste: _onPaste,
                      supportedCommands: _terminalCommands,
                      onCommand: (command) {
                        final client = ref.read(nodeProvider.notifier).client;
                        if (client == null) return;
                        unawaited(
                          NodeServiceClient(client)
                              .recordEnvoyHarnessUxEvent({
                                'action': 'command_rail_used',
                                'surface': 'terminal',
                                'command': command,
                                'occurredAt': DateTime.now()
                                    .toUtc()
                                    .toIso8601String(),
                              })
                              .catchError((_) {}),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
            if (widget.isShellAgentSession)
              TerminalAgentBar(
                sessionId: widget.sessionId,
                onEditInTerminal: _sendToTerminal,
              ),
          ],
        ),
      ),
    );
  }

  TerminalAccessoryMode get _accessoryMode {
    if (widget.isEnvoyHarnessSession) {
      return TerminalAccessoryMode.envoyHarness;
    }
    if (widget.sessionRole == 'pi') {
      return TerminalAccessoryMode.pi;
    }
    return TerminalAccessoryMode.shell;
  }

  // -- Legacy special keys (removed — use TerminalAccessoryBar) --
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
