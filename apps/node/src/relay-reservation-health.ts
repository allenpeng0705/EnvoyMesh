/**
 * Shared circuit-relay reservation warmup + health for CLI and NodeService.
 *
 * Collects known relay multiaddrs, eager-dials them, requests RESERVE slots,
 * and starts the EnvoyMesh health loop (periodic + reconnect on disconnect).
 */
import type { EnvoyMesh } from "@envoymesh/network";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

export interface RelayReservationWarmupConfig {
  configuredRelays?: readonly { enabled?: boolean; addr?: string }[];
  bootstrapPeers?: readonly string[];
  bootstrapPresets?: readonly string[];
  relayEnabled?: boolean;
  relayReservationEnabled?: boolean;
}

/** Direct relay multiaddrs suitable for eagerConnect + requestRelayReservation. */
export function collectKnownRelayAddrs(config: RelayReservationWarmupConfig): string[] {
  const configured = (config.configuredRelays ?? [])
    .filter((r) => r.enabled !== false && r.addr?.trim())
    .map((r) => r.addr!.trim())
    .filter((a) => !a.includes("/p2p-circuit/"));

  const out = [...configured];
  const bootstrap = config.bootstrapPeers ?? [];
  const presets = config.bootstrapPresets ?? [];
  const wantCommunity =
    presets.includes("cn-relay") ||
    bootstrap.includes(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);

  if (
    wantCommunity &&
    !out.includes(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR)
  ) {
    out.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  }

  // Also pick other non-circuit bootstrap peers that look like relay bases
  // (have /p2p/ and are not already listed). Cap to avoid warming DHT bootstraps.
  for (const a of bootstrap) {
    const t = a.trim();
    if (!t || t.includes("/p2p-circuit/") || out.includes(t)) continue;
    if (!t.includes("/p2p/")) continue;
    // Skip well-known public libp2p DHT bootstraps — they are not circuit relays.
    if (t.includes("bootstrap.libp2p.io")) continue;
    out.push(t);
    if (out.length >= 4) break;
  }

  return [...new Set(out)].slice(0, 4);
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
  options?: { healthIntervalMs?: number },
): Promise<RelayReservationWarmupResult> {
  if (config.relayEnabled === false) {
    return { warmed: false, addrs: [], skipped: true, reason: "relay-disabled" };
  }
  if (config.relayReservationEnabled === false) {
    return { warmed: false, addrs: [], skipped: true, reason: "reservation-disabled" };
  }

  const addrs = collectKnownRelayAddrs(config);
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
  });

  return {
    warmed: true,
    addrs,
    connected: dial.connected,
    reserved,
    failed,
  };
}
