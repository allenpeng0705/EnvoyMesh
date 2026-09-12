import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/cross_persona_suggestions_provider.dart';
import '../providers/node_provider.dart';

/// Minimal S5 surface: suggest bonded contacts from the other Social persona.
class CrossPersonaSuggestionsSection extends ConsumerWidget {
  const CrossPersonaSuggestionsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodeState = ref.watch(nodeProvider);
    if (nodeState.pairedNodes.isEmpty && nodeState.activeNode == null) {
      return const SizedBox.shrink();
    }

    final state = ref.watch(crossPersonaSuggestionsProvider);
    if (state.suggestions.isEmpty && !state.isLoading) {
      return const SizedBox.shrink();
    }

    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.crossPersonaSuggestionsTitle,
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 4),
          Text(
            l10n.crossPersonaSuggestionsSubtitle,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (state.isLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            ...state.suggestions.take(8).map((s) {
              final name = (s.displayName != null && s.displayName!.trim().isNotEmpty)
                  ? s.displayName!
                  : s.ownerId;
              final from = l10n.crossPersonaFromHome;
              return Card(
                margin: const EdgeInsets.only(top: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : '?',
                    ),
                  ),
                  title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(from),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextButton(
                        onPressed: () => _hello(context, ref, s),
                        child: Text(l10n.crossPersonaSayHello),
                      ),
                      IconButton(
                        tooltip: l10n.crossPersonaDismiss,
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => ref
                            .read(crossPersonaSuggestionsProvider.notifier)
                            .dismiss(s.ownerId),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Future<void> _hello(
    BuildContext context,
    WidgetRef ref,
    CrossPersonaSuggestion suggestion,
  ) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final result = await ref
        .read(crossPersonaSuggestionsProvider.notifier)
        .sayHello(suggestion);
    if (!context.mounted) return;
    if (result['ok'] == true) {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.crossPersonaHelloSent)),
      );
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            result['error']?.toString() ?? l10n.crossPersonaHelloFailed,
          ),
        ),
      );
    }
  }
}
