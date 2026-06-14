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
  final _terminalKey = GlobalKey<TerminalViewState>();
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

  /// Approximate monospace cell size in logical pixels. The
  /// [TerminalView] now derives its own cell size from the font
  /// and reports dimensions via [onDimensionsChanged]; these
  /// constants are kept as a documented reference but no longer
  /// used for the resize calculation.
  // ignore: unused_field
  static const _cellWidth = 8.4; // fontSize 14 * 0.6
  // ignore: unused_field
  static const _cellHeight = 16.8; // fontSize 14 * 1.2

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void dispose() {
    _detach();
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
      // The TerminalView hasn't been laid out yet at this point —
      // _attach runs before the first frame. Reading state.cols/rows
      // here returns the initial 80×24, not the derived size.
      // Defer the initial resize to the first post-frame callback,
      // which fires after layout is complete and TerminalView has
      // already called onDimensionsChanged with the correct size.
      // That callback also fires sendResize immediately (no debounce).
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final state = _terminalKey.currentState;
        if (state == null) return;
        final c = (state as dynamic).cols as int? ?? 80;
        final r = (state as dynamic).rows as int? ?? 24;
        if (c >= 2 && r >= 2) {
          _terminalService?.sendResize(c, r);
        }
      });
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
    // The TextField is configured with `textInputAction:
    // TextInputAction.send` so the OS keyboard does NOT auto-
    // dismiss on submit. If the platform's EditableText still
    // tears down focus, request it back, but only when the
    // field already had focus (otherwise the user has somehow
    // lost focus and is signalling they want it gone). Doing
    // this synchronously — not on a post-frame callback —
    // avoids the race where the OS dismisses the keyboard
    // (200 ms animation) and our callback cancels the
    // animation by re-claiming focus, producing a visible
    // "flash down, then up" loop.
    if (_focusNode.hasFocus) {
      _focusNode.requestFocus();
    }
  }

  /// Dismiss the OS keyboard. Called from the soft bar's
  /// keyboard-hide button. We do NOT re-focus the hidden
  /// TextField afterwards — doing so races with the OS's
  /// dismiss animation (200 ms) and produces a visible flash
  /// where the keyboard pops down and immediately back up.
  ///
  /// When the user wants the keyboard back, tapping the
  /// terminal area calls [_onTapTerminalArea] which requests
  /// focus only if the keyboard is currently hidden.
  ///
  /// Summon the OS keyboard. Called from the soft bar's
  /// "Show keyboard" button — the only path to the keyboard,
  /// because the previous "tap the terminal area to summon"
  /// behaviour had to be removed (the hidden TextField that
  /// captured those taps also blocked the TerminalView's pan
  /// gesture, making the terminal unscrollable).
  void _showKeyboard() {
    // Synchronous focus request — the OS dismisses no keyboard
    // in this path (we are SHOWING, not toggling), so there is
    // no animation to race.
    _focusNode.requestFocus();
  }

  /// If the user is currently scrolled up into the scrollback,
  /// also snap to the bottom (live view). This is the standard
  /// terminal UX — a tap is the most natural way to "return to
  /// the present" after reviewing history.
  void _hideKeyboard() {
    final state = _terminalKey.currentState;
    if (state != null && _yDisplacement > 0) {
      (state as dynamic).jumpToBottom();
      // jumpToBottom() does its own setState. Mirror our local
      // state on the next frame so the AppBar's "Jump to
      // bottom" button hides.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _yDisplacement = 0);
      });
    }
    FocusScope.of(context).unfocus();
  }

  /// Called by the terminal view on a single tap. The
  /// behaviour depends on whether the OS keyboard is currently
  /// Up: dismissed (no longer used; the terminal handles its
  /// own gestures via raw pointer events, and the keyboard
  /// dismiss is on the soft bar's Hide keyboard button). Kept
  /// here as a no-op stub so the wiring compiles if someone
  /// later re-introduces tap-to-toggle-keyboard with a more
  /// reliable gesture (e.g. double-tap).
  void _onTapTerminalArea() {
    // Intentionally empty.
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

  Future<void> _copyAll() async {
    final state = _terminalKey.currentState;
    if (state == null) return;
    final allText = (state as dynamic).getAllText() as String;
    if (allText.isNotEmpty) {
      await Clipboard.setData(ClipboardData(text: allText));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('All terminal output copied')),
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
    // Always send immediately. A 200 ms debounce causes a race: HOME
    // continues sending at its current grid dimensions while LOCAL
    // has already resized. The bytes arrive with wrong cursor positions,
    // causing overlapping and truncated output. Removing the debounce
    // eliminates this desync window.
    _terminalService?.sendResize(cols, rows);
  }

  /// Called by the [TerminalView] when its internal grid
  /// dimensions change as a result of the available layout
  /// space. We forward the change to the home PTY (debounced)
  /// so the remote terminal can re-flow its content. The local
  /// view already resized itself in the same LayoutBuilder
  /// pass — this handler is for the wire side only.
  void _onDimensionsChanged(int cols, int rows) {
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
          // Scrollback navigation. Two buttons — top and bottom
          // — are always visible regardless of the current
          // scroll position. The user can fine-scroll with the
          // pan gesture, and the right-edge indicator thumb
          // shows the current position. These two buttons give
          // the user a direct one-tap path to the extremes of
          // the scrollback.
          //
          // The icons are vertical arrows (up / down) so the
          // meaning is unambiguous: up = "go to the start of
          // history", down = "go to the live view".
          IconButton(
            tooltip: 'Copy all output',
            icon: const Icon(Icons.copy_all),
            onPressed: _copyAll,
          ),
          IconButton(
            tooltip: 'Top of scrollback',
            icon: const Icon(Icons.arrow_upward),
            onPressed: () {
              final state = _terminalKey.currentState;
              if (state == null) return;
              state.scrollUp(state.scrollbackLength);
            },
          ),
          IconButton(
            tooltip: 'Jump to bottom (live view)',
            icon: const Icon(Icons.arrow_downward),
            onPressed: () {
              final state = _terminalKey.currentState;
              if (state == null) return;
              state.jumpToBottom();
            },
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
              child: Container(
                color: Colors.black,
                child: Stack(
                  children: [
                    // The terminal emulator. Anchored to the top
                    // (Alignment.topCenter) so the visible portion
                    // of the painted grid is always the top rows.
                    // The view derives its own grid dimensions
                    // from the available space (via an internal
                    // LayoutBuilder) and reports them to us via
                    // `onDimensionsChanged`, which we forward to
                    // the home PTY.
                    //
                    // The TerminalView MUST be the topmost
                    // interactive widget in the Stack — putting
                    // the hidden TextField on top would steal
                    // every pointer event (the TextField's own
                    // drag-to-select handler would win instead
                    // of the TerminalView's pan). See the
                    // Offstage TextField below.
                    Align(
                      alignment: Alignment.topCenter,
                      child: TerminalView(
                        key: _terminalKey,
                        onSelectionChanged: _onSelectionChanged,
                        onScrollbackOffsetChanged:
                            _onScrollbackOffsetChanged,
                        onDimensionsChanged: _onDimensionsChanged,
                        onTap: _onTapTerminalArea,
                        onOutboundBytes: (bytes) {
                          _terminalService?.sendRaw(bytes);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Hidden TextField as the device-keyboard focus
            // target. It must NOT be in the visible Stack —
            // an invisible-but-interactive TextField captures
            // every pointer event, blocking the TerminalView's
            // pan. We use `Offstage` (zero-size, no painting)
            // to keep the field alive in the tree so its
            // FocusNode still works, while not stealing any
            // touches. The keyboard is summoned via the soft
            // bar's "Show keyboard" button (which calls
            // _focusNode.requestFocus()).
            Offstage(
              child: TextField(
                controller: _textController,
                focusNode: _focusNode,
                autocorrect: false,
                enableSuggestions: false,
                enableIMEPersonalizedLearning: false,
                keyboardType: TextInputType.visiblePassword,
                maxLines: 1,
                textInputAction: TextInputAction.send,
                onChanged: _onTextChanged,
                onSubmitted: _onTextSubmitted,
              ),
            ),
            // Soft keyboard bar above the device keyboard.
            TerminalInputBar(
              onKey: _onBarKey,
              hasSelection: _hasSelection,
              onCopy: _onCopy,
              onPaste: _onPaste,
              onHideKeyboard: _hideKeyboard,
              onShowKeyboard: _showKeyboard,
              // The soft bar no longer has scroll controls —
              // scrollback navigation is now the pan gesture on
              // the terminal area plus the AppBar's "Jump to
              // bottom" button. See the simpler-UI pass.
              enabled: _tunnelUp && _attached,
            ),
          ],
        ),
      ),
    );
  }
}
