import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/app_localizations.dart';

/// Mobile accessory bar for terminal sessions — navigation keys, modifiers,
/// and coding quick-actions above the on-screen keyboard area.
enum TerminalAccessoryMode { shell, pi, envoyHarness }

class TerminalAccessoryBar extends StatefulWidget {
  const TerminalAccessoryBar({
    super.key,
    required this.mode,
    required this.onKey,
    this.onPaste,
    this.enabled = true,
  });

  final TerminalAccessoryMode mode;
  final void Function(String bytes) onKey;
  final VoidCallback? onPaste;
  final bool enabled;

  @override
  State<TerminalAccessoryBar> createState() => _TerminalAccessoryBarState();
}

class _TerminalAccessoryBarState extends State<TerminalAccessoryBar> {
  bool _ctrlActive = false;

  void _send(String bytes) {
    if (!widget.enabled) return;
    widget.onKey(bytes);
  }

  void _sendCtrlLetter(String letter) {
    final code = letter.toUpperCase().codeUnitAt(0);
    if (code >= 0x41 && code <= 0x5A) {
      _send(String.fromCharCode(code - 0x40));
    }
    setState(() => _ctrlActive = false);
  }

  void _toggleCtrl() {
    if (!widget.enabled) return;
    HapticFeedback.selectionClick();
    setState(() => _ctrlActive = !_ctrlActive);
  }

  void _sendSlashCommand(String cmd) {
    _send(cmd.endsWith('\n') ? cmd : '$cmd\n');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isCoding = widget.mode != TerminalAccessoryMode.shell;

    return Material(
      color: Colors.grey[900],
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isCoding)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(6, 6, 6, 2),
              child: Row(
                children: [
                  _chip(l10n.termQuickHelp, () => _sendSlashCommand('/help')),
                  _chip(l10n.termQuickCancel, () => _sendSlashCommand('/cancel')),
                  _chip('/review', () => _sendSlashCommand('/review')),
                  _chip('/compact', () => _sendSlashCommand('/compact')),
                  _chip('/diff', () => _sendSlashCommand('/diff')),
                  _chip('/plan', () => _sendSlashCommand('/plan')),
                  if (widget.mode == TerminalAccessoryMode.envoyHarness)
                    _chip('/status', () => _sendSlashCommand('/status')),
                ],
              ),
            ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _key(icon: Icons.keyboard_arrow_up, onTap: () => _send('\x1B[A')),
                _key(icon: Icons.keyboard_arrow_down, onTap: () => _send('\x1B[B')),
                _key(icon: Icons.keyboard_arrow_left, onTap: () => _send('\x1B[D')),
                _key(icon: Icons.keyboard_arrow_right, onTap: () => _send('\x1B[C')),
                _gap,
                _key(label: 'Tab', onTap: () => _send('\t')),
                _key(label: 'Esc', onTap: () => _send('\x1B')),
                _key(icon: Icons.keyboard_return, onTap: () => _send('\r')),
                _gap,
                _key(
                  label: 'Ctrl',
                  highlight: _ctrlActive,
                  onTap: _toggleCtrl,
                ),
                if (_ctrlActive) ...[
                  _key(label: 'C', onTap: () => _sendCtrlLetter('C')),
                  _key(label: 'D', onTap: () => _sendCtrlLetter('D')),
                  _key(label: 'L', onTap: () => _sendCtrlLetter('L')),
                  _key(label: 'Z', onTap: () => _sendCtrlLetter('Z')),
                ] else ...[
                  _key(label: '^C', onTap: () => _send(String.fromCharCode(3))),
                  _key(label: '^D', onTap: () => _send(String.fromCharCode(4))),
                ],
                _gap,
                if (widget.onPaste != null)
                  _key(icon: Icons.paste, onTap: widget.onPaste),
                _key(label: '/', onTap: () => _send('/')),
                _key(label: '|', onTap: () => _send('|')),
                if (isCoding) _key(label: '!', onTap: () => _send('!')),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ActionChip(
        label: Text(label, style: const TextStyle(fontSize: 12)),
        onPressed: widget.enabled ? onTap : null,
        backgroundColor: Colors.grey[800],
        labelStyle: const TextStyle(color: Colors.white70),
        side: BorderSide(color: Colors.grey[700]!),
      ),
    );
  }

  Widget _key({
    String? label,
    IconData? icon,
    bool highlight = false,
    VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: highlight ? Colors.orange.shade800 : Colors.grey[800],
        borderRadius: BorderRadius.circular(6),
        child: InkWell(
          onTap: widget.enabled ? onTap : null,
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: icon != null
                ? Icon(icon, size: 20, color: Colors.white70)
                : Text(
                    label ?? '',
                    style: TextStyle(
                      fontSize: 13,
                      fontFamily: 'monospace',
                      color: highlight ? Colors.white : Colors.white70,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  static const _gap = SizedBox(width: 8);
}
