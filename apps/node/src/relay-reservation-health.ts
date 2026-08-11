/**
 * Shared circuit-relay reservation warmup + health for CLI and NodeService.
 *
 * Collects known relay multiaddrs, eager-dials them, requests RESERVE slots,
 * and starts the EnvoyMesh health loop (periodic + reconnect on disconnect).
 */
import type { EnvoyMesh } from "@envoymesh/network";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

export interface RelayControlTargetConfig {
  configuredRelays?: readonly { enabled?: boolean; addr?: string }[];
  bootstrapPeers?: readonly string[];
  bootstrapPresets?: readonly string[];
  /** Extra multiaddrs already known as active EnvoyMesh relays (e.g. CLI activeRelays). */
  activeRelayAddrs?: readonly string[];
  /** Cap after dedupe. Default 4. */
  maxTargets?: number;
}

export interface RelayReservationWarmupConfig extends RelayControlTargetConfig {
  relayEnabled?: boolean;
  relayReservationEnabled?: boolean;
}

const DEFAULT_MAX_RELAY_CONTROL_TARGETS = 4;

/**
 * Unified EnvoyMesh relay control targets for checkin, lookup, and reservation.
 * Excludes public libp2p DHT bootstraps, circuit paths, and private LAN addrs;
 * dedupes; caps length.
 *
 * When `configuredRelays` has at least one usable addr, bootstrapPeers are
 * not used as extra reservation targets (AutoRelay / DHT noise). Community
 * cn-relay is still added when the cn-relay preset / community bootstrap is set.
 */
export function collectRelayControlTargets(config: RelayControlTargetConfig): string[] {
  const maxTargets = config.maxTargets ?? DEFAULT_MAX_RELAY_CONTROL_TARGETS;
  const configured = (config.configuredRelays ?? [])
    .filter((r) => r.enabled !== false && r.addr?.trim())
    .map((r) => r.addr!.trim())
    .filter((a) => !a.includes("/p2p-circuit/"));

  const out: string[] = [];
  const push = (addr: string): void => {
    const t = addr.trim();
    if (!t || t.includes("/p2p-circuit/") || out.includes(t)) return;
    // Require embedded peer ID (/p2p/<peerId>). DNS-only entries without
    // /p2p/ are silently dropped here — the dial path resolves them via
    // /info, but the relay control path needs a peer ID for checkin/lookup.
    // Operators using DNS-only addresses should configure them via the
    // node's mesh dial path, not the relay control target list.
    if (!t.includes("/p2p/")) return;
    if (t.includes("bootstrap.libp2p.io")) return;
    // LAN / loopback cannot be a WAN circuit hop for remote joiners.
    if (isPrivateLanRelayControlAddr(t)) return;
    out.push(t);
  };

  for (const a of configured) push(a);
  const hadConfigured = out.length > 0;

  const bootstrap = config.bootstrapPeers ?? [];
  const presets = config.bootstrapPresets ?? [];
  const wantCommunity =
    presets.includes("cn-relay") ||
    bootstrap.includes(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);

  if (wantCommunity) {
    push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  }

  // Only backfill bootstrap peers when no configured EnvoyMesh relays exist.
  // Otherwise polluted bootstrap lists (self peer, LAN, random DHT) steal
  // reservation attempts and confuse AutoRelay.
  if (!hadConfigured) {
    for (const a of bootstrap) {
      if (out.length >= maxTargets) break;
      push(a);
    }
  }

  for (const a of config.activeRelayAddrs ?? []) {
    if (out.length >= maxTargets) break;
    push(a);
  }

  // Home nodes on CGNAT with empty / polluted bootstrap (LAN-only, circuits,
  // DHT noise) otherwise skip warmup entirely → no reservation → EnvoyGo
  // stays unreachable while the process looks "healthy". Always keep the
  // community relay as a last-resort hop when nothing else survived filters.
  if (out.length === 0) {
    push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  }

  return out.slice(0, maxTargets);
}

/** RFC1918 / link-local / loopback — not usable as WAN reservation hops. */
function isPrivateLanRelayControlAddr(addr: string): boolean {
  return /\/ip4\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(addr);
}

/** @deprecated Prefer collectRelayControlTargets — alias for reserve warmup. */
export function collectKnownRelayAddrs(config: RelayReservationWarmupConfig): string[] {
  return collectRelayControlTargets(config);
}

export interface RelayReservationWarmupResult {
  warmed: boolean;
  addrs: string[];
  connected?: number;
  reserved?: number;
  failed?: number;
  /** True when store ∩ open TCP reported a usable reservation before return. */
  live?: boolean;
  skipped?: boolean;
  reason?: string;
}

/**
 * Poll until a usable relay reservation exists (store ∩ open connection).
 * Used so the first relay.checkin can advertise `/p2p-circuit/` paths.
 */
export async function waitForUsableRelayReservation(
  mesh: Pick<EnvoyMesh, "hasLiveRelayReservation">,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const pollMs = options?.pollMs ?? 500;
  if (typeof mesh.hasLiveRelayReservation !== "function") return false;
  if (mesh.hasLiveRelayReservation()) return true;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    if (mesh.hasLiveRelayReservation()) return true;
  }
  return mesh.hasLiveRelayReservation();
}

/**
 * Eager-dial known relays, request reservations, start health loop.
 * No-op when relay or reservation is disabled / no addrs.
 */
export async function warmAndWatchRelayReservations(
  mesh: EnvoyMesh,
  config: RelayReservationWarmupConfig,
  options?: {
    healthIntervalMs?: number;
    pendingHealthIntervalMs?: number;
    lostHealthIntervalMs?: number;
    /** Wait for usable reservation before return. Default: 15s if reserved>0 else 2s. Set 0 to skip. */
    waitForLiveMs?: number;
  },
): Promise<RelayReservationWarmupResult> {
  if (config.relayEnabled === false) {
    return { warmed: false, addrs: [], skipped: true, reason: "relay-disabled" };
  }
  if (config.relayReservationEnabled === false) {
    return { warmed: false, addrs: [], skipped: true, reason: "reservation-disabled" };
  }

  const addrs = collectRelayControlTargets(config);
  if (addrs.length === 0) {
    return { warmed: false, addrs: [], skipped: true, reason: "no-relay-addrs" };
  }

  const dial = await mesh.eagerConnectToRelays(addrs, { timeoutMs: 30_000 });
  console.log(
    `[p2p] eager relay warmup: attempted=${dial.attempted} connected=${dial.connected} failed=${dial.failed}` +
      (dial.failures.length > 0 ? ` failures=${JSON.stringify(dial.failures)}` : ""),
  );

  let reserved = 0;
  let failed = 0;
  try {
    const resv = await mesh.requestRelayReservation(addrs);
    reserved = resv.reserved;
    failed = resv.failed;
    console.log(
      `[p2p] relay reservation request: attempted=${resv.attempted} reserved=${resv.reserved} failed=${resv.failed} skipped=${resv.skipped}` +
        (resv.failures.length > 0 ? ` failures=${JSON.stringify(resv.failures)}` : "") +
        (resv.skipped > 0 ? ` skipReasons=${JSON.stringify(resv.skipReasons)}` : ""),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[p2p] relay reservation request threw (non-fatal): ${message}`);
    failed = addrs.length;
  }

  mesh.startRelayReservationHealthLoop(addrs, {
    intervalMs: options?.healthIntervalMs ?? 5 * 60_000,
    pendingIntervalMs: options?.pendingHealthIntervalMs ?? 45_000,
    lostIntervalMs: options?.lostHealthIntervalMs ?? 15_000,
  });

  const waitForLiveMs =
    options?.waitForLiveMs ??
    // Store updates can lag the RESERVE RPC slightly; don't burn 45s when
    // the hop never reserved (health loop will keep trying).
    (reserved > 0 ? 15_000 : 2_000);
  let live = false;
  if (waitForLiveMs > 0) {
    live = await waitForUsableRelayReservation(mesh, { timeoutMs: waitForLiveMs });
    if (live) {
      console.log("[p2p] relay reservation live — safe to advertise /p2p-circuit/ in checkin");
    } else {
      console.warn(
        "[p2p] relay reservation not live yet after warmup — checkin may omit circuit addrs until health loop recovers",
      );
    }
  } else if (typeof mesh.hasLiveRelayReservation === "function") {
    live = mesh.hasLiveRelayReservation();
  }

  return {
    warmed: true,
    addrs,
    connected: dial.connected,
    reserved,
    failed,
    live,
  };
}
