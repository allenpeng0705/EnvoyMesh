import {
  DEFAULT_BOOTSTRAP_REPROBE_INTERVAL_MS,
  DEFAULT_CAPABILITY_DISCOVERY_JITTER_MS,
  DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS,
  discoveryProfileUsesDht,
  resolveCapabilityDiscoveryIntervalMs,
  resolveEnableMdns,
  resolveIdleTimerStretch,
  resolveLazyCapabilityDiscovery,
  resolveMaxConnections,
  resolveMdnsIntervalMs,
  stretchTimerIntervalMs,
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
  enableMdns: boolean;
  enableDht: boolean;
  maxConnections: number;
  mdnsIntervalMs: number;
  capabilityDiscoveryIntervalMs: number;
  capabilityDiscoveryJitterMs: number;
  lazyCapabilityDiscovery: boolean;
  idleTimerStretch: boolean;
  relayCycleIntervalMs: (baseMs?: number) => number;
  bootstrapReprobeIntervalMs: (baseMs?: number) => number;
  capabilityDiscoveryIntervalMsEffective: () => number;
}

export function resolveConnectivityRuntime(input: {
  profile: DiscoveryProfile;
  enableMdns?: boolean;
  tuning?: ConnectivityTuning;
}): ResolvedConnectivityRuntime {
  const { profile, tuning } = input;
  const idleTimerStretch = resolveIdleTimerStretch(profile, tuning);
  const stretch = (baseMs: number) =>
    stretchTimerIntervalMs(baseMs, {
      idleStretchEnabled: idleTimerStretch,
      lastMeshActivityMs,
    });

  const capabilityBase = resolveCapabilityDiscoveryIntervalMs(tuning);
  const relayBase = DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS;
  const reprobeBase = DEFAULT_BOOTSTRAP_REPROBE_INTERVAL_MS;

  return {
    profile,
    enableMdns: resolveEnableMdns(profile, input.enableMdns),
    enableDht: discoveryProfileUsesDht(profile),
    maxConnections: resolveMaxConnections(tuning),
    mdnsIntervalMs: resolveMdnsIntervalMs(tuning),
    capabilityDiscoveryIntervalMs: capabilityBase,
    capabilityDiscoveryJitterMs: DEFAULT_CAPABILITY_DISCOVERY_JITTER_MS,
    lazyCapabilityDiscovery: resolveLazyCapabilityDiscovery(profile, tuning),
    idleTimerStretch,
    relayCycleIntervalMs: (baseMs = relayBase) => stretch(baseMs),
    bootstrapReprobeIntervalMs: (baseMs = reprobeBase) => stretch(baseMs),
    capabilityDiscoveryIntervalMsEffective: () => stretch(capabilityBase),
  };
}

export function shouldRunPeriodicCapabilityFind(runtime: ResolvedConnectivityRuntime): boolean {
  return runtime.enableDht && !runtime.lazyCapabilityDiscovery;
}
