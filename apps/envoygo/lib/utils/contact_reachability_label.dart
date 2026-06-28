import '../models/peer_connection_info.dart';

/// Human-readable P2P reachability label (mirrors Social `peerReachabilityLabel`).
String contactReachabilityLabel(PeerConnectionInfo? info, {bool checking = false}) {
  if (checking && info == null) return 'Checking…';
  if (info == null) return 'Checking…';
  if (!info.connected) return 'Offline';
  if (info.direct) return 'Online · Direct';
  return 'Online · Relay';
}

bool contactReachabilityIsOnline(PeerConnectionInfo? info) =>
    info?.connected == true;
