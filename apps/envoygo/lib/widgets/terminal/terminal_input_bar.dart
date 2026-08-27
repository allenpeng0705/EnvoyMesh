import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Soft keyboard bar shown above the device keyboard on the
/// terminal screen. Provides the keys the device keyboard does
/// not have (arrow keys, Tab, Esc, Ctrl modifier) plus copy /
/// paste actions.
///
/// The bar is a `StatelessWidget` — the active state (Ctrl
/// modifier) lives in [_TerminalInputBarState] for the duration
/// the bar is mounted.
class TerminalInputBar extends StatefulWidget {
  /// Called when a key (or composed key like Ctrl-X) should be
  /// sent to the PTY. The bytes are raw PTY input.
  final void Function(String bytes) onKey;

  /// Whether there's an active selection. When true, the Copy
  /// button is enabled.
  final bool hasSelection;

  /// Called when the user taps the Copy button.
  final VoidCallback? onCopy;

  /// Called when the user taps the Paste button. The bar does
  /// NOT read the clipboard itself — the screen wires this up
  /// because the clipboard service is owned by the screen.
  final VoidCallback? onPaste;

  /// Called when the user taps the keyboard-hide button. The
  /// screen wires this up to call `FocusScope.of(context).unfocus()`.
  final VoidCallback? onHideKeyboard;

  /// Called when the user taps the keyboard-show button. The
  /// screen wires this up to call
  /// `_focusNode.requestFocus()`. The terminal used to summon
  /// the keyboard by tapping the terminal area, but the hidden
  /// TextField that captured those taps also blocked the
  /// TerminalView's pan gesture, making the terminal
  /// unscrollable. The keyboard-show button is now the only
  /// way to summon the device keyboard.
  final VoidCallback? onShowKeyboard;

  /// Note: as of the simpler-UI pass, the soft bar no longer
  /// renders Scroll up / Scroll down / Bottom buttons. The
  /// AppBar still has a "Jump to bottom" button (which uses
  /// this callback) for users who scrolled into the scrollback
  /// and want to return to the live view. The AppBar
  /// visibility is conditional on `_yDisplacement > 0`; we
  /// pass `canJumpToBottom` so the screen can drive the
  /// highlight state.
  final VoidCallback? onJumpToBottom;

  /// Whether the jump-to-bottom button should be shown / enabled.
  /// Set by the screen based on `_yDisplacement > 0`.
  final bool canJumpToBottom;

  // Removed (kept for API stability): onScrollToTop, onPageUp,
  // onPageDown, onScrollUp, onScrollDown. The simpler UI
  // (per the user) keeps only the AppBar "Jump to bottom"
  // affordance plus the pan-to-scroll gesture.

  /// Whether the bar should be visually disabled (e.g. when the
  /// PTY is reconnecting). Taps are still received but the
  /// pressed state is muted.
  final bool enabled;

  const TerminalInputBar({
    super.key,
    required this.onKey,
    this.hasSelection = false,
    this.onCopy,
    this.onPaste,
    this.onHideKeyboard,
    this.onShowKeyboard,
    this.onJumpToBottom,
    this.canJumpToBottom = false,
    this.enabled = true,
  });

  @override
  State<TerminalInputBar> createState() => _TerminalInputBarState();
}

class _TerminalInputBarState extends State<TerminalInputBar> {
  /// Sticky Ctrl modifier. When true, the next A–Z key press
  /// sends the matching control byte (A→0x01, B→0x02, etc.) and
  /// the flag resets to false.
  bool _ctrlActive = false;

  void _sendKey(String bytes) {
    if (!widget.enabled) return;
    widget.onKey(bytes);
  }

  void _toggleCtrl() {
    if (!widget.enabled) return;
    HapticFeedback.selectionClick();
    setState(() => _ctrlActive = !_ctrlActive);
  }

  void _sendControl(String letter) {
    final code = letter.toUpperCase().codeUnitAt(0);
    _sendKey(String.fromCharCode(code - 0x40));
    if (_ctrlActive) setState(() => _ctrlActive = false);
    HapticFeedback.selectionClick();
  }

  Future<void> _showMoreKeys() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Terminal shortcuts',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final shortcut in const [
                    ('Ctrl-C', 'Interrupt', 'C'),
                    ('Ctrl-D', 'End input', 'D'),
                    ('Ctrl-L', 'Clear screen', 'L'),
                    ('Ctrl-R', 'Search history', 'R'),
                    ('Ctrl-Z', 'Suspend', 'Z'),
                    ('Ctrl-A', 'Line start', 'A'),
                    ('Ctrl-E', 'Line end', 'E'),
                    ('Ctrl-U', 'Delete to start', 'U'),
                    ('Ctrl-K', 'Delete to end', 'K'),
                    ('Ctrl-W', 'Delete word', 'W'),
                  ])
                    ActionChip(
                      avatar: Text(shortcut.$1.replaceFirst('Ctrl-', '^')),
                      label: Text(shortcut.$2),
                      onPressed: () {
                        Navigator.pop(context);
                        _sendControl(shortcut.$3);
                      },
                    ),
                ],
              ),
              const Divider(height: 24),
              Wrap(
                spacing: 8,
                children: [
                  for (final key in const [
                    ('/', '/'),
                    ('|', '|'),
                    ('~', '~'),
                    ('-', '-'),
                  ])
                    ActionChip(
                      label: Text(key.$1),
                      onPressed: () {
                        Navigator.pop(context);
                        _sendKey(key.$2);
                      },
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.grey[900],
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      // Horizontally scrollable: on narrow phones the full set of
      // buttons (hide-keyboard, arrows, tab/esc/enter, ctrl,
      // copy/paste, /, |) overflows the row. Wrapping the row in
      // a SingleChildScrollView lets the user swipe the bar to
      // reach buttons that don't fit. The hide-keyboard button
      // is pinned to the leftmost position so it's always
      // visible without scrolling — it's the most common
      // "I'm done" gesture. BouncingScroll physics matches the
      // rest of the app's iOS-style feel.
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        // Pad the trailing edge so the last button has breathing
        // room and a swipe can fully reveal it.
        padding: const EdgeInsets.only(right: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Show / hide the OS keyboard. Both buttons are on
            // the LEFT so they're always visible without
            // scrolling the bar. We removed the previous
            // "tap the terminal area to summon the keyboard"
            // behaviour because the hidden TextField that
            // captured those taps also blocked the
            // TerminalView's pan gesture — see the Offstage
            // TextField in the screen.
            _barButton(
              icon: Icons.keyboard_outlined,
              tooltip: 'Show keyboard',
              onPressed: widget.onShowKeyboard,
            ),
            _barButton(
              icon: Icons.keyboard_hide_outlined,
              tooltip: 'Hide keyboard',
              onPressed: widget.onHideKeyboard,
            ),
            const SizedBox(width: 12),
            // The primary row is ordered by terminal frequency. Less common
            // navigation/control keys live in the labelled More sheet.
            _barButton(
              icon: Icons.close,
              tooltip: 'Esc',
              semanticLabel: 'Escape key',
              onPressed: () => _sendKey('\x1B'),
            ),
            _barButton(
              icon: Icons.keyboard_tab,
              tooltip: 'Tab',
              semanticLabel: 'Tab key',
              onPressed: () => _sendKey('\t'),
            ),
            _barButton(
              label: 'Ctrl',
              tooltip: 'Ctrl modifier (sticky)',
              semanticLabel: _ctrlActive
                  ? 'Control modifier active'
                  : 'Control modifier',
              highlight: _ctrlActive,
              onPressed: _toggleCtrl,
            ),
            _barButton(
              icon: Icons.keyboard_arrow_up,
              tooltip: 'Up',
              onPressed: () => _sendKey('\x1B[A'),
            ),
            _barButton(
              icon: Icons.keyboard_arrow_down,
              tooltip: 'Down',
              onPressed: () => _sendKey('\x1B[B'),
            ),
            _barButton(
              icon: Icons.keyboard_arrow_left,
              tooltip: 'Left',
              onPressed: () => _sendKey('\x1B[D'),
            ),
            _barButton(
              icon: Icons.keyboard_arrow_right,
              tooltip: 'Right',
              onPressed: () => _sendKey('\x1B[C'),
            ),
            _barButton(
              icon: Icons.keyboard_return,
              tooltip: 'Enter',
              onPressed: () => _sendKey('\r'),
            ),
            _barButton(
              icon: Icons.paste,
              tooltip: 'Paste',
              onPressed: widget.onPaste,
            ),
            _barButton(
              icon: Icons.copy,
              tooltip: 'Copy selection',
              onPressed: widget.hasSelection ? widget.onCopy : null,
            ),
            _barButton(
              label: '/',
              tooltip: 'Slash',
              onPressed: () => _sendKey('/'),
            ),
            _barButton(
              label: '|',
              tooltip: 'Pipe',
              onPressed: () => _sendKey('|'),
            ),
            _barButton(
              icon: Icons.more_horiz,
              tooltip: 'More terminal shortcuts',
              semanticLabel: 'More terminal shortcuts',
              onPressed: _showMoreKeys,
            ),
          ],
        ),
      ),
    );
  }

  Widget _barButton({
    IconData? icon,
    String? label,
    String? tooltip,
    String? semanticLabel,
    bool highlight = false,
    VoidCallback? onPressed,
  }) {
    return Semantics(
      button: true,
      enabled: onPressed != null,
      selected: highlight,
      label: semanticLabel ?? tooltip ?? label,
      child: Tooltip(
        message: tooltip ?? '',
        child: InkResponse(
          onTap: onPressed,
          radius: 24,
          child: Container(
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: highlight
                  ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.4)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Center(
              child: icon != null
                  ? Icon(
                      icon,
                      size: 20,
                      color: onPressed == null
                          ? Colors.grey[700]
                          : (highlight
                                ? Theme.of(context).colorScheme.primary
                                : Colors.white),
                    )
                  : Text(
                      label ?? '',
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 14,
                        color: onPressed == null
                            ? Colors.grey[700]
                            : (highlight
                                  ? Theme.of(context).colorScheme.primary
                                  : Colors.white),
                        fontWeight: highlight
                            ? FontWeight.bold
                            : FontWeight.normal,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
