/**
 * Office LAN rediscovery helpers.
 *
 * libp2p/@libp2p/mdns emits `peer:discovery` at most once per peer. Later
 * multicast replies update the peer store silently, so Discover + LAN
 * auto-bond must periodically re-probe LAN candidates instead of waiting
 * for another discovery event.
 */

export const LAN_DISCOVERY_SWEEP_INTERVAL_MS = 20_000;

/** Force a full nearby re-probe every N soft ticks (~60s at 20s interval). */
export const LAN_DISCOVERY_SWEEP_FORCE_EVERY_N = 3;

export function shouldRunLanDiscoverySweep(cfg: {
  lanAutoBondEnabled?: boolean;
  discoveryProfile?: string;
} | null | undefined): boolean {
  if (!cfg) return false;
  // Only sweep when LAN auto-bond is explicitly on. lan-fast without
  // auto-bond must not drive extra LAN probes / dial noise on strangers.
  return cfg.lanAutoBondEnabled === true;
}
