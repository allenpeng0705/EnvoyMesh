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

  /// Called when the user taps the "Scroll up" button. The
  /// screen wires this up to call `terminalView.scrollUp(n)`.
  /// The bar is in charge of the icon and tap; the screen
  /// decides how many lines to scroll.
  final VoidCallback? onScrollUp;

  /// Called when the user taps the "Scroll down" button. The
  /// screen wires this up to call `terminalView.scrollDown(n)`.
  final VoidCallback? onScrollDown;

  /// Called when the user taps the "Jump to bottom" button. The
  /// screen wires this up to call `terminalView.jumpToBottom()`.
  /// Only shown when `canJumpToBottom` is true (i.e. the user
  /// has scrolled into the scrollback).
  final VoidCallback? onJumpToBottom;

  /// Whether the jump-to-bottom button should be shown / enabled.
  /// Set by the screen based on `_yDisplacement > 0`.
  final bool canJumpToBottom;

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
    this.onScrollUp,
    this.onScrollDown,
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

  void _onLetter(String letter) {
    if (_ctrlActive && letter.length == 1) {
      final code = letter.toUpperCase().codeUnitAt(0);
      if (code >= 0x41 && code <= 0x5A) {
        // A..Z
        _sendKey(String.fromCharCode(code - 0x40)); // 0x01..0x1A
        setState(() => _ctrlActive = false);
        return;
      }
    }
    _sendKey(letter);
  }

  void _toggleCtrl() {
    if (!widget.enabled) return;
    HapticFeedback.selectionClick();
    setState(() => _ctrlActive = !_ctrlActive);
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
            // Hide the OS keyboard. Pinned to the LEFT so it's
            // always visible (rightmost buttons are easy to
            // miss on narrow phones, and an explicit dismissal
            // is the most common "I'm done" gesture). The bar
            // starts at scroll offset 0 by default, so the
            // leftmost position guarantees no scrolling is
            // required to reach this button.
            _barButton(
              icon: Icons.keyboard_hide_outlined,
              tooltip: 'Hide keyboard',
              onPressed: widget.onHideKeyboard,
            ),
            const SizedBox(width: 12),
            // Arrow keys (left, right, up, down).
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
            const SizedBox(width: 12),
            // Scrollback controls. These scroll the terminal's
            // own scrollback buffer (the local view) rather than
            // sending escape sequences to the TUI. They're the
            // most reliable way to reach earlier output for any
            // terminal session — long shell output, `claude
            // --help`, history review — and they don't depend on
            // the pan gesture being recognised on every swipe.
            //
            // `Icons.expand_less` / `expand_more` show the
            // direction; `Icons.vertical_align_bottom` is the
            // "jump to bottom" (live view) button. The bottom
            // button is enabled only when the user has scrolled
            // away from the bottom (`canJumpToBottom`).
            _barButton(
              icon: Icons.expand_less,
              tooltip: 'Scroll up (history)',
              onPressed: widget.onScrollUp,
            ),
            _barButton(
              icon: Icons.expand_more,
              tooltip: 'Scroll down (history)',
              onPressed: widget.onScrollDown,
            ),
            _barButton(
              icon: Icons.vertical_align_bottom,
              tooltip: 'Jump to bottom (live view)',
              highlight: widget.canJumpToBottom,
              onPressed: widget.canJumpToBottom
                  ? widget.onJumpToBottom
                  : null,
            ),
            const SizedBox(width: 12),
            // Tab / Esc.
            _barButton(
              icon: Icons.keyboard_tab,
              tooltip: 'Tab',
              onPressed: () => _sendKey('\t'),
            ),
            _barButton(
              icon: Icons.close,
              tooltip: 'Esc',
              onPressed: () => _sendKey('\x1B'),
            ),
            // Enter.
            _barButton(
              icon: Icons.keyboard_return,
              tooltip: 'Enter',
              onPressed: () => _sendKey('\r'),
            ),
            const SizedBox(width: 12),
            // Ctrl modifier toggle.
            _barButton(
              label: 'Ctrl',
              tooltip: 'Ctrl modifier (sticky)',
              highlight: _ctrlActive,
              onPressed: _toggleCtrl,
            ),
            // Ctrl + A..Z as a quick-action grid (visible only when
            // Ctrl is active). Tapping one sends the byte.
            if (_ctrlActive) _CtrlLetterGrid(onLetter: _onLetter),
            // Copy / Paste.
            _barButton(
              icon: Icons.copy,
              tooltip: 'Copy selection',
              onPressed: widget.hasSelection ? widget.onCopy : null,
            ),
            _barButton(
              icon: Icons.paste,
              tooltip: 'Paste',
              onPressed: widget.onPaste,
            ),
            // / and | (shell conveniences).
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
          ],
        ),
      ),
    );
  }

  Widget _barButton({
    IconData? icon,
    String? label,
    String? tooltip,
    bool highlight = false,
    VoidCallback? onPressed,
  }) {
    return Tooltip(
      message: tooltip ?? '',
      child: InkResponse(
        onTap: onPressed,
        radius: 24,
        child: Container(
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
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
                      fontWeight: highlight ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

/// When the Ctrl modifier is active, show a small letter grid
/// (A..Z) so the user can quickly send a control byte without
/// needing to remember the A=0x01..Z=0x1A mapping.
class _CtrlLetterGrid extends StatelessWidget {
  final void Function(String letter) onLetter;

  const _CtrlLetterGrid({required this.onLetter});

  @override
  Widget build(BuildContext context) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return PopupMenuButton<String>(
      tooltip: 'Ctrl + letter',
      itemBuilder: (context) {
        return letters.split('').map((l) {
          return PopupMenuItem(
            value: l,
            child: Text('Ctrl+$l'),
          );
        }).toList();
      },
      onSelected: (letter) {
        HapticFeedback.selectionClick();
        onLetter(letter);
      },
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Text(
          '⌃+A..Z',
          style: TextStyle(
            color: Colors.white,
            fontFamily: 'monospace',
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
