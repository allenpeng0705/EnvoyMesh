/**
 * Single policy surface for bonded-contact dial preference.
 *
 * Warm / send / bond-warm must use these helpers instead of re-deriving
 * VPN / same-subnet / Relay→Direct rules inline. Keeps Online-Direct vs
 * Online-Relay decisions consistent and stops one-off fixes from reopening
 * WAN black-hole dial storms.
 *
 * Entry point for dials: {@link ensureContactPath} in peer-path.ts (caps + warm).
 * This module is policy only — it does not dial.
 */
import { isPrivateLanTcpDialHint } from "@envoymesh/network";
import {
  filterDialHintsForVpn,
  hasRfc6598OverlayDialEvidence,
  hasSameSubnetLanDialEvidence,
  shouldPreferCircuitDialHints,
  shouldPreferCircuitUnderVpn,
} from "./outbound-dial-hints.js";

export type ReachabilityDialPolicyInput = {
  transportPeerId: string;
  discoveryProfile?: string;
  likelyVpnActive: boolean;
  localListenAddrs: readonly string[] | undefined;
  /** Peer-directory / resolve listen addrs (may include tcp/0 high ports). */
  peerListenAddrs: readonly string[] | undefined;
  /** Assembled dial hints (circuits + direct). */
  dialHints: readonly string[];
  /** True when UI/bond-warm asked for Relay→Direct upgrade. */
  upgradeRelayToDirect?: boolean;
};

export type ReachabilityDialPolicy = {
  preferCircuitHints: boolean;
  sameSubnetLanFirst: boolean;
  /** True when VPN is up and home LAN must not be dialed. */
  vpnSkipHomeLan: boolean;
  /** Final dial hint list after VPN home-LAN filter. */
  dialHints: string[];
  /**
   * When true, caller should keep the existing relay connection and not call
   * ensurePeerReachable (cross-network VPN with no same-/24 / overlay proof).
   */
  skipUpgradeStayOnRelay: boolean;
};

function hasLanOrOverlayEvidence(
  localListenAddrs: readonly string[] | undefined,
  peerHints: readonly string[],
): boolean {
  if (
    hasSameSubnetLanDialEvidence(localListenAddrs, peerHints, {
      hostNicFallback: true,
    })
  ) {
    return true;
  }
  return hasRfc6598OverlayDialEvidence(localListenAddrs, peerHints);
}

/**
 * Resolve circuit vs LAN preference for warm/send.
 *
 * Invariants:
 * - Same-/24 or Tailscale overlay → allow LAN-first / Relay→Direct.
 * - VPN without that evidence → prefer circuit; skip home RFC1918.
 * - Relay→Direct never treats "any private LAN" as same-subnet (WAN hazard).
 */
export function resolveReachabilityDialPolicy(
  input: ReachabilityDialPolicyInput,
): ReachabilityDialPolicy {
  const profile = input.discoveryProfile?.trim() ?? "";
  const peerListen = [...(input.peerListenAddrs ?? [])];
  let dialHints = [...input.dialHints];
  const evidenceHints = [...peerListen, ...dialHints];

  const vpnSkipHomeLan = shouldPreferCircuitUnderVpn({
    likelyVpnActive: input.likelyVpnActive,
    localListenAddrs: input.localListenAddrs,
    peerHints: evidenceHints,
  });

  let sameSubnetLanFirst =
    !vpnSkipHomeLan && hasLanOrOverlayEvidence(input.localListenAddrs, evidenceHints);

  let preferCircuitHints = shouldPreferCircuitDialHints(
    peerListen,
    dialHints,
    input.transportPeerId,
    {
      localListenAddrs: input.localListenAddrs,
      discoveryProfile: profile || undefined,
      likelyVpnActive: input.likelyVpnActive,
    },
  );

  if (!vpnSkipHomeLan && (profile === "lan-fast" || profile === "")) {
    preferCircuitHints = false;
  }

  let skipUpgradeStayOnRelay = false;
  if (input.upgradeRelayToDirect === true) {
    if (vpnSkipHomeLan) {
      skipUpgradeStayOnRelay = true;
    } else {
      preferCircuitHints = false;
      // Only LAN-first with same-/24 or overlay proof — never "any RFC1918".
      sameSubnetLanFirst = hasLanOrOverlayEvidence(input.localListenAddrs, evidenceHints);
    }
  }

  dialHints = filterDialHintsForVpn({
    hints: dialHints,
    likelyVpnActive: input.likelyVpnActive,
    localListenAddrs: input.localListenAddrs,
  });

  return {
    preferCircuitHints,
    sameSubnetLanFirst,
    vpnSkipHomeLan,
    dialHints,
    skipUpgradeStayOnRelay,
  };
}

/** Private-LAN TCP hints safe to persist into peer-directory after identify. */
export function privateLanListenAddrsForPersist(addrs: readonly string[]): string[] {
  return addrs.filter((a) => isPrivateLanTcpDialHint(a) && !a.includes("/p2p-circuit/"));
}

/**
 * Whether warm should identify over a live Online-Relay connection before a
 * Relay→Direct attempt. Needed whenever peer-directory LAN listens were
 * scrubbed empty (tcp/0) — home LAN without VPN used to skip identify and
 * stay stuck on Online-Relay until mDNS randomly refreshed.
 *
 * Callers must only merge identified RFC1918 that passes same-/24 or overlay
 * evidence (see warmContactConnectionTransportViaRuntime) so WAN peers cannot
 * inject foreign home-LAN dial storms.
 */
export function shouldIdentifyBeforeVpnSkip(input: {
  upgradeRelayToDirect?: boolean;
  connected: boolean;
  direct: boolean;
  /** Kept for call-site compatibility; no longer gates identify. */
  likelyVpnActive?: boolean;
}): boolean {
  void input.likelyVpnActive;
  return (
    input.upgradeRelayToDirect === true &&
    input.connected === true &&
    input.direct !== true
  );
}

/**
 * Shared same-subnet LAN-first flag for send/warm prepare paths.
 * Prefer this over re-deriving VPN + /24 checks inline (chat-outbound historically).
 */
export function resolveSameSubnetLanFirstFromEvidence(input: {
  likelyVpnActive: boolean;
  localListenAddrs?: readonly string[];
  peerListenAddrs?: readonly string[];
  dialHints: readonly string[];
  /** When true (circuit preferred), never LAN-first. */
  preferCircuitHints?: boolean;
}): boolean {
  if (input.preferCircuitHints === true) return false;
  return resolveReachabilityDialPolicy({
    transportPeerId: "_",
    likelyVpnActive: input.likelyVpnActive,
    localListenAddrs: input.localListenAddrs,
    peerListenAddrs: input.peerListenAddrs,
    dialHints: [...input.dialHints],
  }).sameSubnetLanFirst;
}
