import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../widgets/home_folder_browser.dart';

enum CodingHarnessChoice {
  envoyHarness,
  pi,
  claudeCode,
  codex,
  openCode,
  cursor,
  codeWhale,
}

bool codingHarnessIsTierB(CodingHarnessChoice h) =>
    h != CodingHarnessChoice.envoyHarness && h != CodingHarnessChoice.pi;

/// Wire harness id (matches `@envoymesh/api` `CodingHarnessId`).
String codingHarnessWireId(CodingHarnessChoice h) {
  switch (h) {
    case CodingHarnessChoice.envoyHarness:
      return 'envoy-harness';
    case CodingHarnessChoice.pi:
      return 'pi';
    case CodingHarnessChoice.claudeCode:
      return 'claudecode';
    case CodingHarnessChoice.codex:
      return 'codex';
    case CodingHarnessChoice.openCode:
      return 'opencode';
    case CodingHarnessChoice.cursor:
      return 'cursor';
    case CodingHarnessChoice.codeWhale:
      return 'codewhale';
  }
}

CodingHarnessChoice? codingHarnessFromWireId(String id) {
  switch (id.trim()) {
    case 'envoy-harness':
      return CodingHarnessChoice.envoyHarness;
    case 'pi':
      return CodingHarnessChoice.pi;
    case 'claudecode':
      return CodingHarnessChoice.claudeCode;
    case 'codex':
      return CodingHarnessChoice.codex;
    case 'opencode':
      return CodingHarnessChoice.openCode;
    case 'cursor':
      return CodingHarnessChoice.cursor;
    case 'codewhale':
      return CodingHarnessChoice.codeWhale;
    default:
      return null;
  }
}

/// Ext Agent preset id for Tier B; null for Tier A.
String? codingHarnessToExtAgentId(CodingHarnessChoice h) {
  if (!codingHarnessIsTierB(h)) return null;
  return codingHarnessWireId(h);
}

String codingHarnessDisplayName(CodingHarnessChoice h) {
  switch (h) {
    case CodingHarnessChoice.envoyHarness:
      return 'Envoy';
    case CodingHarnessChoice.pi:
      return 'Pi';
    case CodingHarnessChoice.claudeCode:
      return 'Claude Code';
    case CodingHarnessChoice.codex:
      return 'Codex';
    case CodingHarnessChoice.openCode:
      return 'OpenCode';
    case CodingHarnessChoice.cursor:
      return 'Cursor';
    case CodingHarnessChoice.codeWhale:
      return 'CodeWhale';
  }
}

/// Create sheet: harness (immutable) + project folder via [HomeFolderBrowser].
Future<void> showCodingNewWorkspaceSheet(
  BuildContext context,
  WidgetRef ref, {
  required Future<void> Function(CodingHarnessChoice harness, String cwd)
      onConfirm,
}) async {
  final pathController = TextEditingController();
  var harness = CodingHarnessChoice.envoyHarness;
  var busy = false;

  unawaited(() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final envoyCwd = cfg['envoyHarnessCwd']?.toString().trim();
      if (envoyCwd != null &&
          envoyCwd.isNotEmpty &&
          pathController.text.isEmpty) {
        pathController.text = envoyCwd;
      }
      if (pathController.text.isEmpty) {
        final settings = (cfg['piSettings'] as Map?)?.cast<String, dynamic>();
        final paths = settings?['allowedPaths'];
        if (paths is List && paths.isNotEmpty) {
          final first = paths.first?.toString().trim() ?? '';
          if (first.isNotEmpty) pathController.text = first;
        }
      }
    } catch (_) {}
  }());

  final mayUseCoding = ref.read(nodeProvider).mayUseCoding;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      return Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: MediaQuery.viewInsetsOf(ctx).bottom + 16,
        ),
        child: StatefulBuilder(
          builder: (ctx, setLocal) {
            return SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    l10n.codingNewWorkspaceTitle,
                    style: Theme.of(ctx).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.codingNewWorkspaceDesc,
                    style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    l10n.codingHarnessLabel,
                    style: Theme.of(ctx).textTheme.labelLarge,
                  ),
                  RadioListTile<CodingHarnessChoice>(
                    title: Text(l10n.chatsCodingEh),
                    subtitle: Text(l10n.ehChooseProjectDesc),
                    value: CodingHarnessChoice.envoyHarness,
                    groupValue: harness,
                    onChanged: busy
                        ? null
                        : (v) {
                            if (v != null) setLocal(() => harness = v);
                          },
                  ),
                  RadioListTile<CodingHarnessChoice>(
                    title: Text(l10n.chatsCodingPi),
                    subtitle: Text(l10n.codingPiConsoleHint),
                    value: CodingHarnessChoice.pi,
                    groupValue: harness,
                    onChanged: busy
                        ? null
                        : (v) {
                            if (v != null) setLocal(() => harness = v);
                          },
                  ),
                  ...[
                    CodingHarnessChoice.claudeCode,
                    CodingHarnessChoice.codex,
                    CodingHarnessChoice.openCode,
                    CodingHarnessChoice.cursor,
                    CodingHarnessChoice.codeWhale,
                  ].map(
                    (choice) => RadioListTile<CodingHarnessChoice>(
                      title: Text(codingHarnessDisplayName(choice)),
                      subtitle: Text(l10n.codingExtHarnessHint),
                      value: choice,
                      groupValue: harness,
                      onChanged: busy || !mayUseCoding
                          ? null
                          : (v) {
                              if (v != null) setLocal(() => harness = v);
                            },
                    ),
                  ),
                  const SizedBox(height: 8),
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
                        onPressed: busy
                            ? null
                            : () async {
                                final client = ref.read(nodeServiceProvider);
                                if (client == null) return;
                                final picked = await HomeFolderBrowser.open(
                                  ctx,
                                  client: client,
                                  initialPath:
                                      pathController.text.trim().isEmpty
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
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            final path = pathController.text.trim();
                            if (path.isEmpty) {
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                SnackBar(
                                  content: Text(l10n.chatsPiFolderRequired),
                                ),
                              );
                              return;
                            }
                            setLocal(() => busy = true);
                            try {
                              await onConfirm(harness, path);
                              if (ctx.mounted) Navigator.of(ctx).pop();
                            } catch (e) {
                              setLocal(() => busy = false);
                              if (!ctx.mounted) return;
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    e
                                        .toString()
                                        .replaceFirst('Exception: ', '')
                                        .replaceFirst('Bad state: ', ''),
                                  ),
                                ),
                              );
                            }
                          },
                    child: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(l10n.codingStartWorkspace),
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );
  pathController.dispose();
}
