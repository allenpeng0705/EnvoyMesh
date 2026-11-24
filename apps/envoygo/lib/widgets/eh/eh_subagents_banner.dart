import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

class EhSubagentRow {
  EhSubagentRow({
    required this.id,
    required this.summary,
    required this.status,
  });

  final String id;
  final String summary;
  final String status;
}

/// FH-P2-B — live `task` children above the EH composer (EnvoyGo).
class EhSubagentsBanner extends StatelessWidget {
  const EhSubagentsBanner({
    super.key,
    required this.rows,
    this.maxSubagents = 8,
  });

  final List<EhSubagentRow> rows;
  final int maxSubagents;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Material(
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  l10n.ehTrackSubagents,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const Spacer(),
                Text(
                  l10n.ehSubagentsCap(maxSubagents),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ...rows.map(
              (row) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      row.status == 'running'
                          ? Icons.sync
                          : row.status == 'failed'
                          ? Icons.error_outline
                          : Icons.check_circle_outline,
                      size: 16,
                      color: row.status == 'failed'
                          ? scheme.error
                          : row.status == 'running'
                          ? scheme.primary
                          : scheme.tertiary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        row.summary,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}