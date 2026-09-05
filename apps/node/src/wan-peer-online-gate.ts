/**
 * Phase 66B — gate WAN Team-job "online" so a stale libp2p session
 * does not look ready. Same-LAN peers stay online via the LAN path.
 */

import {
  hasDirectTcpDialHints,
  isLoopbackOrUnspecifiedDialHint,
  isPrivateOrUnroutableDialHint,
  isPublicRelayHopCircuitDialHint,
} from "@envoymesh/network";
import { discoveryProfileRequiresLiveReservation } from "./home-wan-ready.js";

export type WanPeerOnlineGateReason =
  | "no-live-relay-reservation"
  | "no-wan-dial-hints";

export function evaluateWanPeerOnlineGate(input: {
  meshConnected: boolean;
  sameLan: boolean;
  /** Already on an open circuit (live hop). */
  viaRelay?: boolean;
  discoveryProfile?: string;
  relayEnabled?: boolean;
  hasLiveRelayReservation: boolean;
  dialHints?: readonly string[];
}): { online: boolean; wanPathReady: boolean; reason?: WanPeerOnlineGateReason } {
  if (!input.meshConnected) {
    return { online: false, wanPathReady: false };
  }
  const hints = input.dialHints ?? [];
  const loopbackLocal = hints.some(
    (h) =>
      isLoopbackOrUnspecifiedDialHint(h) &&
      h.includes("/tcp/") &&
      !h.includes("/p2p-circuit/"),
  );
  if (input.sameLan || loopbackLocal) {
    return { online: true, wanPathReady: true };
  }

  const needsWanInfra =
    input.relayEnabled !== false &&
    discoveryProfileRequiresLiveReservation(input.discoveryProfile);
  if (!needsWanInfra) {
    return { online: true, wanPathReady: true };
  }

  const hasCircuit =
    input.viaRelay === true || hints.some((h) => isPublicRelayHopCircuitDialHint(h));
  const hasPublicDirect = hints.some(
    (h) => hasDirectTcpDialHints([h]) && !isPrivateOrUnroutableDialHint(h),
  );
  const hasDialPath = hasCircuit || hasPublicDirect;

  if (!input.hasLiveRelayReservation) {
    return {
      online: false,
      wanPathReady: false,
      reason: "no-live-relay-reservation",
    };
  }
  if (!hasDialPath) {
    return {
      online: false,
      wanPathReady: false,
      reason: "no-wan-dial-hints",
    };
  }
  return { online: true, wanPathReady: true };
}
