import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';

/// New shell Terminal dialog (Terminal tab FAB).
///
/// Pi / Envoy Harness create flows live under Coding
/// ([showCodingNewWorkspaceSheet]).
Future<void> showCreateTerminalDialog(
  BuildContext context,
  WidgetRef ref,
) async {
  final l10n = AppLocalizations.of(context);
  final nameController = TextEditingController(text: 'zsh');
  final cwdController = TextEditingController();
  try {
    final created = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatsNewTerminal),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              decoration: InputDecoration(
                hintText: l10n.chatsShellHint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: cwdController,
              decoration: InputDecoration(
                hintText: l10n.chatsCwdHint,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () {
              if (nameController.text.trim().isEmpty) return;
              Navigator.of(ctx).pop(true);
            },
            child: Text(l10n.commonCreate),
          ),
        ],
      ),
    );
    if (created != true || !context.mounted) return;
    final name = nameController.text.trim();
    final cwd = cwdController.text.trim();
    await ref.read(chatProvider.notifier).createTerminal(
          name: name,
          cwd: cwd.isEmpty ? null : cwd,
        );
  } finally {
    nameController.dispose();
    cwdController.dispose();
  }
}
