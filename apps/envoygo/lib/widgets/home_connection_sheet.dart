import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/node_provider.dart';
import '../screens/pairing/pairing_scan_screen.dart';
import 'connection_indicator.dart';

/// Bottom sheet: home connection status + pair / reconnect / unpair.
Future<void> showHomeConnectionSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => const _HomeConnectionSheet(),
  );
}

class _HomeConnectionSheet extends ConsumerWidget {
  const _HomeConnectionSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final nodeState = ref.watch(nodeProvider);
    final notifier = ref.read(nodeProvider.notifier);
    final scheme = Theme.of(context).colorScheme;
    final active = nodeState.activeNode;
    final paired = nodeState.pairedNodes;

    String statusLine;
    IconData statusIcon;
    Color statusColor;
    switch (nodeState.connectionState) {
      case NodeConnectionState.connected:
        statusIcon = Icons.cloud_done;
        statusColor = Colors.green;
        final hasUpnp = nodeState.upnpAdvertisedAddr != null;
        final (badge, _) = connectionBadge(
          nodeState.activeTransport,
          hasUpnp,
          l10n,
        );
        statusLine = l10n.homeConnectionStatusConnected(
          active?.name ?? '',
          badge,
        );
      case NodeConnectionState.connecting:
        statusIcon = Icons.cloud_sync;
        statusColor = Colors.orange;
        statusLine = l10n.connTooltipConnecting;
      case NodeConnectionState.error:
        statusIcon = Icons.cloud_off;
        statusColor = Colors.red;
        statusLine = nodeState.errorMessage ?? l10n.connTooltipError;
      case NodeConnectionState.disconnected:
        statusIcon = Icons.cloud_outlined;
        statusColor = Colors.grey;
        statusLine = active != null
            ? l10n.meDisconnectedFrom(active.name)
            : l10n.connTooltipOffline;
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.homeConnectionSheetTitle,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(statusIcon, color: statusColor),
              title: Text(
                active?.name ??
                    (paired.isNotEmpty
                        ? paired.first.name
                        : l10n.meNotConnected),
              ),
              subtitle: Text(statusLine),
            ),
            const SizedBox(height: 8),
            if (active == null && paired.isEmpty) ...[
              Text(
                l10n.meNotConnectedHint,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const PairingScanScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(l10n.commonPair),
              ),
            ] else ...[
              if (nodeState.connectionState != NodeConnectionState.connected)
                FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    if (nodeState.homeNodeErrorCode == 'unauthorized') {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const PairingScanScreen(),
                        ),
                      );
                    } else {
                      notifier.kickReconnect();
                    }
                  },
                  icon: Icon(
                    nodeState.homeNodeErrorCode == 'unauthorized'
                        ? Icons.qr_code
                        : Icons.refresh,
                  ),
                  label: Text(
                    nodeState.homeNodeErrorCode == 'unauthorized'
                        ? l10n.meRepair
                        : l10n.meReconnectNow,
                  ),
                ),
              if (nodeState.connectionState != NodeConnectionState.connected)
                const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () {
                  final node = active ?? paired.firstOrNull;
                  if (node == null) return;
                  Navigator.of(context).pop();
                  _editDirectAddress(context, ref, node);
                },
                icon: const Icon(Icons.lan_outlined),
                label: Text(l10n.mePublicAccess),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const PairingScanScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(l10n.mePairNewNode),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () {
                  final node = active ?? paired.firstOrNull;
                  if (node == null) return;
                  Navigator.of(context).pop();
                  _confirmUnpair(context, ref, notifier, node);
                },
                icon: Icon(Icons.link_off, color: scheme.error),
                label: Text(l10n.meUnpair),
                style: TextButton.styleFrom(foregroundColor: scheme.error),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _editDirectAddress(
    BuildContext context,
    WidgetRef ref,
    StoredNode node,
  ) {
    final l10n = AppLocalizations.of(context);
    final hostController = TextEditingController(text: node.publicHost ?? '');
    final portController = TextEditingController(text: '${node.publicPort}');
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.mePublicAccess),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: hostController,
              decoration: InputDecoration(
                labelText: l10n.mePublicIpLabel,
                hintText: l10n.mePublicIpHint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: portController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: l10n.mePort,
                hintText: '3030',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              l10n.mePublicIpHelp,
              style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                    color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () async {
              final host = hostController.text.trim();
              final port = int.tryParse(portController.text.trim()) ?? 3030;
              Navigator.of(ctx).pop();
              await ref
                  .read(nodeProvider.notifier)
                  .updatePublicAccess(node.id, host, port);
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(l10n.mePublicAccessSaved)),
              );
            },
            child: Text(l10n.commonSave),
          ),
        ],
      ),
    ).whenComplete(() {
      hostController.dispose();
      portController.dispose();
    });
  }

  void _confirmUnpair(
    BuildContext context,
    WidgetRef ref,
    NodeNotifier notifier,
    StoredNode node,
  ) {
    final l10n = AppLocalizations.of(context);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.meUnpairConfirmTitle),
        content: Text(l10n.meUnpairConfirmBodyNamed(node.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await notifier.unpairNode(node.id);
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(l10n.meUnpairedSnack)),
                );
              } catch (e) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(l10n.meUnpairFailed('$e'))),
                );
              }
            },
            child: Text(l10n.commonUnpair),
          ),
        ],
      ),
    );
  }
}
