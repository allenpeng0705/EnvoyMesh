import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

class CodingImportSessionRow {
  const CodingImportSessionRow({
    required this.id,
    required this.title,
    this.subtitle,
  });

  final String id;
  final String title;
  final String? subtitle;
}

/// Pick another Coding session for the same project (resume / switch).
Future<void> showCodingImportSessionSheet(
  BuildContext context, {
  required List<CodingImportSessionRow> rows,
  required void Function(String id) onPick,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                child: Text(
                  l10n.codingImportSession,
                  style: Theme.of(ctx).textTheme.titleLarge,
                ),
              ),
              if (rows.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'No other sessions for this project yet.',
                    textAlign: TextAlign.center,
                    style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                        ),
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: rows.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (c, i) {
                      final row = rows[i];
                      return ListTile(
                        title: Text(row.title),
                        subtitle: row.subtitle != null &&
                                row.subtitle!.trim().isNotEmpty
                            ? Text(
                                row.subtitle!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              )
                            : null,
                        onTap: () {
                          Navigator.of(ctx).pop();
                          onPick(row.id);
                        },
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}
