import type { DiscoveryProfile } from "./ws-protocol.js";

/**
 * libp2p connection-manager cap for client nodes (relay-server nodes are uncapped).
 *
 * Lowered from 150 → 48 (2026-08-05): the public DHT swarm was filling 80–150
 * slots and starving circuit-relay CONNECT (WAN auto-bond timeouts). This is the
 * value that `resolveConnectivityTuning` / NodeService actually pass into
 * EnvoyMesh — keep it in sync with `packages/network` connection-stats.
 */
export const DEFAULT_CLIENT_MAX_CONNECTIONS = 48;
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

export const DEFAULT_CONNECTION_MONITOR_PING_INTERVAL_MS = 45_000;
export const DEFAULT_BOND_WARM_INTERVAL_MS = 300_000;
export const DEFAULT_BOND_WARM_PER_CONTACT_COOLDOWN_MS = 300_000;

/** When idle timer stretch is on, multiply background intervals by this factor. */
export const IDLE_TIMER_STRETCH_MULTIPLIER = 4;
/** No chat/owner activity within this window counts as idle for timer stretch. */
export const IDLE_MESH_ACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Resource / connectivity duty-cycle mode.
 * - normal: today's historical defaults (most chatty)
 * - optimized: Phase 1 balanced savings (default)
 * - smart: Phase 2 idle/event-driven
 * - aggressive: Phase 3 minimum background mesh
 * - quietWan: relay-roster discovery with the public DHT disabled (CGNAT /
 *   constrained-network mode). Keeps WAN relay + mDNS so cross-NAT peers and
 *   LAN discovery still work; drops the public-libp2p DHT swarm entirely,
 *   which is pure churn for a node whose routing table never fills. See
 *   `docs/connectivity-internals-and-design.md` Part II (Solution A1).
 */
export type ConnectivityMode = "normal" | "optimized" | "smart" | "aggressive" | "quietWan";

export const CONNECTIVITY_MODES: readonly ConnectivityMode[] = [
  "normal",
  "optimized",
  "smart",
  "aggressive",
  "quietWan",
] as const;

/** Default for new nodes and unset config. */
export const DEFAULT_CONNECTIVITY_MODE: ConnectivityMode = "optimized";

export interface ConnectivityTuning {
  /** Resource mode preset. When set, drives defaults for the fields below. */
  connectivityMode?: ConnectivityMode;
  /** Max libp2p connections (client nodes). Omitted from mesh options when unset (uses network default). */
  maxConnections?: number;
  /** mDNS query interval in ms. Default 10_000. */
  mdnsIntervalMs?: number;
  /** Background capability provide/find cycle interval in ms. Default 90_000. */
  capabilityDiscoveryIntervalMs?: number;
  /** When true, skip periodic DHT capability find (Search/Discover triggers on-demand find). */
  lazyCapabilityDiscovery?: boolean;
  /** When true, stretch relay/capability/bootstrap timers while idle. */
  idleTimerStretch?: boolean;
  /** libp2p connectionMonitor ping interval. */
  connectionMonitorPingIntervalMs?: number;
  /** Background bonded-contact warm cycle interval. */
  bondWarmIntervalMs?: number;
  /** Per-contact cooldown inside bond warm. */
  bondWarmPerContactCooldownMs?: number;
  /**
   * When true, skip warm for contacts that are already connected and recently
   * path-verified (rely on chat-open / send-path warm).
   */
  bondWarmEventDriven?: boolean;
  /** Base relay client cycle interval (checkin/lookup scheduling). */
  relayCycleBaseMs?: number;
  /** When true, force DHT off regardless of discovery profile. */
  forceDisableDht?: boolean;
  /**
   * mDNS policy from the preset:
   * - on: follow enableMdns / profile default
   * - lan-only: enable only for lan-fast
   * - off: disable mDNS
   */
  mdnsPolicy?: "on" | "lan-only" | "off";
}

/** Fully resolved preset values (no optionals). */
export interface ConnectivityPreset {
  mode: ConnectivityMode;
  maxConnections: number;
  mdnsIntervalMs: number;
  mdnsPolicy: "on" | "lan-only" | "off";
  capabilityDiscoveryIntervalMs: number;
  lazyCapabilityDiscovery: boolean;
  idleTimerStretch: boolean;
  connectionMonitorPingIntervalMs: number;
  bondWarmIntervalMs: number;
  bondWarmPerContactCooldownMs: number;
  bondWarmEventDriven: boolean;
  relayCycleBaseMs: number;
  forceDisableDht: boolean;
  /** Cap on idle stretch for relay cycles (TTL safety). */
  relayIdleStretchMaxMultiplier: number;
}

const PRESETS: Record<ConnectivityMode, Omit<ConnectivityPreset, "mode">> = {
  normal: {
    maxConnections: DEFAULT_CLIENT_MAX_CONNECTIONS,
    mdnsIntervalMs: DEFAULT_MDNS_INTERVAL_MS,
    mdnsPolicy: "on",
    capabilityDiscoveryIntervalMs: DEFAULT_CAPABILITY_DISCOVERY_INTERVAL_MS,
    lazyCapabilityDiscovery: false,
    idleTimerStretch: false,
    connectionMonitorPingIntervalMs: DEFAULT_CONNECTION_MONITOR_PING_INTERVAL_MS,
    bondWarmIntervalMs: DEFAULT_BOND_WARM_INTERVAL_MS,
    bondWarmPerContactCooldownMs: DEFAULT_BOND_WARM_PER_CONTACT_COOLDOWN_MS,
    bondWarmEventDriven: false,
    relayCycleBaseMs: DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS,
    forceDisableDht: false,
    relayIdleStretchMaxMultiplier: 2,
  },
  optimized: {
    // Same connection ceiling as normal — savings come from quieter timers /
    // lazy discovery, not from a higher swarm budget (higher budgets were
    // starving circuit CONNECT on WAN).
    maxConnections: DEFAULT_CLIENT_MAX_CONNECTIONS,
    mdnsIntervalMs: 45_000,
    mdnsPolicy: "on",
    capabilityDiscoveryIntervalMs: 120_000,
    lazyCapabilityDiscovery: true,
    idleTimerStretch: true,
    connectionMonitorPingIntervalMs: 90_000,
    bondWarmIntervalMs: DEFAULT_BOND_WARM_INTERVAL_MS,
    bondWarmPerContactCooldownMs: DEFAULT_BOND_WARM_PER_CONTACT_COOLDOWN_MS,
    bondWarmEventDriven: false,
    relayCycleBaseMs: 45_000,
    forceDisableDht: false,
    relayIdleStretchMaxMultiplier: 2,
  },
  smart: {
    maxConnections: 40,
    mdnsIntervalMs: 60_000,
    mdnsPolicy: "on",
    capabilityDiscoveryIntervalMs: 180_000,
    lazyCapabilityDiscovery: true,
    idleTimerStretch: true,
    connectionMonitorPingIntervalMs: 120_000,
    bondWarmIntervalMs: 600_000,
    bondWarmPerContactCooldownMs: 600_000,
    bondWarmEventDriven: true,
    relayCycleBaseMs: 60_000,
    forceDisableDht: false,
    relayIdleStretchMaxMultiplier: 2,
  },
  aggressive: {
    maxConnections: 32,
    mdnsIntervalMs: 120_000,
    mdnsPolicy: "lan-only",
    capabilityDiscoveryIntervalMs: 300_000,
    lazyCapabilityDiscovery: true,
    idleTimerStretch: true,
    connectionMonitorPingIntervalMs: 180_000,
    bondWarmIntervalMs: 900_000,
    bondWarmPerContactCooldownMs: 900_000,
    bondWarmEventDriven: true,
    relayCycleBaseMs: 90_000,
    forceDisableDht: true,
    relayIdleStretchMaxMultiplier: 2,
  },
  quietWan: {
    // Like `aggressive` (DHT off) but keeps WAN relay + mDNS for cross-NAT
    // discovery via the relay roster. The public-libp2p DHT swarm is pure
    // churn for a CGNAT'd node whose routing table never fills; this preset
    // removes it at the source while preserving reachability. Pair with
    // discoveryProfile "contacts-only" so bootstrap also narrows to relays.
    maxConnections: 24,
    mdnsIntervalMs: 60_000,
    mdnsPolicy: "on",
    capabilityDiscoveryIntervalMs: 300_000,
    lazyCapabilityDiscovery: true,
    idleTimerStretch: true,
    connectionMonitorPingIntervalMs: 120_000,
    bondWarmIntervalMs: DEFAULT_BOND_WARM_INTERVAL_MS,
    bondWarmPerContactCooldownMs: DEFAULT_BOND_WARM_PER_CONTACT_COOLDOWN_MS,
    bondWarmEventDriven: true,
    relayCycleBaseMs: 60_000,
    forceDisableDht: true,
    relayIdleStretchMaxMultiplier: 2,
  },
};

export function isConnectivityMode(value: unknown): value is ConnectivityMode {
  // Derive from CONNECTIVITY_MODES so adding a preset above is the only place
  // a new mode needs to be declared. A hardcoded `value === "..."` chain here
  // silently drops any mode that isn't also listed (quietWan was exactly this
  // bug during review).
  return typeof value === "string" && (CONNECTIVITY_MODES as readonly string[]).includes(value);
}

export function resolveConnectivityMode(raw?: ConnectivityMode | string | null): ConnectivityMode {
  if (isConnectivityMode(raw)) return raw;
  return DEFAULT_CONNECTIVITY_MODE;
}

export function resolveConnectivityPreset(mode?: ConnectivityMode | string | null): ConnectivityPreset {
  const resolved = resolveConnectivityMode(mode);
  return { mode: resolved, ...PRESETS[resolved] };
}

/** Build ConnectivityTuning fields from a mode preset (for runtime merge). */
export function connectivityTuningFromPreset(preset: ConnectivityPreset): ConnectivityTuning {
  return {
    connectivityMode: preset.mode,
    maxConnections: preset.maxConnections,
    mdnsIntervalMs: preset.mdnsIntervalMs,
    capabilityDiscoveryIntervalMs: preset.capabilityDiscoveryIntervalMs,
    lazyCapabilityDiscovery: preset.lazyCapabilityDiscovery,
    idleTimerStretch: preset.idleTimerStretch,
    connectionMonitorPingIntervalMs: preset.connectionMonitorPingIntervalMs,
    bondWarmIntervalMs: preset.bondWarmIntervalMs,
    bondWarmPerContactCooldownMs: preset.bondWarmPerContactCooldownMs,
    bondWarmEventDriven: preset.bondWarmEventDriven,
    relayCycleBaseMs: preset.relayCycleBaseMs,
    forceDisableDht: preset.forceDisableDht,
    mdnsPolicy: preset.mdnsPolicy,
  };
}

/**
 * Resolve effective tuning: mode preset as base, then optional explicit field overrides.
 * Prefer setting `connectivityMode`; fine-grained fields override the preset when present.
 */
export function resolveConnectivityTuning(input?: {
  connectivityMode?: ConnectivityMode | string | null;
  maxConnections?: number;
  mdnsIntervalMs?: number;
  capabilityDiscoveryIntervalMs?: number;
  lazyCapabilityDiscovery?: boolean;
  idleTimerStretch?: boolean;
  connectionMonitorPingIntervalMs?: number;
  bondWarmIntervalMs?: number;
  bondWarmPerContactCooldownMs?: number;
  bondWarmEventDriven?: boolean;
  relayCycleBaseMs?: number;
  forceDisableDht?: boolean;
  mdnsPolicy?: "on" | "lan-only" | "off";
}): ConnectivityTuning {
  const preset = resolveConnectivityPreset(input?.connectivityMode);
  const base = connectivityTuningFromPreset(preset);
  const overrides = clampConnectivityTuningInput({
    maxConnections: input?.maxConnections,
    mdnsIntervalMs: input?.mdnsIntervalMs,
    capabilityDiscoveryIntervalMs: input?.capabilityDiscoveryIntervalMs,
    lazyCapabilityDiscovery: input?.lazyCapabilityDiscovery,
    idleTimerStretch: input?.idleTimerStretch,
    connectionMonitorPingIntervalMs: input?.connectionMonitorPingIntervalMs,
    bondWarmIntervalMs: input?.bondWarmIntervalMs,
    bondWarmPerContactCooldownMs: input?.bondWarmPerContactCooldownMs,
    bondWarmEventDriven: input?.bondWarmEventDriven,
    relayCycleBaseMs: input?.relayCycleBaseMs,
    forceDisableDht: input?.forceDisableDht,
    mdnsPolicy: input?.mdnsPolicy,
  });
  return { ...base, ...overrides, connectivityMode: preset.mode };
}

export function discoveryProfileUsesDht(profile: DiscoveryProfile): boolean {
  return profile === "wan-default";
}

export function discoveryProfileDefaultEnableMdns(_profile: DiscoveryProfile): boolean {
  return true;
}

export function defaultLazyCapabilityDiscovery(_profile: DiscoveryProfile): boolean {
  return false;
}

export function defaultIdleTimerStretch(_profile: DiscoveryProfile): boolean {
  return false;
}

export function resolveMaxConnections(tuning?: ConnectivityTuning): number | undefined {
  const raw = tuning?.maxConnections;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(MAX_CLIENT_MAX_CONNECTIONS, Math.max(MIN_CLIENT_MAX_CONNECTIONS, Math.round(raw)));
  }
  return undefined;
}

export function resolveMdnsIntervalMs(tuning?: ConnectivityTuning): number {
  const raw = tuning?.mdnsIntervalMs;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(MAX_MDNS_INTERVAL_MS, Math.max(MIN_MDNS_INTERVAL_MS, Math.round(raw)));
  }
  return DEFAULT_MDNS_INTERVAL_MS;
}

export function resolveCapabilityDiscoveryIntervalMs(tuning?: ConnectivityTuning): number {
  const raw = tuning?.capabilityDiscoveryIntervalMs;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(
      MAX_CAPABILITY_DISCOVERY_INTERVAL_MS,
      Math.max(MIN_CAPABILITY_DISCOVERY_INTERVAL_MS, Math.round(raw)),
    );
  }
  return DEFAULT_CAPABILITY_DISCOVERY_INTERVAL_MS;
}

export function resolveLazyCapabilityDiscovery(
  profile: DiscoveryProfile,
  tuning?: ConnectivityTuning,
): boolean {
  if (typeof tuning?.lazyCapabilityDiscovery === "boolean") {
    return tuning.lazyCapabilityDiscovery;
  }
  return defaultLazyCapabilityDiscovery(profile);
}

export function resolveIdleTimerStretch(
  profile: DiscoveryProfile,
  tuning?: ConnectivityTuning,
): boolean {
  if (typeof tuning?.idleTimerStretch === "boolean") {
    return tuning.idleTimerStretch;
  }
  return defaultIdleTimerStretch(profile);
}

export function resolveConnectionMonitorPingIntervalMs(tuning?: ConnectivityTuning): number {
  const raw = tuning?.connectionMonitorPingIntervalMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 15_000) {
    return Math.min(300_000, Math.round(raw));
  }
  return DEFAULT_CONNECTION_MONITOR_PING_INTERVAL_MS;
}

export function resolveBondWarmIntervalMs(tuning?: ConnectivityTuning): number {
  const raw = tuning?.bondWarmIntervalMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 60_000) {
    return Math.min(3_600_000, Math.round(raw));
  }
  return DEFAULT_BOND_WARM_INTERVAL_MS;
}

export function resolveBondWarmPerContactCooldownMs(tuning?: ConnectivityTuning): number {
  const raw = tuning?.bondWarmPerContactCooldownMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 60_000) {
    return Math.min(3_600_000, Math.round(raw));
  }
  return DEFAULT_BOND_WARM_PER_CONTACT_COOLDOWN_MS;
}

export function resolveBondWarmEventDriven(tuning?: ConnectivityTuning): boolean {
  return tuning?.bondWarmEventDriven === true;
}

export function resolveRelayCycleBaseMs(tuning?: ConnectivityTuning): number {
  const raw = tuning?.relayCycleBaseMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 15_000) {
    return Math.min(120_000, Math.round(raw));
  }
  return DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS;
}

export function resolveForceDisableDht(tuning?: ConnectivityTuning): boolean {
  return tuning?.forceDisableDht === true;
}

export function resolveMdnsPolicy(tuning?: ConnectivityTuning): "on" | "lan-only" | "off" {
  if (tuning?.mdnsPolicy === "lan-only" || tuning?.mdnsPolicy === "off" || tuning?.mdnsPolicy === "on") {
    return tuning.mdnsPolicy;
  }
  return "on";
}

export function resolveEnableMdns(
  profile: DiscoveryProfile,
  explicit?: boolean,
  tuning?: ConnectivityTuning,
): boolean {
  const policy = resolveMdnsPolicy(tuning);
  if (policy === "off") return false;
  if (policy === "lan-only") {
    if (profile !== "lan-fast") return false;
  }
  if (typeof explicit === "boolean") {
    return explicit;
  }
  return discoveryProfileDefaultEnableMdns(profile);
}

/** Apply idle stretch multiplier when enabled and mesh activity is stale. */
export function stretchTimerIntervalMs(
  baseMs: number,
  opts: { idleStretchEnabled: boolean; lastMeshActivityMs: number; now?: number },
): number {
  if (!opts.idleStretchEnabled) {
    return baseMs;
  }
  const now = opts.now ?? Date.now();
  if (now - opts.lastMeshActivityMs < IDLE_MESH_ACTIVITY_THRESHOLD_MS) {
    return baseMs;
  }
  return baseMs * IDLE_TIMER_STRETCH_MULTIPLIER;
}

export function clampConnectivityTuningInput(input: Partial<ConnectivityTuning>): ConnectivityTuning {
  const out: ConnectivityTuning = {};
  if (input.connectivityMode !== undefined && isConnectivityMode(input.connectivityMode)) {
    out.connectivityMode = input.connectivityMode;
  }
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
  if (input.connectionMonitorPingIntervalMs !== undefined) {
    out.connectionMonitorPingIntervalMs = resolveConnectionMonitorPingIntervalMs({
      connectionMonitorPingIntervalMs: input.connectionMonitorPingIntervalMs,
    });
  }
  if (input.bondWarmIntervalMs !== undefined) {
    out.bondWarmIntervalMs = resolveBondWarmIntervalMs({
      bondWarmIntervalMs: input.bondWarmIntervalMs,
    });
  }
  if (input.bondWarmPerContactCooldownMs !== undefined) {
    out.bondWarmPerContactCooldownMs = resolveBondWarmPerContactCooldownMs({
      bondWarmPerContactCooldownMs: input.bondWarmPerContactCooldownMs,
    });
  }
  if (typeof input.bondWarmEventDriven === "boolean") {
    out.bondWarmEventDriven = input.bondWarmEventDriven;
  }
  if (input.relayCycleBaseMs !== undefined) {
    out.relayCycleBaseMs = resolveRelayCycleBaseMs({ relayCycleBaseMs: input.relayCycleBaseMs });
  }
  if (typeof input.forceDisableDht === "boolean") {
    out.forceDisableDht = input.forceDisableDht;
  }
  if (input.mdnsPolicy === "on" || input.mdnsPolicy === "lan-only" || input.mdnsPolicy === "off") {
    out.mdnsPolicy = input.mdnsPolicy;
  }
  return out;
}

/** One-line summary for Settings UI. */
export function formatConnectivityPresetSummary(preset: ConnectivityPreset): string {
  const mdns =
    preset.mdnsPolicy === "off"
      ? "mDNS off"
      : preset.mdnsPolicy === "lan-only"
        ? `mDNS lan-only ${Math.round(preset.mdnsIntervalMs / 1000)}s`
        : `mDNS ${Math.round(preset.mdnsIntervalMs / 1000)}s`;
  return [
    mdns,
    `relay ${Math.round(preset.relayCycleBaseMs / 1000)}s`,
    `ping ${Math.round(preset.connectionMonitorPingIntervalMs / 1000)}s`,
    preset.lazyCapabilityDiscovery ? "lazy DHT" : "DHT find on",
    `maxConn ${preset.maxConnections}`,
    preset.forceDisableDht ? "DHT off" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
