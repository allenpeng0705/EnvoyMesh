export type StandaloneRelayHealthStatus = "healthy" | "degraded" | "unhealthy" | "critical";

export type StandaloneRelayHealthAction = "none" | "restart-libp2p" | "exit-for-supervisor";

export interface StandaloneRelayHealthCounters {
  healthChecks: number;
  degraded: number;
  unhealthy: number;
  critical: number;
  restartRequested: number;
  exitRequested: number;
  fatalErrors: number;
}

export interface StandaloneRelayHealthState {
  lastStatus: StandaloneRelayHealthStatus;
  lastHealthyAt?: string;
  consecutiveFailures: number;
  consecutiveRestartRequests: number;
  /** Consecutive health ticks with event-loop lag above threshold. */
  consecutiveHighLag: number;
  counters: StandaloneRelayHealthCounters;
}

export interface StandaloneRelayHealthSnapshot {
  status: StandaloneRelayHealthStatus;
  checkedAt: string;
  uptimeMs: number;
  lastHealthyAt?: string;
  reasons: string[];
  actions: StandaloneRelayHealthAction[];
  listenAddrCount: number;
  connectedRelayPeerCount: number;
  eventLoopLagMs?: number;
  consecutiveGossipFailures: number;
  rssBytes?: number;
  recentFatalErrorCount: number;
  lastFatalError?: string;
  recoveryCounters: StandaloneRelayHealthCounters;
}

export interface StandaloneRelayHealthInput {
  now?: () => number;
  startedAtMs: number;
  listenAddrs: string[];
  connectedRelayPeerCount: number;
  httpEnabled: boolean;
  httpListening: boolean;
  eventLoopLagMs?: number;
  /** Consecutive gossip ticks where every probe failed. A control-plane stall
   *  (async I/O starvation) never trips the event-loop lag monitor, so this is
   *  the only signal that catches a wedged relay book / dial queue. */
  consecutiveGossipFailures?: number;
  rssBytes?: number;
  recentFatalErrors: Array<{ at: number; message: string }>;
  previous?: StandaloneRelayHealthState;
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

const MAX_EVENT_LOOP_LAG_MS = 1_500;
const MAX_RSS_BYTES = readMaxRssBytes("ENVOYMESH_RELAY_MAX_RSS_MB", 3072);
const FATAL_ERROR_WINDOW_MS = 5 * 60_000;
const MAX_FATAL_ERRORS_PER_WINDOW = 3;
const MAX_CONSECUTIVE_RESTART_REQUESTS = 2;
/**
 * Gossip interval is 90s, so 3 consecutive all-failed ticks ≈ 4.5 min of
 * control-plane stall before restart-libp2p. Detects async I/O starvation
 * (junk dials saturating the connection manager) that never shows as lag.
 */
const MAX_CONSECUTIVE_GOSSIP_FAILURES = 3;
/**
 * Tighter than home-node (~90s): with 15s health cadence + 2 ticks ≈ 30s of
 * sustained lag before exit-for-supervisor. Community relays must recover
 * faster than a home phone client.
 */
const MAX_CONSECUTIVE_HIGH_LAG = 2;

export function createInitialStandaloneRelayHealthState(): StandaloneRelayHealthState {
  return {
    lastStatus: "healthy",
    consecutiveFailures: 0,
    consecutiveRestartRequests: 0,
    consecutiveHighLag: 0,
    counters: {
      healthChecks: 0,
      degraded: 0,
      unhealthy: 0,
      critical: 0,
      restartRequested: 0,
      exitRequested: 0,
      fatalErrors: 0,
    },
  };
}

export function evaluateStandaloneRelayHealth(input: StandaloneRelayHealthInput): {
  snapshot: StandaloneRelayHealthSnapshot;
  state: StandaloneRelayHealthState;
} {
  const now = input.now ?? Date.now;
  const current = now();
  const previous = input.previous ?? createInitialStandaloneRelayHealthState();
  const reasons: string[] = [];
  const actions = new Set<StandaloneRelayHealthAction>();
  const recentFatalErrors = input.recentFatalErrors.filter((item) => current - item.at <= FATAL_ERROR_WINDOW_MS);

  if (input.listenAddrs.length === 0) {
    reasons.push("relay has no listen multiaddrs");
    actions.add("restart-libp2p");
  }

  if (input.httpEnabled && !input.httpListening) {
    reasons.push("http health server is not listening");
    actions.add("exit-for-supervisor");
  }

  const lagHigh = (input.eventLoopLagMs ?? 0) > MAX_EVENT_LOOP_LAG_MS;
  const consecutiveHighLag = lagHigh ? previous.consecutiveHighLag + 1 : 0;
  if (lagHigh) {
    reasons.push(`event loop lag high=${input.eventLoopLagMs}ms`);
    // Match home-node policy: do NOT recycle libp2p on lag alone (drops
    // reservations / flaps clients). After sustained lag, exit so the external
    // supervisor (systemd Restart=always / launchd KeepAlive) can recover.
    if (consecutiveHighLag >= MAX_CONSECUTIVE_HIGH_LAG) {
      reasons.push(`event loop lag sustained for ${consecutiveHighLag} health checks`);
      actions.add("exit-for-supervisor");
    }
  }

  if ((input.rssBytes ?? 0) > (input.maxRssBytesOverride ?? MAX_RSS_BYTES)) {
    reasons.push(`memory rss high=${input.rssBytes}`);
    actions.add("exit-for-supervisor");
  }

  // Control-plane progress: when every gossip probe has failed for
  // MAX_CONSECUTIVE_GOSSIP_FAILURES consecutive ticks, the relay book / dial
  // queue is wedged. Unlike event-loop lag, this stall is pure async I/O
  // starvation (serial dials to self + bootstrap.libp2p.io saturated the dial
  // queue while Health kept reporting healthy — observed 2026-08-17).
  const consecutiveGossipFailures = input.consecutiveGossipFailures ?? 0;
  if (consecutiveGossipFailures >= MAX_CONSECUTIVE_GOSSIP_FAILURES) {
    reasons.push(`gossip stalled consecutiveFailures=${consecutiveGossipFailures}`);
    actions.add("restart-libp2p");
  }

  if (recentFatalErrors.length >= MAX_FATAL_ERRORS_PER_WINDOW) {
    reasons.push(`recent fatal errors high=${recentFatalErrors.length}`);
    actions.add("exit-for-supervisor");
  } else if (recentFatalErrors.length > 0) {
    reasons.push(`recent fatal errors=${recentFatalErrors.length}`);
  }

  const restartRequested = actions.has("restart-libp2p");
  if (restartRequested && previous.consecutiveRestartRequests >= MAX_CONSECUTIVE_RESTART_REQUESTS) {
    reasons.push("libp2p restart requested repeatedly");
    actions.add("exit-for-supervisor");
  }

  const status = statusFor(actions, reasons);
  if (actions.size === 0) {
    actions.add("none");
  }

  const snapshot = buildSnapshot({
    status,
    current,
    input,
    previous,
    reasons,
    actions,
    recentFatalErrors,
  });

  return {
    snapshot,
    state: nextState(previous, snapshot, recentFatalErrors.length),
  };
}

function statusFor(actions: Set<StandaloneRelayHealthAction>, reasons: string[]): StandaloneRelayHealthStatus {
  if (actions.has("exit-for-supervisor")) {
    return "critical";
  }
  if (actions.has("restart-libp2p")) {
    return "unhealthy";
  }
  if (reasons.length > 0) {
    return "degraded";
  }
  return "healthy";
}

function buildSnapshot(options: {
  status: StandaloneRelayHealthStatus;
  current: number;
  input: StandaloneRelayHealthInput;
  previous: StandaloneRelayHealthState;
  reasons: string[];
  actions: Set<StandaloneRelayHealthAction>;
  recentFatalErrors: Array<{ at: number; message: string }>;
}): StandaloneRelayHealthSnapshot {
  const { status, current, input, previous, reasons, actions, recentFatalErrors } = options;

  return {
    status,
    checkedAt: new Date(current).toISOString(),
    uptimeMs: Math.max(0, current - input.startedAtMs),
    lastHealthyAt: status === "healthy" ? new Date(current).toISOString() : previous.lastHealthyAt,
    reasons,
    actions: [...actions],
    listenAddrCount: input.listenAddrs.length,
    connectedRelayPeerCount: input.connectedRelayPeerCount,
    eventLoopLagMs: input.eventLoopLagMs,
    consecutiveGossipFailures: input.consecutiveGossipFailures ?? 0,
    rssBytes: input.rssBytes,
    recentFatalErrorCount: recentFatalErrors.length,
    lastFatalError: recentFatalErrors.at(-1)?.message,
    recoveryCounters: { ...previous.counters },
  };
}

function nextState(
  previous: StandaloneRelayHealthState,
  snapshot: StandaloneRelayHealthSnapshot,
  recentFatalErrorCount: number,
): StandaloneRelayHealthState {
  const counters = { ...previous.counters };
  counters.healthChecks += 1;
  counters.fatalErrors = recentFatalErrorCount;

  if (snapshot.status === "degraded") {
    counters.degraded += 1;
  }
  if (snapshot.status === "unhealthy") {
    counters.unhealthy += 1;
  }
  if (snapshot.status === "critical") {
    counters.critical += 1;
  }
  if (snapshot.actions.includes("restart-libp2p")) {
    counters.restartRequested += 1;
  }
  if (snapshot.actions.includes("exit-for-supervisor")) {
    counters.exitRequested += 1;
  }

  const lagHigh = (snapshot.eventLoopLagMs ?? 0) > MAX_EVENT_LOOP_LAG_MS;
  return {
    lastStatus: snapshot.status,
    lastHealthyAt: snapshot.status === "healthy" ? snapshot.checkedAt : previous.lastHealthyAt,
    consecutiveFailures: snapshot.status === "healthy" ? 0 : previous.consecutiveFailures + 1,
    consecutiveRestartRequests: snapshot.actions.includes("restart-libp2p")
      ? previous.consecutiveRestartRequests + 1
      : 0,
    consecutiveHighLag: lagHigh ? previous.consecutiveHighLag + 1 : 0,
    counters,
  };
}
