import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/app_localizations.dart';
import '../providers/node_provider.dart';
import 'home_connection_sheet.dart';

/// Returns true if the transport avoids a relay server.
/// - "lan" / "public": WebSocket directly to home (no relay)
/// - "p2p-*" candidates: use libp2p (DHT or circuit relay); caller should also
///   check upnpAdvertisedAddr to know if the home can dial mobile back directly.
bool isDirectTransport(String? transport) {
  if (transport == null) return false;
  return transport == 'lan' || transport == 'public';
}

/// Returns a human-readable label for the transport type.
String transportTypeLabel(String? transport, AppLocalizations l10n) {
  if (transport == null) return l10n.commonUnknown;
  if (transport == 'lan') return l10n.connLanDirect;
  if (transport == 'public') return l10n.connPublicDirect;
  if (transport.startsWith('p2p-')) {
    // The p2p-* candidate name tells us which relay/base was used.
    // The actual DHT vs circuit path is internal to _createLibp2pTransport.
    return l10n.connP2pDetail(transport.substring(4));
  }
  if (transport == 'relay' || transport == 'community-relay') {
    return l10n.connRelayWs;
  }
  if (transport == 'bootstrap') return l10n.connBootstrap;
  return transport;
}

/// Determines the connection status badge for display.
(String label, Color color) connectionBadge(
  String? transport,
  bool hasUpnpAddr,
  AppLocalizations l10n,
) {
  if (transport == null) return (l10n.connOffline, Colors.grey);
  if (isDirectTransport(transport)) {
    return (l10n.connDirect, Colors.green);
  }
  // p2p-* transport (libp2p DHT or circuit relay): this IS P2P — data flows
  // end-to-end encrypted between mobile and home, relay only relays bytes.
  if (transport.startsWith('p2p-')) {
    return (l10n.connP2p, Colors.green);
  }
  // Relay WebSocket: the relay server is in the data path. UPnP means the home
  // CAN dial us back directly in the future, but the current session is relay.
  if (hasUpnpAddr) {
    return (l10n.connRelay, Colors.orange);
  }
  return (l10n.connRelay, Colors.orange);
}

/// App-bar home-connection button (icon only). Tap opens pair / unpair sheet.
///
/// Phone mesh runs quietly in the background — not shown as a second status.
class ConnectionIndicator extends ConsumerWidget {
  const ConnectionIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final nodeState = ref.watch(nodeProvider);

    IconData icon;
    Color color;
    String tooltip;

    if (nodeState.activeNode == null) {
      icon = Icons.cloud_outlined;
      color = Colors.grey;
      tooltip = l10n.connTooltipOffline;
    } else {
      switch (nodeState.connectionState) {
        case NodeConnectionState.connected:
          icon = Icons.cloud_done_outlined;
          color = Colors.green;
          final hasUpnp = nodeState.upnpAdvertisedAddr != null;
          if (isDirectTransport(nodeState.activeTransport)) {
            tooltip = l10n.connTooltipDirect;
          } else if (nodeState.activeTransport?.startsWith('p2p-') ?? false) {
            tooltip = l10n.connTooltipP2p;
          } else if (hasUpnp) {
            tooltip = l10n.connTooltipRelay;
          } else {
            tooltip = l10n.connTooltipConnectedVia(
              transportTypeLabel(nodeState.activeTransport, l10n),
            );
          }
        case NodeConnectionState.connecting:
          icon = Icons.cloud_sync_outlined;
          color = Colors.orange;
          tooltip = l10n.connTooltipConnecting;
        case NodeConnectionState.error:
          icon = Icons.cloud_off_outlined;
          color = Colors.red;
          tooltip = nodeState.errorMessage ?? l10n.connTooltipError;
        case NodeConnectionState.disconnected:
          icon = Icons.cloud_outlined;
          color = Colors.grey;
          tooltip = l10n.connTooltipOffline;
      }
    }

    return IconButton(
      tooltip: tooltip,
      visualDensity: VisualDensity.standard,
      padding: const EdgeInsets.all(8),
      constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
      onPressed: () => showHomeConnectionSheet(context),
      icon: Icon(icon, color: color, size: 22),
    );
  }
}
