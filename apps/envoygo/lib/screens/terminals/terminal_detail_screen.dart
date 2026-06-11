import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';
import '../../services/terminal_service.dart';
import '../../widgets/terminal/terminal_input_bar.dart';
import '../../widgets/terminal/terminal_view.dart';

/// Terminal detail screen — hosts a [TerminalView], a
/// [TerminalInputBar] soft keyboard, and a hidden [TextField] for
/// capturing device-keyboard input. The hidden TextField is the
/// focus target for the OS keyboard; the soft bar provides the
/// special keys the OS keyboard does not have.
///
/// Wire flow (per the existing design):
///   - Subscribe to `homeTerminalWs:rx` push events.
///   - On each event, base64-decode the `dataBase64` field and
///     forward the raw bytes to [TerminalView.write].
///   - On user input (TextField changes, soft bar button taps),
///     forward raw bytes to [TerminalService.sendKey].
///   - On screen size change, debounce 200 ms then call
///     [TerminalService.sendResize].
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
  TerminalService? _terminalService;
  final _terminalKey = GlobalKey<State<TerminalView>>();
  bool _attached = false;

  /// True when the home tunnel is reachable. Drives the AppBar
  /// "Reconnecting…" chip.
  bool _tunnelUp = true;

  /// TextEditingController for the hidden TextField. We need to
  /// read the previous text to compute a diff for backspace.
  final _textController = TextEditingController();
  String _previousText = '';
  final _focusNode = FocusNode();

  /// Latest y-displacement reported by the TerminalView. Drives
  /// the AppBar "Jump to bottom" button visibility.
  int _yDisplacement = 0;

  /// Whether the TerminalView has an active selection. Drives
  /// the soft bar's Copy button enable state.
  bool _hasSelection = false;

  /// Resize debounce timer.
  Timer? _resizeTimer;

  /// Pending resize dimensions; the debounce flushes them.
  int? _pendingCols;
  int? _pendingRows;

  /// Approximate monospace cell size in logical pixels. Set on
  /// first measurement; the same dimensions are used by both the
  /// [TerminalView] and the resize computation.
  static const _cellWidth = 8.4; // fontSize 14 * 0.6
  static const _cellHeight = 16.8; // fontSize 14 * 1.2

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void dispose() {
    _detach();
    _resizeTimer?.cancel();
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final client = ref.read(nodeProvider.notifier).client;
    if (client == null) return;

    // Clean up any prior state before re-attaching.
    _detach();

    final nodeService = NodeServiceClient(client);
    _terminalService = TerminalService(nodeService, client);

    // Subscribe to terminal output from push events.
    _unsubscribeRx = client.on('homeTerminalWs:rx', _onTerminalOutput);

    // Tunnel state events.
    _unsubscribeTunnelDown = client.on('tunnel-down', (_) {
      if (!mounted) return;
      setState(() => _tunnelUp = false);
    });
    _unsubscribeTunnelUp = client.on('tunnel-up', (_) {
      if (!mounted) return;
      setState(() => _tunnelUp = true);
    });

    try {
      await _terminalService!.attach(widget.sessionId);
    } catch (e) {
      // Stream attach failed — we still allow basic interaction
      // via the terminalExec RPC fallback (handled by the
      // service internally for `sendKey` if WS is down).
      if (mounted) {
        setState(() {});
      }
    }
    if (mounted) {
      setState(() => _attached = true);
    }
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
    _yDisplacement = 0;
    _hasSelection = false;
  }

  void _onTerminalOutput(dynamic data) {
    if (_terminalService == null) return;
    if (data is! Map<String, dynamic>) return;
    final eventSessionId = data['sessionId'] as String?;
    if (eventSessionId != null && eventSessionId != widget.sessionId) {
      return;
    }
    final b64 = data['dataBase64'] as String?;
    if (b64 == null || b64.isEmpty) return;
    final chunk = base64Decode(b64);
    // Push the raw bytes into the emulator. The emulator handles
    // UTF-8 reassembly, ANSI parsing, and grid mutations.
    final state = _terminalKey.currentState;
    if (state == null) return;
    // We cast to our private state type via a public method
    // exposed by TerminalView. Since the TerminalView doesn't
    // currently expose write() publicly, we add it: see the
    // helper below.
    _writeToView(state, chunk);
  }

  /// Forward raw bytes to the TerminalView. The [TerminalView]
  /// exposes `write(Uint8List)` for this purpose.
  void _writeToView(State state, List<int> bytes) {
    // The TerminalView's `write` method is public on the State
    // class — accessed via the public `State` reference.
    (state as dynamic).write(Uint8List.fromList(bytes));
  }

  // -- Input --

  /// Called by the hidden TextField on every change. We diff
  /// against the previous text and forward the inserted /
  /// deleted characters as raw bytes.
  void _onTextChanged(String text) {
    final prev = _previousText;
    if (text.length > prev.length) {
      // Insertion(s).
      final inserted = text.substring(prev.length);
      _terminalService?.sendKey(inserted);
    } else if (text.length < prev.length) {
      // Deletion(s). Emit one backspace per deleted character.
      final count = prev.length - text.length;
      for (var i = 0; i < count; i++) {
        _terminalService?.sendControlByte(0x08);
      }
    }
    _previousText = text;
  }

  void _onTextSubmitted(String text) {
    // The user pressed the device keyboard's Enter. The TUI
    // wants a literal \r on its stdin. The TextField would also
    // fire _onTextChanged before this with the new text, but
    // because we sent each character incrementally, we don't
    // need to re-send anything here — just the \r terminator.
    _terminalService?.sendKey('\r');
    // Clear the TextField so the next input starts empty.
    _textController.clear();
    _previousText = '';
  }

  /// Forward raw bytes from the soft keyboard bar.
  void _onBarKey(String bytes) {
    _terminalService?.sendKey(bytes);
  }

  Future<void> _onCopy() async {
    final state = _terminalKey.currentState;
    if (state == null) return;
    final selected = (state as dynamic).getSelection() as String?;
    if (selected != null && selected.isNotEmpty) {
      await Clipboard.setData(ClipboardData(text: selected));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Copied to clipboard')),
        );
      }
    }
  }

  Future<void> _onPaste() async {
    final data = await Clipboard.getData('text/plain');
    final text = data?.text ?? '';
    if (text.isEmpty) return;
    // v1: send raw bytes. Future: honor bracketed paste if the
    // TUI enabled it (we don't track that flag yet).
    _terminalService?.sendKey(text);
  }

  // -- Resize --

  void _scheduleResize(int cols, int rows) {
    if (cols == _pendingCols && rows == _pendingRows) return;
    _pendingCols = cols;
    _pendingRows = rows;
    _resizeTimer?.cancel();
    _resizeTimer = Timer(const Duration(milliseconds: 200), () {
      _resizeTimer = null;
      final c = _pendingCols;
      final r = _pendingRows;
      if (c == null || r == null) return;
      // Forward to the home PTY.
      _terminalService?.sendResize(c, r);
      // Resize the local view.
      final state = _terminalKey.currentState;
      if (state != null) {
        (state as dynamic).resize(c, r);
      }
    });
  }

  void _onLayoutChange(Size size) {
    if (size.width <= 0 || size.height <= 0) return;
    // Reserve a few pixels at the bottom for the soft bar — but
    // the soft bar is part of the same column, so we use the
    // full available height. The widget will be told to use
    // whatever space it has.
    final cols = (size.width / _cellWidth).floor();
    final rows = (size.height / _cellHeight).floor();
    if (cols < 2 || rows < 2) return;
    _scheduleResize(cols, rows);
  }

  // -- Selection / scrollback callbacks from TerminalView --

  void _onSelectionChanged(bool hasSelection) {
    if (!mounted) return;
    setState(() => _hasSelection = hasSelection);
  }

  void _onScrollbackOffsetChanged(int yDisplacement) {
    if (!mounted) return;
    setState(() => _yDisplacement = yDisplacement);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.sessionName),
        actions: [
          if (_yDisplacement > 0)
            TextButton.icon(
              onPressed: () {
                final state = _terminalKey.currentState;
                if (state != null) {
                  (state as dynamic).jumpToBottom();
                }
              },
              icon: const Icon(Icons.arrow_downward, size: 16),
              label: const Text('Jump to bottom'),
            ),
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
              child: LayoutBuilder(
                builder: (context, constraints) {
                  // Schedule a resize on the next frame, after
                  // the layout settles. We don't call it inline
                  // because LayoutBuilder is called during the
                  // build phase.
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _onLayoutChange(constraints.biggest);
                  });
                  return Container(
                    color: Colors.black,
                    child: Stack(
                      children: [
                        // The terminal emulator.
                        Center(
                          child: TerminalView(
                            key: _terminalKey,
                            onSelectionChanged: _onSelectionChanged,
                            onScrollbackOffsetChanged:
                                _onScrollbackOffsetChanged,
                          ),
                        ),
                        // Hidden TextField as the device-keyboard
                        // focus target. Visually invisible, but
                        // tap-to-focus still works because it
                        // fills the parent (the Stack passes
                        // pointer events through to the child
                        // TerminalView's GestureDetector; the
                        // TextField is here primarily so the
                        // OS keyboard is summoned on tap).
                        Positioned.fill(
                          child: Opacity(
                            opacity: 0.0,
                            child: TextField(
                              controller: _textController,
                              focusNode: _focusNode,
                              autofocus: true,
                              autocorrect: false,
                              enableSuggestions: false,
                              enableIMEPersonalizedLearning: false,
                              keyboardType: TextInputType.visiblePassword,
                              maxLines: 1,
                              onChanged: _onTextChanged,
                              onSubmitted: _onTextSubmitted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            // Soft keyboard bar above the device keyboard.
            TerminalInputBar(
              onKey: _onBarKey,
              hasSelection: _hasSelection,
              onCopy: _onCopy,
              onPaste: _onPaste,
              enabled: _tunnelUp && _attached,
            ),
          ],
        ),
      ),
    );
  }
}
