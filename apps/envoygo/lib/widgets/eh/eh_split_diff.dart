import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Side-by-side (or stacked on narrow screens) unified diff view.
///
/// Never uses [Expanded] in the stacked layout — ExpansionTile children
/// have unbounded height and flex children would throw.
class EhSplitDiff extends StatelessWidget {
  const EhSplitDiff({super.key, required this.diff});

  final String diff;

  @override
  Widget build(BuildContext context) {
    final removed = <String>[];
    final added = <String>[];
    for (final line in diff.split('\n')) {
      if (line.startsWith('---') ||
          line.startsWith('+++') ||
          line.startsWith('@@')) {
        continue;
      }
      if (line.startsWith('-')) {
        removed.add(line.substring(1));
      } else if (line.startsWith('+')) {
        added.add(line.substring(1));
      } else {
        removed.add(line);
        added.add(line);
      }
    }
    final scheme = Theme.of(context).colorScheme;
    const mono = TextStyle(fontFamily: 'monospace', fontSize: 12);
    final oldStyle = mono.copyWith(color: scheme.onErrorContainer);
    final newStyle = mono.copyWith(color: scheme.onPrimaryContainer);
    final oldBg = scheme.errorContainer.withValues(alpha: 0.35);
    final newBg = scheme.primaryContainer.withValues(alpha: 0.35);

    Widget pane({
      required Color background,
      required TextStyle style,
      required String text,
      required String label,
    }) {
      return Container(
        width: double.infinity,
        color: background,
        padding: const EdgeInsets.all(8),
        child: SelectableText(text, style: style, semanticsLabel: label),
      );
    }

    final l10n = AppLocalizations.of(context);
    final oldPane = pane(
      background: oldBg,
      style: oldStyle,
      text: removed.join('\n'),
      label: l10n.ehDiffBefore,
    );
    final newPane = pane(
      background: newBg,
      style: newStyle,
      text: added.join('\n'),
      label: l10n.ehDiffAfter,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < 480;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              oldPane,
              const SizedBox(height: 4),
              newPane,
            ],
          );
        }
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: oldPane),
              const SizedBox(width: 4),
              Expanded(child: newPane),
            ],
          ),
        );
      },
    );
  }
}
