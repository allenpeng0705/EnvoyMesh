import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/stored_node.dart';
import '../../providers/node_provider.dart';
import '../pairing/pairing_scan_screen.dart';
import 'node_switcher_sheet.dart';

/// Profile + node management screen.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodeState = ref.watch(nodeProvider);
    final notifier = ref.read(nodeProvider.notifier);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Profile section
        const SizedBox(height: 24),
        const CircleAvatar(
          radius: 40,
          child: Icon(Icons.person, size: 40),
        ),
        const SizedBox(height: 12),
        Text(
          'EnvoyGo',
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        if (nodeState.ownerId != null) ...[
          const SizedBox(height: 4),
          Text(
            nodeState.ownerId!.length > 24
                ? '${nodeState.ownerId!.substring(0, 12)}...${nodeState.ownerId!.substring(nodeState.ownerId!.length - 12)}'
                : nodeState.ownerId!,
            style: Theme.of(context).textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: 32),

        // Connected node
        const _SectionHeader(title: 'Connected Node'),
        if (nodeState.activeNode != null) ...[
          Card(
            child: ListTile(
              leading: Icon(
                nodeState.connectionState == NodeConnectionState.connected
                    ? Icons.circle
                    : Icons.circle_outlined,
                color: nodeState.connectionState ==
                        NodeConnectionState.connected
                    ? Colors.green
                    : Colors.grey,
                size: 12,
              ),
              title: Text(nodeState.activeNode!.name),
              subtitle: Text(
                nodeState.activeTransport != null
                    ? '${nodeState.activeTransport} · ${nodeState.connectionState.name}'
                    : nodeState.connectionState.name,
              ),
              trailing: TextButton(
                onPressed: nodeState.pairedNodes.length > 1
                    ? () => _showNodeSwitcher(context, ref, notifier)
                    : null,
                child: Text(nodeState.pairedNodes.length > 1
                    ? 'Switch'
                    : ''),
              ),
            ),
          ),
          if (nodeState.pairedNodes.length > 1) ...[
            const SizedBox(height: 4),
            Text(
              '+${nodeState.pairedNodes.length - 1} more paired',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ] else ...[
          Card(
            child: ListTile(
              leading: const Icon(Icons.link_off, color: Colors.grey),
              title: const Text('Not connected'),
              subtitle:
                  const Text('Pair with a home node to get started'),
              trailing: FilledButton(
                onPressed: () => _openPairing(context),
                child: const Text('Pair'),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),

        // Pair new
        if (nodeState.activeNode != null) ...[
          Card(
            child: ListTile(
              leading: const Icon(Icons.add_link),
              title: const Text('Pair New Node'),
              subtitle: const Text('Add another home node'),
              onTap: () => _openPairing(context),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Theme
        const _SectionHeader(title: 'Preferences'),
        Card(
          child: SwitchListTile(
            title: const Text('Dark mode'),
            subtitle: const Text('Follow system setting'),
            value: Theme.of(context).brightness == Brightness.dark,
            onChanged: (_) {
              // TODO(31H): Theme toggle
            },
          ),
        ),
        const SizedBox(height: 16),

        // Unpair
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: ''),
          Card(
            child: ListTile(
              leading: const Icon(Icons.link_off, color: Colors.red),
              title: const Text('Unpair This Device'),
              subtitle:
                  const Text('Disconnect and remove all data'),
              onTap: () => _confirmUnpair(
                  context, ref, notifier, nodeState.activeNode!),
            ),
          ),
        ],
      ],
    );
  }

  void _openPairing(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const PairingScanScreen()),
    );
  }

  void _showNodeSwitcher(
    BuildContext context,
    WidgetRef ref,
    NodeNotifier notifier,
  ) {
    final nodeState = ref.read(nodeProvider);
    showModalBottomSheet(
      context: context,
      builder: (_) => NodeSwitcherSheet(
        nodes: nodeState.pairedNodes,
        activeNodeId: nodeState.activeNode?.id,
        onSelect: (nodeId) => notifier.switchToNode(nodeId),
        onPairNew: () {
          Navigator.of(context).pop();
          _openPairing(context);
        },
      ),
    );
  }

  void _confirmUnpair(
    BuildContext context,
    WidgetRef ref,
    NodeNotifier notifier,
    StoredNode node,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unpair?'),
        content: Text(
            'This will disconnect and remove all data for ${node.name}.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              notifier.unpairNode(node.id);
            },
            child: const Text('Unpair'),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
            ),
      ),
    );
  }
}
