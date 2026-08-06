import {
  DEFAULT_BOOTSTRAP_REPROBE_INTERVAL_MS,
  DEFAULT_CAPABILITY_DISCOVERY_JITTER_MS,
  discoveryProfileUsesDht,
  resolveBondWarmEventDriven,
  resolveBondWarmIntervalMs,
  resolveBondWarmPerContactCooldownMs,
  resolveCapabilityDiscoveryIntervalMs,
  resolveConnectionMonitorPingIntervalMs,
  resolveConnectivityMode,
  resolveConnectivityPreset,
  resolveConnectivityTuning,
  resolveEnableMdns,
  resolveForceDisableDht,
  resolveIdleTimerStretch,
  resolveLazyCapabilityDiscovery,
  resolveMaxConnections,
  resolveMdnsIntervalMs,
  resolveRelayCycleBaseMs,
  stretchTimerIntervalMs,
  type ConnectivityMode,
  type ConnectivityTuning,
} from "@envoymesh/api";
import type { DiscoveryProfile } from "@envoymesh/api";

/** Tracks chat + owner UI activity for idle timer stretch. */
let lastMeshActivityMs = Date.now();

export function recordMeshActivity(now: number = Date.now()): void {
  lastMeshActivityMs = now;
}

export function getLastMeshActivityMs(): number {
  return lastMeshActivityMs;
}

export function resetMeshActivityForTests(): void {
  lastMeshActivityMs = Date.now();
}

export interface ResolvedConnectivityRuntime {
  profile: DiscoveryProfile;
  connectivityMode: ConnectivityMode;
  enableMdns: boolean;
  enableDht: boolean;
  maxConnections?: number;
  mdnsIntervalMs: number;
  capabilityDiscoveryIntervalMs: number;
  capabilityDiscoveryJitterMs: number;
  lazyCapabilityDiscovery: boolean;
  idleTimerStretch: boolean;
  connectionMonitorPingIntervalMs: number;
  bondWarmIntervalMs: number;
  bondWarmPerContactCooldownMs: number;
  bondWarmEventDriven: boolean;
  relayCycleBaseMs: number;
  relayIdleStretchMaxMultiplier: number;
  relayCycleIntervalMs: (baseMs?: number) => number;
  bootstrapReprobeIntervalMs: (baseMs?: number) => number;
  capabilityDiscoveryIntervalMsEffective: () => number;
}

export function resolveConnectivityRuntime(input: {
  profile: DiscoveryProfile;
  enableMdns?: boolean;
  tuning?: ConnectivityTuning;
}): ResolvedConnectivityRuntime {
  const { profile } = input;
  const tuning = resolveConnectivityTuning(input.tuning);
  const preset = resolveConnectivityPreset(tuning.connectivityMode);
  const idleTimerStretch = resolveIdleTimerStretch(profile, tuning);
  const stretch = (baseMs: number) =>
    stretchTimerIntervalMs(baseMs, {
      idleStretchEnabled: idleTimerStretch,
      lastMeshActivityMs,
    });

  const capabilityBase = resolveCapabilityDiscoveryIntervalMs(tuning);
  const relayBase = resolveRelayCycleBaseMs(tuning);
  const reprobeBase = DEFAULT_BOOTSTRAP_REPROBE_INTERVAL_MS;
  const forceDisableDht = resolveForceDisableDht(tuning);
  const enableDht = !forceDisableDht && discoveryProfileUsesDht(profile);

  return {
    profile,
    connectivityMode: resolveConnectivityMode(tuning.connectivityMode),
    enableMdns: resolveEnableMdns(profile, input.enableMdns, tuning),
    enableDht,
    maxConnections: resolveMaxConnections(tuning),
    mdnsIntervalMs: resolveMdnsIntervalMs(tuning),
    capabilityDiscoveryIntervalMs: capabilityBase,
    capabilityDiscoveryJitterMs: DEFAULT_CAPABILITY_DISCOVERY_JITTER_MS,
    lazyCapabilityDiscovery: resolveLazyCapabilityDiscovery(profile, tuning),
    idleTimerStretch,
    connectionMonitorPingIntervalMs: resolveConnectionMonitorPingIntervalMs(tuning),
    bondWarmIntervalMs: resolveBondWarmIntervalMs(tuning),
    bondWarmPerContactCooldownMs: resolveBondWarmPerContactCooldownMs(tuning),
    bondWarmEventDriven: resolveBondWarmEventDriven(tuning),
    relayCycleBaseMs: relayBase,
    relayIdleStretchMaxMultiplier: preset.relayIdleStretchMaxMultiplier,
    // Cap relay checkin idle-stretch so checkin coverage gaps stay within the 300s TTL.
    relayCycleIntervalMs: (baseMs = relayBase) =>
      Math.min(stretch(baseMs), baseMs * preset.relayIdleStretchMaxMultiplier),
    bootstrapReprobeIntervalMs: (baseMs = reprobeBase) => stretch(baseMs),
    capabilityDiscoveryIntervalMsEffective: () => stretch(capabilityBase),
  };
}

/**
 * Whether the periodic capability-discovery cycle should also run a DHT
 * `findProviders` (the discovery side) automatically.
 *
 * Always returns **false**: discovery is *triggered only*, never free-running.
 * A find runs when a human or an AI agent (acting on a human's behalf)
 * explicitly searches — a manual Discover search, an agent calling
 * `searchPeers` for a task, a bond flow resolving a sponsor. There is no
 * background "every N minutes" discovery loop.
 *
 * This codifies the principle from
 * `docs/connectivity-internals-and-design.md` Solution B2. The `runtime`
 * argument is retained for signature stability and for the (now-dead)
 * `lazyCapabilityDiscovery` field, which previously gated this on the
 * `normal` preset only. Keeping the parameter avoids touching every call site
 * in this pass; a later cleanup can remove it.
 */
export function shouldRunPeriodicCapabilityFind(_runtime: ResolvedConnectivityRuntime): boolean {
  return false;
}
