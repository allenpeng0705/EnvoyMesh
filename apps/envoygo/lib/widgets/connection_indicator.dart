import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/node_provider.dart';

/// Connection status indicator in the app bar.
class ConnectionIndicator extends ConsumerWidget {
  const ConnectionIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodeState = ref.watch(nodeProvider);

    IconData icon;
    Color color;
    String tooltip;

    switch (nodeState.connectionState) {
      case NodeConnectionState.connected:
        icon = Icons.cloud_done;
        color = Colors.green;
        tooltip = 'Connected (${nodeState.activeTransport ?? 'unknown'})';
      case NodeConnectionState.connecting:
        icon = Icons.cloud_sync;
        color = Colors.orange;
        tooltip = 'Connecting...';
      case NodeConnectionState.error:
        icon = Icons.cloud_off;
        color = Colors.red;
        tooltip = nodeState.errorMessage ?? 'Connection error';
      case NodeConnectionState.disconnected:
        icon = Icons.cloud_outlined;
        color = Colors.grey;
        tooltip = 'Not connected';
    }

    return Tooltip(
      message: tooltip,
      child: Icon(icon, color: color, size: 20),
    );
  }
}
