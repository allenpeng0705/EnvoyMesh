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
  rssBytes?: number;
  recentFatalErrors: Array<{ at: number; message: string }>;
  previous?: StandaloneRelayHealthState;
}

const MAX_EVENT_LOOP_LAG_MS = 2_000;
const MAX_RSS_BYTES = 1_500 * 1024 * 1024;
const FATAL_ERROR_WINDOW_MS = 5 * 60_000;
const MAX_FATAL_ERRORS_PER_WINDOW = 3;
const MAX_CONSECUTIVE_RESTART_REQUESTS = 2;

export function createInitialStandaloneRelayHealthState(): StandaloneRelayHealthState {
  return {
    lastStatus: "healthy",
    consecutiveFailures: 0,
    consecutiveRestartRequests: 0,
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

  if ((input.eventLoopLagMs ?? 0) > MAX_EVENT_LOOP_LAG_MS) {
    reasons.push(`event loop lag high=${input.eventLoopLagMs}ms`);
    actions.add("restart-libp2p");
  }

  if ((input.rssBytes ?? 0) > MAX_RSS_BYTES) {
    reasons.push(`memory rss high=${input.rssBytes}`);
    actions.add("exit-for-supervisor");
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

  return {
    lastStatus: snapshot.status,
    lastHealthyAt: snapshot.status === "healthy" ? snapshot.checkedAt : previous.lastHealthyAt,
    consecutiveFailures: snapshot.status === "healthy" ? 0 : previous.consecutiveFailures + 1,
    consecutiveRestartRequests: snapshot.actions.includes("restart-libp2p")
      ? previous.consecutiveRestartRequests + 1
      : 0,
    counters,
  };
}
