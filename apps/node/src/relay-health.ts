import type { RelayBookEntry, RelayRosterEntry } from "./relay-roster.js";
import type { RelaySummaryEntry } from "./relay-lookup-router.js";
import type { RelayManagerRoutingMetrics } from "@envoymesh/local-store";
import { capRelayClientConsecutiveFailures } from "./libp2p-repair-policy.js";

export type RelayHealthStatus = "healthy" | "degraded" | "unhealthy" | "critical";

export type RelayHealthAction =
  | "none"
  | "reprobe-neighbors"
  | "refresh-relay-summary"
  | "restart-libp2p"
  | "exit-for-supervisor";

export interface RelayHealthRecoveryCounters {
  healthChecks: number;
  degraded: number;
  unhealthy: number;
  critical: number;
  softRepair: number;
  restartRequested: number;
  exitRequested: number;
}

export interface RelayHealthState {
  lastStatus: RelayHealthStatus;
  lastHealthyAt?: string;
  consecutiveFailures: number;
  counters: RelayHealthRecoveryCounters;
}

export interface RelayHealthSnapshot {
  status: RelayHealthStatus;
  checkedAt: string;
  lastHealthyAt?: string;
  reasons: string[];
  actions: RelayHealthAction[];
  recoveryCounters: RelayHealthRecoveryCounters;
}

export interface RelayHealthInput {
  now?: () => number;
  relayEnabled: boolean;
  relayServerEnabled: boolean;
  listenAddrs: string[];
  bootstrapProbeResults: Array<{ ok: boolean }>;
  relayBook: RelayBookEntry[];
  rosterEntries: RelayRosterEntry[];
  summaries: RelaySummaryEntry[];
  routing: RelayManagerRoutingMetrics;
  previous?: RelayHealthState;
  eventLoopLagMs?: number;
  rssBytes?: number;
  /** Override the MAX_RSS_BYTES threshold (used by tests to avoid env-var timing issues). */
  maxRssBytesOverride?: number;
}

function readMaxRssBytes(envName: string, defaultMb: number): number {
  const raw = process.env[envName];
  if (raw) {
    const mb = Number(raw);
    if (Number.isFinite(mb) && mb > 0) return mb * 1024 * 1024;
  }
  return defaultMb * 1024 * 1024;
}

const MAX_EVENT_LOOP_LAG_MS = 2_000;
const MAX_RSS_BYTES = readMaxRssBytes("ENVOYMESH_RELAY_MAX_RSS_MB", 4096);
const MAX_NEGATIVE_CACHE_SIZE = 100;

/** Desktop / edge nodes that use relay transport but do not run `--relay-server`. */
export function isRelayClientNode(input: Pick<RelayHealthInput, "relayServerEnabled">): boolean {
  return !input.relayServerEnabled;
}

export function createInitialRelayHealthState(): RelayHealthState {
  return {
    lastStatus: "healthy",
    consecutiveFailures: 0,
    counters: {
      healthChecks: 0,
      degraded: 0,
      unhealthy: 0,
      critical: 0,
      softRepair: 0,
      restartRequested: 0,
      exitRequested: 0,
    },
  };
}

export function evaluateRelayHealth(input: RelayHealthInput): { snapshot: RelayHealthSnapshot; state: RelayHealthState } {
  const now = input.now ?? Date.now;
  const current = now();
  const previous = input.previous ?? createInitialRelayHealthState();
  const reasons: string[] = [];
  const actions = new Set<RelayHealthAction>();

  if (!input.relayEnabled && !input.relayServerEnabled) {
    actions.add("none");
    const snapshot = buildSnapshot("healthy", current, previous, reasons, actions);
    return { snapshot, state: nextState(previous, snapshot, isRelayClientNode(input)) };
  }

  if (input.listenAddrs.length === 0) {
    reasons.push("relay has no listen multiaddrs");
    actions.add("restart-libp2p");
  }

  const recentBootstrap = input.bootstrapProbeResults.slice(-8);
  if (recentBootstrap.length > 0 && recentBootstrap.every((result) => !result.ok)) {
    reasons.push("recent bootstrap probes all failed");
    actions.add("reprobe-neighbors");
  }

  const activeRelayBook = input.relayBook.filter((entry) => entry.expiresAt > current && entry.state !== "removed");
  const freshSummaries = input.summaries.filter((entry) => entry.expiresAt > current);
  if (input.relayServerEnabled && activeRelayBook.length > 0 && freshSummaries.length === 0) {
    reasons.push("relay has neighbors but no fresh relay summaries");
    actions.add("refresh-relay-summary");
  }

  const failedNeighbors = activeRelayBook.filter((entry) => entry.failureCount >= 3);
  if (failedNeighbors.length > 0) {
    reasons.push(`relay neighbors with repeated failures=${failedNeighbors.length}`);
    actions.add("reprobe-neighbors");
  }

  if (input.routing.negativeCacheSize >= MAX_NEGATIVE_CACHE_SIZE) {
    reasons.push(`negative cache size high=${input.routing.negativeCacheSize}`);
    actions.add("reprobe-neighbors");
  }

  if (input.routing.forwardedLookupCount > 0 && input.routing.failedForwardCount > input.routing.forwardedLookupCount / 2) {
    reasons.push("more than half of forwarded lookups failed");
    actions.add("reprobe-neighbors");
  }

  const freshRoster = input.rosterEntries.filter((entry) => entry.expiresAt > current && entry.reservationFreshUntil > current);
  if (input.relayServerEnabled && input.rosterEntries.length > 0 && freshRoster.length === 0) {
    reasons.push("relay roster exists but all entries are stale");
    actions.add("refresh-relay-summary");
  }

  if ((input.eventLoopLagMs ?? 0) > MAX_EVENT_LOOP_LAG_MS) {
    reasons.push(`event loop lag high=${input.eventLoopLagMs}ms`);
    // Lag alone must not restart libp2p — see node-health.ts (contact reachability stability).
  }

  if ((input.rssBytes ?? 0) > (input.maxRssBytesOverride ?? MAX_RSS_BYTES)) {
    reasons.push(`memory rss high=${input.rssBytes}`);
    actions.add("exit-for-supervisor");
  }

  const relayClientOnly = isRelayClientNode(input);
  const status = statusFor(actions, reasons, previous, relayClientOnly);
  if (status === "critical") {
    actions.add("exit-for-supervisor");
  }
  if (actions.size === 0) {
    actions.add("none");
  }
  const snapshot = buildSnapshot(status, current, previous, reasons, actions);
  const state = nextState(previous, snapshot, isRelayClientNode(input));
  return { snapshot, state };
}

function statusFor(
  actions: Set<RelayHealthAction>,
  reasons: string[],
  previous: RelayHealthState,
  relayClientOnly: boolean,
): RelayHealthStatus {
  if (actions.has("exit-for-supervisor")) {
    return "critical";
  }
  // Relay clients must stay up when bootstrap relays are unreachable; degraded + reprobe is enough.
  if (!relayClientOnly && previous.consecutiveFailures >= 4) {
    return "critical";
  }
  if (actions.has("restart-libp2p")) {
    return "unhealthy";
  }
  if (actions.has("reprobe-neighbors") || actions.has("refresh-relay-summary")) {
    return "degraded";
  }
  if (reasons.length > 0) {
    return "degraded";
  }
  return "healthy";
}

function buildSnapshot(
  status: RelayHealthStatus,
  current: number,
  previous: RelayHealthState,
  reasons: string[],
  actions: Set<RelayHealthAction>,
): RelayHealthSnapshot {
  return {
    status,
    checkedAt: new Date(current).toISOString(),
    lastHealthyAt: status === "healthy" ? new Date(current).toISOString() : previous.lastHealthyAt,
    reasons,
    actions: [...actions],
    recoveryCounters: { ...previous.counters },
  };
}

function nextState(
  previous: RelayHealthState,
  snapshot: RelayHealthSnapshot,
  relayClientOnly: boolean,
): RelayHealthState {
  const counters = { ...previous.counters };
  counters.healthChecks += 1;
  if (snapshot.status === "degraded") {
    counters.degraded += 1;
  }
  if (snapshot.status === "unhealthy") {
    counters.unhealthy += 1;
  }
  if (snapshot.status === "critical") {
    counters.critical += 1;
  }
  if (snapshot.actions.includes("reprobe-neighbors") || snapshot.actions.includes("refresh-relay-summary")) {
    counters.softRepair += 1;
  }
  if (snapshot.actions.includes("restart-libp2p")) {
    counters.restartRequested += 1;
  }
  if (snapshot.actions.includes("exit-for-supervisor")) {
    counters.exitRequested += 1;
  }

  return {
    lastStatus: snapshot.status,
    lastHealthyAt: snapshot.status === "healthy" ? snapshot.checkedAt : previous.lastHealthyAt,
    consecutiveFailures: relayClientOnly
      ? capRelayClientConsecutiveFailures(
          snapshot.status === "healthy" ? 0 : previous.consecutiveFailures + 1,
        )
      : snapshot.status === "healthy"
        ? 0
        : previous.consecutiveFailures + 1,
    counters,
  };
}
