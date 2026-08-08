/**
 * PeerPath — encapsulated bonded-contact reachability entry + dial caps.
 *
 * Why this exists:
 * - Policy (VPN / same-LAN / Relay→Direct) → peer-reachability-policy.ts
 * - Budgets → outbound-warm-dial.ts
 * - Dial concurrency slots → peer-path-slots.ts
 * - This module is the recommended entry for warm / upgrade / keepalive so
 *   feature code does not call ensurePeerReachable / identify directly.
 *
 * Soft connection cap is enforced here; in-flight dial slots are acquired
 * inside the warm transport path only when a real dial is about to start.
 */
import type { PeerConnectionInfo, WarmContactConnectionOptions } from "@envoymesh/api";
import type { OutboundMessagingContext } from "./node-service-outbound-messaging.js";
import {
  getPeerConnectionInfoViaRuntime,
  warmContactConnectionViaRuntime,
} from "./node-service-outbound-messaging.js";
import {
  inferPeerPathIntent,
  isPeerPathConnectionCapReached,
  type PeerPathIntent,
} from "./peer-path-slots.js";

export {
  PEER_PATH_MAX_IN_FLIGHT_DIALS,
  PEER_PATH_SOFT_CONNECTION_CAP,
  PEER_PATH_USER_SLOT_WAIT_MS,
  getPeerPathDialStatsForTests,
  inferPeerPathIntent,
  isPeerPathConnectionCapReached,
  releasePeerPathDialSlot,
  resetPeerPathDialSlotsForTests,
  tryAcquirePeerPathDialSlot,
  type PeerPathIntent,
} from "./peer-path-slots.js";

export type EnsureContactPathOptions = WarmContactConnectionOptions & {
  intent?: PeerPathIntent;
};

/**
 * Soft connection cap applies to background warm/keepalive only.
 * User-facing upgrade/force must still run (Online-Relay → Direct).
 */
function shouldEnforceSoftConnectionCap(intent: PeerPathIntent): boolean {
  return intent === "warm" || intent === "keepalive";
}

/**
 * Sole recommended entry for bonded-contact path warm / Relay→Direct / keepalive.
 */
export async function ensureContactPath(
  ctx: OutboundMessagingContext,
  peerOwnerId: string,
  options?: EnsureContactPathOptions,
): Promise<PeerConnectionInfo> {
  const intent = options?.intent ?? inferPeerPathIntent(options);
  const mesh = ctx.getReachableMesh();
  if (
    shouldEnforceSoftConnectionCap(intent) &&
    mesh &&
    typeof mesh.getConnectionStats === "function" &&
    isPeerPathConnectionCapReached(mesh.getConnectionStats().totalConnections)
  ) {
    return getPeerConnectionInfoViaRuntime(ctx, peerOwnerId);
  }

  return warmContactConnectionViaRuntime(ctx, peerOwnerId, options);
}
