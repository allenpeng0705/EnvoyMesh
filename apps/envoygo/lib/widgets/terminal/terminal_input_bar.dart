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
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
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
