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
 *   1. NAT type "symmetric" — two STUN servers saw different mapped addresses
 *      (only with UPnP-private corroboration, and not when a VPN is active).
 *   2. STUN-observed IP in the RFC 6598 CGNAT range (100.64.0.0/10), unless a
 *      local NIC is also in that range (Tailscale/headscale overlay).
 *   3. UPnP external IP is RFC1918 private (gateway behind another NAT).
 *
 * Ambiguous results (STUN timeout, no UPnP) do NOT trigger auto-apply — they
 * fall through to the churn-based Settings suggestion in connectivity diagnostics.
 *
 * See docs/connectivity-internals-and-design.md Open Question #1.
 */

import * as os from "node:os";
import { resolveConnectivityPreset } from "@envoymesh/api";
import { createNodeConfigStore } from "./node-config-store.js";
import { upnpDiscoverAndMap } from "./upnp.js";
import {
  classifyCgnat,
  detectNatType,
  isCgnatRangeIp,
  isRfc1918PrivateIp,
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
  /** Local NICs looked like an overlay VPN (Tailscale/utun/…). */
  likelyVpnActive?: boolean;
}

/** Collect non-internal IPv4 addresses from `os.networkInterfaces()`. */
export function listLocalIpv4Addresses(
  ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.internal) continue;
      // Node 18+ may use numeric family (4); older used "IPv4".
      const family = a.family as string | number;
      if (family !== "IPv4" && family !== 4) continue;
      if (a.address) out.push(a.address);
    }
  }
  return out;
}

/**
 * Heuristic: overlay / commercial VPN is active.
 * - Any local IPv4 in RFC 6598 100.64/10 (Tailscale/headscale)
 * - Interface name is Tailscale / WireGuard / `wg*`
 * - Tunnel iface (`utun`/`tun`/`tap`/`ppp`/`ipsec`) with an RFC1918 or RFC6598
 *   client address — not bare name match (macOS always has idle `utun` devices)
 */
export function detectLikelyVpnActive(
  ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): boolean {
  for (const [name, addrs] of Object.entries(ifaces)) {
    const n = name.toLowerCase();
    const nameLooksOverlay =
      n.includes("tailscale") || n.includes("wireguard") || /^wg\d*$/.test(n);
    const nameLooksTunnel = /^(utun|tun|tap|ppp|ipsec)/.test(n);
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.internal) continue;
      const family = a.family as string | number;
      if (family !== "IPv4" && family !== 4) continue;
      if (isCgnatRangeIp(a.address)) return true;
      if (nameLooksOverlay) return true;
      if (
        nameLooksTunnel &&
        (isRfc1918PrivateIp(a.address) || isCgnatRangeIp(a.address))
      ) {
        return true;
      }
    }
  }
  return false;
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
  /** Test seam — override discovered local IPv4s. */
  localInterfaceIps?: string[];
  /** Test seam — override VPN heuristic. */
  likelyVpnActive?: boolean;
}): Promise<CgnatDetectionResult> {
  const stunServers = options?.stunServers ?? DEFAULT_STUN_SERVERS;
  const stunTimeoutMs = options?.stunTimeoutMs ?? 3000;
  const localInterfaceIps = options?.localInterfaceIps ?? listLocalIpv4Addresses();
  const likelyVpnActive = options?.likelyVpnActive ?? detectLikelyVpnActive();

  const [natType, stunRace, upnpIp] = await Promise.all([
    detectNatType(stunServers, { timeoutMs: stunTimeoutMs }).catch((): NatType => "unknown"),
    raceStunServers(stunServers, stunTimeoutMs).catch(() => null),
    options?.upnpEnabled
      ? probeUpnpExternalIp(options.upnpProbePort ?? 4001).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const stunObservedIp = stunRace?.ip;
  const classification = classifyCgnat({
    natType,
    stunObservedIp,
    upnpExternalIp: upnpIp,
    localInterfaceIps,
    likelyVpnActive,
  });

  const allowAutoApply =
    options?.explicitMode === true
      ? false
      : shouldAllowCgnatQuietWanAutoApply({
          connectivityMode: options?.connectivityMode,
          connectivityModeExplicit: options?.connectivityModeExplicit,
        });

  const shouldAutoApplyQuietWan = classification === "cgnat" && allowAutoApply;

  return {
    classification,
    natType,
    stunObservedIp,
    upnpExternalIp: upnpIp,
    shouldAutoApplyQuietWan,
    likelyVpnActive,
  };
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
 * Undo a CGNAT false-positive `quietWan` when an overlay VPN is present.
 * Restores `optimized` so Tailscale / commercial-VPN Online-direct works again.
 * Never overrides an operator-explicit mode choice.
 */
export async function maybeRevertCgnatQuietWanForVpn(
  profileDir: string,
  options?: { likelyVpnActive?: boolean },
): Promise<boolean> {
  const vpn = options?.likelyVpnActive ?? detectLikelyVpnActive();
  if (!vpn) return false;
  const store = createNodeConfigStore(profileDir);
  const existing = await store.load();
  if (!existing) return false;
  if (existing.connectivityModeExplicit === true) return false;
  if (existing.connectivityMode !== "quietWan") return false;
  if (existing.connectivityModeAutoAppliedReason !== "cgnat") return false;

  const preset = resolveConnectivityPreset("optimized");
  await store.save({
    ...existing,
    connectivityMode: "optimized",
    connectivityModeExplicit: false,
    connectivityModeAutoAppliedReason: undefined,
    maxConnections: preset.maxConnections,
    mdnsIntervalMs: preset.mdnsIntervalMs,
    capabilityDiscoveryIntervalMs: preset.capabilityDiscoveryIntervalMs,
    lazyCapabilityDiscovery: preset.lazyCapabilityDiscovery,
    idleTimerStretch: preset.idleTimerStretch,
  });
  return true;
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
