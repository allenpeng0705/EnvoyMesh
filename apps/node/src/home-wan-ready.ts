/**
 * WAN readiness for home nodes (CGNAT / quietWan / wan-default).
 *
 * `circuitPeers` counts open connections whose remoteAddr is `/p2p-circuit`
 * (usually *inbound* hoppers). A home phone path needs a *live relay
 * reservation* + advertised `…/p2p-circuit/p2p/<self>` in relay.checkin —
 * not `circuitPeers>0` alone.
 *
 * `/health` = process liveness (event loop answers).
 * `/readyz` = WAN dialable via reservation when the profile requires it.
 */

export interface HomeWanReadyInput {
  meshStarted: boolean;
  discoveryProfile?: string;
  relayEnabled?: boolean;
  hasLiveRelayReservation?: boolean;
}

export interface HomeWanReadyResult {
  ready: boolean;
  reason?: string;
}

/** Profiles that rely on circuit-relay for cross-NAT reachability. */
export function discoveryProfileRequiresLiveReservation(profile?: string): boolean {
  // Only lan-fast is LAN-first. wan-default (CLI default), quietWan, relay-only,
  // contacts-only, and unset → require a live reservation when relay is on.
  return profile !== "lan-fast";
}

export function evaluateHomeWanReady(input: HomeWanReadyInput): HomeWanReadyResult {
  if (!input.meshStarted) {
    return { ready: false, reason: "mesh-not-started" };
  }
  const relayEnabled = input.relayEnabled !== false;
  if (!relayEnabled || !discoveryProfileRequiresLiveReservation(input.discoveryProfile)) {
    return { ready: true };
  }
  if (!input.hasLiveRelayReservation) {
    return { ready: false, reason: "no-live-relay-reservation" };
  }
  return { ready: true };
}
