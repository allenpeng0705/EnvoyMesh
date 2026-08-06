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

import { resolveConnectivityPreset } from "@envoymesh/api";
import { createNodeConfigStore } from "./node-config-store.js";
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
 * Whether CGNAT startup may override the connectivity mode to `quietWan`.
 *
 * Auto-apply is allowed only when:
 * - the operator has NOT marked the mode as explicit (Settings choice), AND
 * - the current mode is unset or the default `optimized` (not smart/normal/etc.).
 *
 * Already-DHT-off modes (`quietWan` / `aggressive`) are never auto-overridden.
 */
export function shouldAllowCgnatQuietWanAutoApply(config: {
  connectivityMode?: string;
  connectivityModeExplicit?: boolean;
}): boolean {
  if (config.connectivityModeExplicit === true) return false;
  const mode = config.connectivityMode;
  if (mode === "quietWan" || mode === "aggressive") return false;
  // Only override the factory default. Operator-chosen normal/smart without the
  // explicit flag (legacy configs) are left alone.
  return mode == null || mode === "optimized";
}

/**
 * Run the CGNAT detection pass. Takes ~3-6s (two STUN queries + a UPnP probe
 * in parallel). Designed to run once at startup, before mesh creation, so the
 * connectivity mode is correct from the first cycle.
 *
 * Only auto-applies when {@link shouldAllowCgnatQuietWanAutoApply} is true.
 */
export async function detectCgnatAtStartup(options?: {
  stunServers?: typeof DEFAULT_STUN_SERVERS;
  stunTimeoutMs?: number;
  upnpEnabled?: boolean;
  upnpProbePort?: number;
  /** @deprecated Prefer {@link shouldAllowCgnatQuietWanAutoApply} via config fields. */
  explicitMode?: boolean;
  connectivityMode?: string;
  connectivityModeExplicit?: boolean;
}): Promise<CgnatDetectionResult> {
  const stunServers = options?.stunServers ?? DEFAULT_STUN_SERVERS;
  const stunTimeoutMs = options?.stunTimeoutMs ?? 3000;

  const [natType, stunRace, upnpIp] = await Promise.all([
    detectNatType(stunServers, { timeoutMs: stunTimeoutMs }).catch((): NatType => "unknown"),
    raceStunServers(stunServers, stunTimeoutMs).catch(() => null),
    options?.upnpEnabled
      ? probeUpnpExternalIp(options.upnpProbePort ?? 4001).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const stunObservedIp = stunRace?.ip;
  const classification = classifyCgnat({ natType, stunObservedIp, upnpExternalIp: upnpIp });

  const allowAutoApply =
    options?.explicitMode === true
      ? false
      : shouldAllowCgnatQuietWanAutoApply({
          connectivityMode: options?.connectivityMode,
          connectivityModeExplicit: options?.connectivityModeExplicit,
        });

  const shouldAutoApplyQuietWan = classification === "cgnat" && allowAutoApply;

  return { classification, natType, stunObservedIp, upnpExternalIp: upnpIp, shouldAutoApplyQuietWan };
}

/**
 * Persist CGNAT auto-applied `quietWan` so Settings shows the effective mode
 * and the next restart skips re-detection for already-quiet nodes.
 * Does not set `connectivityModeExplicit` — the operator can still change it.
 */
export async function persistCgnatAutoAppliedQuietWan(profileDir: string): Promise<void> {
  const store = createNodeConfigStore(profileDir);
  const existing = await store.load();
  if (!existing) return;
  if (existing.connectivityModeExplicit === true) return;
  if (existing.connectivityMode === "quietWan") {
    if (existing.connectivityModeAutoAppliedReason === "cgnat") return;
    await store.save({
      ...existing,
      connectivityModeAutoAppliedReason: "cgnat",
      connectivityModeExplicit: false,
    });
    return;
  }
  const preset = resolveConnectivityPreset("quietWan");
  await store.save({
    ...existing,
    connectivityMode: "quietWan",
    connectivityModeExplicit: false,
    connectivityModeAutoAppliedReason: "cgnat",
    maxConnections: preset.maxConnections,
    mdnsIntervalMs: preset.mdnsIntervalMs,
    capabilityDiscoveryIntervalMs: preset.capabilityDiscoveryIntervalMs,
    lazyCapabilityDiscovery: preset.lazyCapabilityDiscovery,
    idleTimerStretch: preset.idleTimerStretch,
  });
}

/**
 * Probe UPnP for the external IP. Returns undefined when UPnP is unavailable
 * or fails. Returns the IP string when discovery succeeds (classifier decides
 * whether it is a CGNAT signal).
 */
async function probeUpnpExternalIp(probePort: number): Promise<string | undefined> {
  const result = await upnpDiscoverAndMap(probePort, probePort, 3000);
  return result?.ip;
}
