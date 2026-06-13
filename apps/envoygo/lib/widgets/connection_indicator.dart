import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/node_provider.dart';

/// Returns true if the transport is a direct (P2P) connection, false if relay.
bool isDirectTransport(String? transport) {
  if (transport == null) return false;
  // Direct transports: LAN, public IP
  if (transport == 'lan' || transport == 'public') return true;
  // Everything else (relay, community-relay, p2p-*) goes through relay
  return false;
}

/// Returns a short label for the transport type.
String transportTypeLabel(String? transport) {
  if (transport == null) return 'Unknown';
  if (isDirectTransport(transport)) return 'Direct';
  if (transport.startsWith('p2p-')) return 'Relay';
  if (transport == 'relay' || transport == 'community-relay') return 'Relay';
  return transport;
}

/// Connection status indicator in the app bar.
/// Shows connection type badge (Direct/Relay) when connected.
class ConnectionIndicator extends ConsumerWidget {
  const ConnectionIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodeState = ref.watch(nodeProvider);

    IconData icon;
    Color color;
    String tooltip;
    bool isDirect = false;

    switch (nodeState.connectionState) {
      case NodeConnectionState.connected:
        icon = Icons.cloud_done;
        color = Colors.green;
        isDirect = isDirectTransport(nodeState.activeTransport);
        tooltip = isDirect
            ? 'Direct connection'
            : 'Via ${nodeState.activeTransport ?? 'relay'}';
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
      child: nodeState.connectionState == NodeConnectionState.connected
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: color, size: 20),
                const SizedBox(width: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: isDirect ? Colors.green.shade100 : Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isDirect ? 'P2P' : 'Relay',
                    style: TextStyle(
                      color: isDirect ? Colors.green.shade700 : Colors.orange.shade700,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            )
          : Icon(icon, color: color, size: 20),
    );
  }
}
