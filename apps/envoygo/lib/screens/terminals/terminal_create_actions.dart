import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../widgets/home_folder_browser.dart';
import 'terminal_detail_screen.dart';

/// Shared New Terminal / New Pi dialogs (used by Terminal tab FAB).
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

Future<void> showCreatePiDialog(BuildContext context, WidgetRef ref) async {
  final pathController = TextEditingController();
  var starting = false;

  unawaited(() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final settings = (cfg['piSettings'] as Map?)?.cast<String, dynamic>();
      final paths = settings?['allowedPaths'];
      if (paths is List && paths.isNotEmpty) {
        final first = paths.first?.toString().trim() ?? '';
        if (first.isNotEmpty && pathController.text.isEmpty) {
          pathController.text = first;
        }
      }
    } catch (_) {}
  }());

  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return AlertDialog(
            title: Text(l10n.chatsNewPi),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.chatsPiBody, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),
                Text(
                  l10n.chatsPiFolder,
                  style: Theme.of(ctx).textTheme.labelLarge,
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        pathController.text.trim().isEmpty
                            ? l10n.chatsPiFolderHint
                            : pathController.text.trim(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: pathController.text.trim().isEmpty
                              ? Theme.of(ctx).colorScheme.onSurfaceVariant
                              : Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: starting
                          ? null
                          : () async {
                              final client = ref.read(nodeServiceProvider);
                              if (client == null) return;
                              final picked = await HomeFolderBrowser.open(
                                ctx,
                                client: client,
                                initialPath: pathController.text.trim().isEmpty
                                    ? null
                                    : pathController.text.trim(),
                              );
                              if (picked == null) return;
                              setLocal(() => pathController.text = picked);
                            },
                      child: Text(l10n.knowledgePanelBrowse),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: starting ? null : () => Navigator.of(ctx).pop(),
                child: Text(l10n.commonCancel),
              ),
              FilledButton(
                onPressed: starting
                    ? null
                    : () async {
                        final path = pathController.text.trim();
                        if (path.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(l10n.chatsPiFolderRequired)),
                          );
                          return;
                        }
                        setLocal(() => starting = true);
                        try {
                          final sessionId = await ref
                              .read(chatProvider.notifier)
                              .createPiTerminal(projectPath: path);
                          if (!ctx.mounted) return;
                          Navigator.of(ctx).pop();
                          if (!context.mounted) return;
                          final base = path
                              .replaceAll(RegExp(r'[/\\]+$'), '')
                              .split(RegExp(r'[/\\]'))
                              .where((s) => s.isNotEmpty)
                              .lastOrNull;
                          final title = (base != null && base.isNotEmpty)
                              ? base
                              : path;
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => TerminalDetailScreen(
                                sessionId: sessionId,
                                sessionName: 'π $title',
                                sessionRole: 'pi',
                              ),
                            ),
                          );
                        } catch (e) {
                          setLocal(() => starting = false);
                          if (!ctx.mounted) return;
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(
                              content: Text(
                                e.toString().replaceFirst('Bad state: ', ''),
                              ),
                            ),
                          );
                        }
                      },
                child: starting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.chatsPiTitle),
              ),
            ],
          );
        },
      );
    },
  );
  pathController.dispose();
}

Future<void> showCreateEnvoyDialog(
  BuildContext context,
  WidgetRef ref, {
  String? existingSessionId,
  bool forceRestart = false,
}) async {
  final pathController = TextEditingController();
  var starting = false;

  unawaited(() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final envoyCwd = cfg['envoyHarnessCwd']?.toString().trim();
      if (envoyCwd != null && envoyCwd.isNotEmpty && pathController.text.isEmpty) {
        pathController.text = envoyCwd;
      }
      if (pathController.text.isEmpty) {
        final settings = (cfg['piSettings'] as Map?)?.cast<String, dynamic>();
        final paths = settings?['allowedPaths'];
        if (paths is List && paths.isNotEmpty) {
          final first = paths.first?.toString().trim() ?? '';
          if (first.isNotEmpty) {
            pathController.text = first;
          }
        }
      }
    } catch (_) {}
  }());

  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      return StatefulBuilder(
        builder: (ctx, setLocal) {
          return AlertDialog(
            title: Text(
              forceRestart ? l10n.ehChangeProjectTitle : l10n.ehChooseProjectTitle,
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.ehChooseProjectDesc, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),
                Text(
                  l10n.chatsPiFolder,
                  style: Theme.of(ctx).textTheme.labelLarge,
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        pathController.text.trim().isEmpty
                            ? l10n.chatsPiFolderHint
                            : pathController.text.trim(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: pathController.text.trim().isEmpty
                              ? Theme.of(ctx).colorScheme.onSurfaceVariant
                              : Theme.of(ctx).colorScheme.onSurface,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: starting
                          ? null
                          : () async {
                              final client = ref.read(nodeServiceProvider);
                              if (client == null) return;
                              final picked = await HomeFolderBrowser.open(
                                ctx,
                                client: client,
                                initialPath: pathController.text.trim().isEmpty
                                    ? null
                                    : pathController.text.trim(),
                              );
                              if (picked == null) return;
                              setLocal(() => pathController.text = picked);
                            },
                      child: Text(l10n.knowledgePanelBrowse),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: starting ? null : () => Navigator.of(ctx).pop(),
                child: Text(l10n.commonCancel),
              ),
              FilledButton(
                onPressed: starting
                    ? null
                    : () async {
                        final path = pathController.text.trim();
                        if (path.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(l10n.chatsPiFolderRequired)),
                          );
                          return;
                        }
                        setLocal(() => starting = true);
                        try {
                          final sessionId = await ref
                              .read(chatProvider.notifier)
                              .createEnvoyTerminal(
                                projectPath: path,
                                sessionId: existingSessionId,
                                forceRestart: forceRestart,
                              );
                          if (!ctx.mounted) return;
                          Navigator.of(ctx).pop();
                          if (!context.mounted) return;
                          final base = path
                              .replaceAll(RegExp(r'[/\\]+$'), '')
                              .split(RegExp(r'[/\\]'))
                              .where((s) => s.isNotEmpty)
                              .lastOrNull;
                          final title = (base != null && base.isNotEmpty)
                              ? base
                              : path;
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => TerminalDetailScreen(
                                sessionId: sessionId,
                                sessionName: 'EH $title',
                                sessionRole: 'envoy-harness',
                              ),
                            ),
                          );
                        } catch (e) {
                          setLocal(() => starting = false);
                          if (!ctx.mounted) return;
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(
                              content: Text(
                                e.toString().replaceFirst('Bad state: ', ''),
                              ),
                            ),
                          );
                        }
                      },
                child: starting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        forceRestart
                            ? l10n.ehRestartWithProject
                            : l10n.ehStartWithProject,
                      ),
              ),
            ],
          );
        },
      );
    },
  );
  pathController.dispose();
}
