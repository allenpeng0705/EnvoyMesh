/**
 * Startup CGNAT detection — auto-applies the `quietWan` connectivity mode when
 * the node is *definitively* behind carrier-grade NAT.
 *
 * Why auto-apply is safe here (and wasn't before): the detection uses three
 * independent *definitive* signals. Any one of them means the public DHT
 * cannot work (the node has no inbound reachability), so the DHT swarm churn
 * is pure waste. There is no false-positive risk because we only act on
 * deterministic measurements, never on a guess:
 *
 *   1. NAT type "symmetric" — two STUN servers saw different mapped addresses.
 *   2. STUN-observed IP in the RFC 6598 CGNAT range (100.64.0.0/10).
 *   3. UPnP external IP is RFC1918 private (gateway is behind another NAT).
 *
 * Ambiguous results (STUN timeout, no UPnP) do NOT trigger auto-apply — they
 * fall through to the churn-based Settings suggestion in connectivity diagnostics.
 *
 * See docs/connectivity-internals-and-design.md Open Question #1.
 */

import { upnpDiscoverAndMap } from "./upnp.js";
import {
  classifyCgnat,
  detectNatType,
  raceStunServers,
  DEFAULT_STUN_SERVERS,
  type NatType,
} from "./stun.js";

export interface CgnatDetectionResult {
  /** "cgnat" (definitive) | "not-cgnat" (definitive negative) | "unknown" */
  classification: "cgnat" | "not-cgnat" | "unknown";
  natType: NatType;
  stunObservedIp?: string;
  upnpExternalIp?: string;
  /** True when the caller should override connectivityMode → quietWan. */
  shouldAutoApplyQuietWan: boolean;
}

/**
 * Run the CGNAT detection pass. Takes ~3-6s (two STUN queries + a UPnP probe
 * in parallel). Designed to run once at startup, before mesh creation, so the
 * connectivity mode is correct from the first cycle.
 *
 * Only auto-applies when the user has NOT explicitly chosen a mode
 * (`explicitMode` is unset/default). If the operator picked a mode, respect it
 * regardless of CGNAT detection — they may know something we don't (e.g.
 * they configured a relay and want DHT off anyway).
 */
export async function detectCgnatAtStartup(options?: {
  stunServers?: typeof DEFAULT_STUN_SERVERS;
  stunTimeoutMs?: number;
  upnpEnabled?: boolean;
  upnpProbePort?: number;
  /** When true, the operator explicitly set the mode — don't auto-override. */
  explicitMode?: boolean;
}): Promise<CgnatDetectionResult> {
  const stunServers = options?.stunServers ?? DEFAULT_STUN_SERVERS;
  const stunTimeoutMs = options?.stunTimeoutMs ?? 3000;

  // Run NAT-type classification (two-server STUN) and UPnP probe in parallel.
  // The STUN race also gives us an observed IP to check against the CGNAT range.
  const [natType, stunRace, upnpIp] = await Promise.all([
    detectNatType(stunServers, { timeoutMs: stunTimeoutMs }).catch((): NatType => "unknown"),
    raceStunServers(stunServers, stunTimeoutMs).catch(() => null),
    options?.upnpEnabled
      ? probeUpnpExternalIp(options.upnpProbePort ?? 4001).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const stunObservedIp = stunRace?.ip;
  const classification = classifyCgnat({ natType, stunObservedIp, upnpExternalIp: upnpIp });

  // Auto-apply ONLY on a definitive CGNAT classification AND when the operator
  // hasn't explicitly chosen a mode.
  const shouldAutoApplyQuietWan =
    classification === "cgnat" && !options?.explicitMode;

  return { classification, natType, stunObservedIp, upnpExternalIp: upnpIp, shouldAutoApplyQuietWan };
}

/**
 * Probe UPnP for the external IP. Returns undefined when UPnP is unavailable
 * or returns a public IP (not CGNAT-indicative). Returns the IP string when
 * UPnP reports an RFC1918 private external IP (the CGNAT signal).
 *
 * We don't need the port mapping here — only the external IP classification.
 * Reuses upnpDiscoverAndMap with a dummy internal port to get the external IP.
 */
async function probeUpnpExternalIp(_probePort: number): Promise<string | undefined> {
  // upnpDiscoverAndMap returns { ip, port } on success; we only need the IP.
  // Pass a throwaway internal port — we don't actually want a mapping here,
  // just the external IP observation. If it fails, return undefined.
  const result = await upnpDiscoverAndMap(_probePort, _probePort, 3000);
  return result?.ip;
}
