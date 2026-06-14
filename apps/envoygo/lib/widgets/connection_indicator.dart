import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/node_provider.dart';

/// Returns true if the transport avoids a relay server.
/// - "lan" / "public": WebSocket directly to home (no relay)
/// - "p2p-*" candidates: use libp2p (DHT or circuit relay); caller should also
///   check upnpAdvertisedAddr to know if the home can dial mobile back directly.
bool isDirectTransport(String? transport) {
  if (transport == null) return false;
  return transport == 'lan' || transport == 'public';
}

/// Returns a human-readable label for the transport type.
String transportTypeLabel(String? transport) {
  if (transport == null) return 'Unknown';
  if (transport == 'lan') return 'LAN (Direct)';
  if (transport == 'public') return 'Public IP (Direct)';
  if (transport.startsWith('p2p-')) {
    // The p2p-* candidate name tells us which relay/base was used.
    // The actual DHT vs circuit path is internal to _createLibp2pTransport.
    return 'P2P (${transport.substring(4)})';
  }
  if (transport == 'relay' || transport == 'community-relay') return 'Relay WebSocket';
  if (transport == 'bootstrap') return 'Bootstrap';
  return transport;
}

/// Determines the connection status badge for display.
(String label, Color color) connectionBadge(String? transport, bool hasUpnpAddr) {
  if (transport == null) return ('Offline', Colors.grey);
  if (isDirectTransport(transport)) {
    return ('Direct', Colors.green);
  }
  // p2p-* transport (libp2p DHT or circuit relay): this IS P2P — data flows
  // end-to-end encrypted between mobile and home, relay only relays bytes.
  if (transport.startsWith('p2p-')) {
    return ('P2P', Colors.green);
  }
  // Relay WebSocket: the relay server is in the data path. UPnP means the home
  // CAN dial us back directly in the future, but the current session is relay.
  if (hasUpnpAddr) {
    return ('Relay', Colors.orange);
  }
  return ('Relay', Colors.orange);
}

/// Connection status indicator in the app bar.
/// Shows connection type badge (Direct/Relay/P2P) when connected.
class ConnectionIndicator extends ConsumerWidget {
  const ConnectionIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodeState = ref.watch(nodeProvider);

    IconData icon;
    Color color;
    String tooltip;
    String badgeLabel = '';
    Color badgeColor = Colors.grey;

    switch (nodeState.connectionState) {
      case NodeConnectionState.connected:
        icon = Icons.cloud_done;
        final hasUpnp = nodeState.upnpAdvertisedAddr != null;
        (badgeLabel, badgeColor) = connectionBadge(nodeState.activeTransport, hasUpnp);
        color = Colors.green;
        if (isDirectTransport(nodeState.activeTransport)) {
          tooltip = 'Direct connection';
        } else if (nodeState.activeTransport?.startsWith('p2p-') ?? false) {
          tooltip = 'P2P connection via ${transportTypeLabel(nodeState.activeTransport)}';
        } else if (hasUpnp) {
          tooltip = 'Relay connection — home can dial you directly (${nodeState.upnpAdvertisedAddr})';
        } else {
          tooltip = 'Connected via ${transportTypeLabel(nodeState.activeTransport)}';
        }
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
                    color: badgeColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    badgeLabel,
                    style: TextStyle(
                      color: badgeColor,
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
