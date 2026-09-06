import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';

/// Bottom sheet for switching between paired home nodes.
class NodeSwitcherSheet extends StatelessWidget {
  final List<StoredNode> nodes;
  final String? activeNodeId;
  final void Function(String nodeId) onSelect;
  final VoidCallback onPairNew;

  const NodeSwitcherSheet({
    super.key,
    required this.nodes,
    required this.activeNodeId,
    required this.onSelect,
    required this.onPairNew,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            l10n.meSwitchNode,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          // Node list
          ...nodes.map((node) => ListTile(
                leading: Icon(
                  node.id == activeNodeId
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  color: node.id == activeNodeId
                      ? Theme.of(context).colorScheme.primary
                      : Colors.grey,
                ),
                title: Text(node.name),
                subtitle: Text(node.ownerId.length > 20
                    ? '${node.ownerId.substring(0, 10)}...'
                    : node.ownerId),
                onTap: () {
                  Navigator.of(context).pop();
                  onSelect(node.id);
                },
              )),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.add),
            title: Text(l10n.mePairNewNode),
            onTap: () {
              Navigator.of(context).pop();
              onPairNew();
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
