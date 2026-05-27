/** libp2p connection-manager cap for client nodes (relay-server nodes are uncapped). */
export const DEFAULT_CLIENT_MAX_CONNECTIONS = 150;
export const MIN_CLIENT_MAX_CONNECTIONS = 10;
export const MAX_CLIENT_MAX_CONNECTIONS = 500;
export const DEFAULT_MDNS_INTERVAL_MS = 10_000;
export const MIN_MDNS_INTERVAL_MS = 5_000;
export const MAX_MDNS_INTERVAL_MS = 120_000;
export const DEFAULT_CAPABILITY_DISCOVERY_INTERVAL_MS = 90_000;
export const MIN_CAPABILITY_DISCOVERY_INTERVAL_MS = 30_000;
export const MAX_CAPABILITY_DISCOVERY_INTERVAL_MS = 600_000;
export const DEFAULT_CAPABILITY_DISCOVERY_JITTER_MS = 20_000;
export const DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS = 30_000;
export const DEFAULT_BOOTSTRAP_REPROBE_INTERVAL_MS = 60_000;
/** When idle timer stretch is on, multiply background intervals by this factor. */
export const IDLE_TIMER_STRETCH_MULTIPLIER = 4;
/** No chat/owner activity within this window counts as idle for timer stretch. */
export const IDLE_MESH_ACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;
export function discoveryProfileUsesDht(profile) {
    return profile === "wan-default";
}
export function discoveryProfileDefaultEnableMdns(_profile) {
    return true;
}
export function defaultLazyCapabilityDiscovery(_profile) {
    return false;
}
export function defaultIdleTimerStretch(_profile) {
    return false;
}
export function resolveMaxConnections(tuning) {
    const raw = tuning?.maxConnections;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.min(MAX_CLIENT_MAX_CONNECTIONS, Math.max(MIN_CLIENT_MAX_CONNECTIONS, Math.round(raw)));
    }
    return undefined;
}
export function resolveMdnsIntervalMs(tuning) {
    const raw = tuning?.mdnsIntervalMs;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.min(MAX_MDNS_INTERVAL_MS, Math.max(MIN_MDNS_INTERVAL_MS, Math.round(raw)));
    }
    return DEFAULT_MDNS_INTERVAL_MS;
}
export function resolveCapabilityDiscoveryIntervalMs(tuning) {
    const raw = tuning?.capabilityDiscoveryIntervalMs;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.min(MAX_CAPABILITY_DISCOVERY_INTERVAL_MS, Math.max(MIN_CAPABILITY_DISCOVERY_INTERVAL_MS, Math.round(raw)));
    }
    return DEFAULT_CAPABILITY_DISCOVERY_INTERVAL_MS;
}
export function resolveLazyCapabilityDiscovery(profile, tuning) {
    if (typeof tuning?.lazyCapabilityDiscovery === "boolean") {
        return tuning.lazyCapabilityDiscovery;
    }
    return defaultLazyCapabilityDiscovery(profile);
}
export function resolveIdleTimerStretch(profile, tuning) {
    if (typeof tuning?.idleTimerStretch === "boolean") {
        return tuning.idleTimerStretch;
    }
    return defaultIdleTimerStretch(profile);
}
export function resolveEnableMdns(profile, explicit) {
    if (typeof explicit === "boolean") {
        return explicit;
    }
    return discoveryProfileDefaultEnableMdns(profile);
}
/** Apply idle stretch multiplier when enabled and mesh activity is stale. */
export function stretchTimerIntervalMs(baseMs, opts) {
    if (!opts.idleStretchEnabled) {
        return baseMs;
    }
    const now = opts.now ?? Date.now();
    if (now - opts.lastMeshActivityMs < IDLE_MESH_ACTIVITY_THRESHOLD_MS) {
        return baseMs;
    }
    return baseMs * IDLE_TIMER_STRETCH_MULTIPLIER;
}
export function clampConnectivityTuningInput(input) {
    const out = {};
    if (input.maxConnections !== undefined) {
        out.maxConnections = resolveMaxConnections({ maxConnections: input.maxConnections });
    }
    if (input.mdnsIntervalMs !== undefined) {
        out.mdnsIntervalMs = resolveMdnsIntervalMs({ mdnsIntervalMs: input.mdnsIntervalMs });
    }
    if (input.capabilityDiscoveryIntervalMs !== undefined) {
        out.capabilityDiscoveryIntervalMs = resolveCapabilityDiscoveryIntervalMs({
            capabilityDiscoveryIntervalMs: input.capabilityDiscoveryIntervalMs,
        });
    }
    if (typeof input.lazyCapabilityDiscovery === "boolean") {
        out.lazyCapabilityDiscovery = input.lazyCapabilityDiscovery;
    }
    if (typeof input.idleTimerStretch === "boolean") {
        out.idleTimerStretch = input.idleTimerStretch;
    }
    return out;
}
//# sourceMappingURL=connectivity-tuning.js.map