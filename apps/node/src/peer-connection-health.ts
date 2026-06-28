/**
 * Per-peer connection health evaluation.
 * Added post-00b5b5d; minimal stub for compilation.
 */

export interface PeerConnectionHealth {
  connected: boolean;
  direct: boolean;
  reachabilityLabel: string;
  transportPeerId: string;
}

export function buildPeerConnectionHealth(
  transportPeerId: string,
  connectionInfo: { connected: boolean; direct: boolean },
  _reachability?: string,
): PeerConnectionHealth {
  return {
    connected: connectionInfo.connected,
    direct: connectionInfo.direct,
    reachabilityLabel: connectionInfo.connected
      ? connectionInfo.direct
        ? "Online · Direct"
        : "Online · Relay"
      : "Offline",
    transportPeerId,
  };
}
