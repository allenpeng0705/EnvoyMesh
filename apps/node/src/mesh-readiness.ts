/**
 * Mesh readiness for sponsor auto-bond / WAN dial attempts.
 * Separated from NodeServiceImpl so unit tests can cover wan-default
 * reservation gating without spinning libp2p.
 */

export interface MeshReadinessProbeTarget {
  multiaddrs: readonly string[];
  hasLiveRelayReservation?: () => boolean;
  hasRelayReservation?: () => boolean;
  getConnectedRelayPeerIds: () => string[];
  getConnectedPeerIds: () => string[];
}

export interface MeshReadinessConfig {
  discoveryProfile?: string;
  relayEnabled?: boolean;
}

/**
 * Returns true when outbound auto-bond may start without burning dials.
 *
 * - wan-default + relayEnabled: require a *live* circuit reservation
 * - lan-fast / relay off: reservation OR any connected peer
 */
export function isMeshReadyForSponsorBond(
  mesh: MeshReadinessProbeTarget | null | undefined,
  config?: MeshReadinessConfig,
): boolean {
  if (!mesh) return false;
  if (mesh.multiaddrs.length === 0) return false;

  const lanFast = config?.discoveryProfile === "lan-fast";
  const relayEnabled = config?.relayEnabled !== false;

  if (relayEnabled && !lanFast) {
    if (typeof mesh.hasLiveRelayReservation === "function") {
      return mesh.hasLiveRelayReservation();
    }
    if (typeof mesh.hasRelayReservation === "function") {
      return mesh.hasRelayReservation();
    }
  }

  if (typeof mesh.hasRelayReservation === "function" && mesh.hasRelayReservation()) {
    return true;
  }
  return (
    mesh.getConnectedRelayPeerIds().length > 0 || mesh.getConnectedPeerIds().length > 0
  );
}
