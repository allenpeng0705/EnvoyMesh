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
    this.supportedCommands = const <String>{},
    this.onCommand,
  });

  final TerminalAccessoryMode mode;
  final void Function(String bytes) onKey;
  final VoidCallback? onPaste;
  final bool enabled;
  final Set<String> supportedCommands;
  final ValueChanged<String>? onCommand;

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
    widget.onCommand?.call(cmd.split(RegExp(r'\s+')).first);
    _send(cmd.endsWith('\n') ? cmd : '$cmd\n');
  }

  Future<void> _showCodingActions() async {
    final l10n = AppLocalizations.of(context);
    final actions = <(String, String, IconData)>[
      if (widget.supportedCommands.contains('/compact'))
        ('/compact', l10n.termCompactContext, Icons.compress),
      if (widget.supportedCommands.contains('/plan'))
        ('/plan', l10n.termUpdatePlan, Icons.account_tree_outlined),
      if (widget.supportedCommands.contains('/status'))
        ('/status', l10n.termHarnessStatus, Icons.monitor_heart_outlined),
    ];
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(
                widget.mode == TerminalAccessoryMode.pi
                    ? l10n.termPiActions
                    : l10n.termHarnessActions,
              ),
            ),
            for (final action in actions)
              ListTile(
                leading: Icon(action.$3),
                title: Text(action.$2),
                trailing: Text(
                  action.$1,
                  style: const TextStyle(fontFamily: 'monospace'),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _sendSlashCommand(action.$1);
                },
              ),
          ],
        ),
      ),
    );
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
                  if (widget.supportedCommands.contains('/help'))
                    _chip(l10n.termQuickHelp, () => _sendSlashCommand('/help')),
                  if (widget.supportedCommands.contains('/cancel'))
                    _chip(
                      l10n.termQuickCancel,
                      () => _sendSlashCommand('/cancel'),
                    ),
                  if (widget.supportedCommands.contains('/review'))
                    _chip('/review', () => _sendSlashCommand('/review')),
                  if (widget.supportedCommands.contains('/diff'))
                    _chip('/diff', () => _sendSlashCommand('/diff')),
                  if (widget.supportedCommands.any(
                    const {'/compact', '/plan', '/status'}.contains,
                  ))
                    _chip(
                      l10n.termMore,
                      _showCodingActions,
                      icon: Icons.more_horiz,
                    ),
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
                _key(label: 'Esc', onTap: () => _send('\x1B')),
                _key(label: 'Tab', onTap: () => _send('\t')),
                _key(label: 'Ctrl', highlight: _ctrlActive, onTap: _toggleCtrl),
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
                _key(
                  icon: Icons.keyboard_arrow_up,
                  semanticLabel: l10n.termPreviousCommand,
                  onTap: () => _send('\x1B[A'),
                ),
                _key(
                  icon: Icons.keyboard_arrow_down,
                  semanticLabel: l10n.termNextCommand,
                  onTap: () => _send('\x1B[B'),
                ),
                _key(
                  icon: Icons.keyboard_arrow_left,
                  semanticLabel: l10n.termCursorLeft,
                  onTap: () => _send('\x1B[D'),
                ),
                _key(
                  icon: Icons.keyboard_arrow_right,
                  semanticLabel: l10n.termCursorRight,
                  onTap: () => _send('\x1B[C'),
                ),
                _key(
                  icon: Icons.keyboard_return,
                  semanticLabel: l10n.termEnterKey,
                  onTap: () => _send('\r'),
                ),
                if (widget.onPaste != null)
                  _key(
                    icon: Icons.paste,
                    semanticLabel: l10n.termPaste,
                    onTap: widget.onPaste,
                  ),
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

  Widget _chip(String label, VoidCallback onTap, {IconData? icon}) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: ActionChip(
          avatar: icon == null
              ? null
              : Icon(icon, size: 18, color: Colors.white70),
          label: Text(label, style: const TextStyle(fontSize: 12)),
          onPressed: widget.enabled ? onTap : null,
          backgroundColor: Colors.grey[800],
          labelStyle: const TextStyle(color: Colors.white70),
          side: BorderSide(color: Colors.grey[700]!),
        ),
      ),
    );
  }

  Widget _key({
    String? label,
    IconData? icon,
    bool highlight = false,
    String? semanticLabel,
    VoidCallback? onTap,
  }) {
    final highContrast = MediaQuery.highContrastOf(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Semantics(
        button: true,
        enabled: widget.enabled,
        selected: highlight,
        label: semanticLabel ?? label,
        child: Material(
          color: highlight
              ? (highContrast ? Colors.orange.shade600 : Colors.orange.shade800)
              : (highContrast ? Colors.black : Colors.grey[800]),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(6),
            side: highContrast
                ? const BorderSide(color: Colors.white, width: 2)
                : BorderSide.none,
          ),
          child: InkWell(
            onTap: widget.enabled ? onTap : null,
            borderRadius: BorderRadius.circular(6),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 10,
                ),
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
        ),
      ),
    );
  }

  static const _gap = SizedBox(width: 8);
}
