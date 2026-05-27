import type { DiscoveryProfile } from "./ws-protocol.js";
/** libp2p connection-manager cap for client nodes (relay-server nodes are uncapped). */
export declare const DEFAULT_CLIENT_MAX_CONNECTIONS = 150;
export declare const MIN_CLIENT_MAX_CONNECTIONS = 10;
export declare const MAX_CLIENT_MAX_CONNECTIONS = 500;
export declare const DEFAULT_MDNS_INTERVAL_MS = 10000;
export declare const MIN_MDNS_INTERVAL_MS = 5000;
export declare const MAX_MDNS_INTERVAL_MS = 120000;
export declare const DEFAULT_CAPABILITY_DISCOVERY_INTERVAL_MS = 90000;
export declare const MIN_CAPABILITY_DISCOVERY_INTERVAL_MS = 30000;
export declare const MAX_CAPABILITY_DISCOVERY_INTERVAL_MS = 600000;
export declare const DEFAULT_CAPABILITY_DISCOVERY_JITTER_MS = 20000;
export declare const DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS = 30000;
export declare const DEFAULT_BOOTSTRAP_REPROBE_INTERVAL_MS = 60000;
/** When idle timer stretch is on, multiply background intervals by this factor. */
export declare const IDLE_TIMER_STRETCH_MULTIPLIER = 4;
/** No chat/owner activity within this window counts as idle for timer stretch. */
export declare const IDLE_MESH_ACTIVITY_THRESHOLD_MS: number;
export interface ConnectivityTuning {
    /** Max libp2p connections (client nodes). Omitted from mesh options when unset (uses network default). */
    maxConnections?: number;
    /** mDNS query interval in ms. Default 10_000. */
    mdnsIntervalMs?: number;
    /** Background capability provide/find cycle interval in ms. Default 90_000. */
    capabilityDiscoveryIntervalMs?: number;
    /** When true, skip periodic DHT capability find (Search/Discover triggers on-demand find). Default true for wan-default. */
    lazyCapabilityDiscovery?: boolean;
    /** When true, stretch relay/capability/bootstrap timers while idle. Default true for WAN profiles. */
    idleTimerStretch?: boolean;
}
export declare function discoveryProfileUsesDht(profile: DiscoveryProfile): boolean;
export declare function discoveryProfileDefaultEnableMdns(_profile: DiscoveryProfile): boolean;
export declare function defaultLazyCapabilityDiscovery(_profile: DiscoveryProfile): boolean;
export declare function defaultIdleTimerStretch(_profile: DiscoveryProfile): boolean;
export declare function resolveMaxConnections(tuning?: ConnectivityTuning): number | undefined;
export declare function resolveMdnsIntervalMs(tuning?: ConnectivityTuning): number;
export declare function resolveCapabilityDiscoveryIntervalMs(tuning?: ConnectivityTuning): number;
export declare function resolveLazyCapabilityDiscovery(profile: DiscoveryProfile, tuning?: ConnectivityTuning): boolean;
export declare function resolveIdleTimerStretch(profile: DiscoveryProfile, tuning?: ConnectivityTuning): boolean;
export declare function resolveEnableMdns(profile: DiscoveryProfile, explicit?: boolean): boolean;
/** Apply idle stretch multiplier when enabled and mesh activity is stale. */
export declare function stretchTimerIntervalMs(baseMs: number, opts: {
    idleStretchEnabled: boolean;
    lastMeshActivityMs: number;
    now?: number;
}): number;
export declare function clampConnectivityTuningInput(input: Partial<ConnectivityTuning>): ConnectivityTuning;
//# sourceMappingURL=connectivity-tuning.d.ts.map