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
 * Excludes public libp2p DHT bootstraps and circuit paths; dedupes; caps length.
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
    out.push(t);
  };

  for (const a of configured) push(a);

  const bootstrap = config.bootstrapPeers ?? [];
  const presets = config.bootstrapPresets ?? [];
  const wantCommunity =
    presets.includes("cn-relay") ||
    bootstrap.includes(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);

  if (wantCommunity) {
    push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  }

  for (const a of bootstrap) {
    if (out.length >= maxTargets) break;
    push(a);
  }

  for (const a of config.activeRelayAddrs ?? []) {
    if (out.length >= maxTargets) break;
    push(a);
  }

  return out.slice(0, maxTargets);
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
  skipped?: boolean;
  reason?: string;
}

/**
 * Eager-dial known relays, request reservations, start health loop.
 * No-op when relay or reservation is disabled / no addrs.
 */
export async function warmAndWatchRelayReservations(
  mesh: EnvoyMesh,
  config: RelayReservationWarmupConfig,
  options?: { healthIntervalMs?: number; pendingHealthIntervalMs?: number; lostHealthIntervalMs?: number },
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

  return {
    warmed: true,
    addrs,
    connected: dial.connected,
    reserved,
    failed,
  };
}
