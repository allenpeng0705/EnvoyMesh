// Shared Knowledge plugin card chrome.
import 'package:flutter/material.dart';

class KnowledgePluginCardShell extends StatelessWidget {
  final String title;
  final String tagline;
  final String? statusLabel;
  final Widget? trailing;
  final List<Widget> children;
  final bool initiallyExpanded;

  const KnowledgePluginCardShell({
    super.key,
    required this.title,
    required this.tagline,
    this.statusLabel,
    this.trailing,
    this.children = const [],
    this.initiallyExpanded = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        title: Text(title),
        subtitle: Text(tagline, style: theme.textTheme.bodySmall),
        trailing: trailing,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          if (statusLabel != null) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: Text(statusLabel!, style: theme.textTheme.labelMedium),
            ),
            const SizedBox(height: 8),
          ],
          ...children,
        ],
      ),
    );
  }
}
