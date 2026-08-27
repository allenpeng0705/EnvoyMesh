import 'package:flutter/material.dart';

/// Autocomplete list for `/` commands (matches Social chat-slash-suggest).
class SlashCommandSuggest extends StatelessWidget {
  const SlashCommandSuggest({
    super.key,
    required this.items,
    required this.highlightIndex,
    required this.onPick,
    required this.onHighlight,
  });

  final List<({String primary, String summary})> items;
  final int highlightIndex;
  final void Function(String slashWithSpace) onPick;
  final void Function(int index) onHighlight;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final highlight = highlightIndex.clamp(0, items.length - 1);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: ListView.builder(
        shrinkWrap: true,
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          return ListTile(
            dense: true,
            selected: index == highlight,
            title: Text(
              item.primary,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            ),
            subtitle: Text(
              item.summary,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () {
              onHighlight(index);
              final slash = item.primary.split(' ').first;
              onPick('$slash ');
            },
          );
        },
      ),
    );
  }
}
