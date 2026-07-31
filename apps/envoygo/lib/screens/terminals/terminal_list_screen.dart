import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';

/// Terminal sessions list.
class TerminalListScreen extends StatelessWidget {
  const TerminalListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // TODO(31G): Wire to TerminalProvider
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.terminal, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          Text(
            l10n.termNone,
            style: const TextStyle(fontSize: 18, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}
