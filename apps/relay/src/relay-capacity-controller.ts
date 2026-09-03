/**
 * Runtime capacity controller — **hardware floor + adaptive discovery**.
 *
 * Connections and reservations both start at hardware floor, grow when healthy
 * toward hardware ceiling, shrink on stress (never below floor).
 *
 * libp2p is configured at ceilings at startup; reservations effective cap is
 * pushed live via EnvoyMesh.setCircuitRelayServerMaxReservations().
 */

export interface RelayCapacityRuntimeSample {
  eventLoopLagMs: number;
  dialQueueLength: number | null;
  totalPeerIds: number;
  reservationCount: number;
  /** Connection ceiling (libp2p maxConnections). */
  maxConnections: number;
  connectionBudgetFloor: number;
  adaptiveConnectionBudget: number;
  /** Reservation ceiling (libp2p store max at startup). */
  maxReservations: number;
  reservationBudgetFloor: number;
  adaptiveReservationBudget: number;
  rssMb?: number;
  maxRssMb?: number;
}

export interface RelayCapacityRuntimeState {
  effectiveMaxPeers: number;
  adaptiveConnectionBudget: number;
  adaptiveReservationBudget: number;
  consecutiveCriticalLoadTicks: number;
  consecutiveHealthyTicks: number;
  adjustmentCount: number;
  lastAction?: string;
}

const MIN_SWARM_PEERS = 64;
const FLEET_HEADROOM = 48;
const CRITICAL_LAG_MS = 1_200;
const CRITICAL_DIAL_QUEUE = 50;
const CRITICAL_TICKS_NEEDED = 2;
const EMERGENCY_SHRINK_FACTOR = 0.75;
const HEALTHY_LAG_MS = 500;
const HEALTHY_DIAL_QUEUE = 15;
const HEALTHY_TICKS_FOR_GROW = 5;
const GROW_STEP_FRACTION = 0.06;
const MIN_CONN_GROW_STEP = 32;
const MIN_RES_GROW_STEP = 16;
/** Do not expand TCP swarm table when homes fill most reservation slots. */
const MAX_RESERVATION_UTIL_FOR_CONN_GROW = 0.85;

export function createInitialRelayCapacityRuntimeState(input: {
  initialEffectiveMaxPeers: number;
  initialAdaptiveConnectionBudget: number;
  initialAdaptiveReservationBudget: number;
}): RelayCapacityRuntimeState {
  return {
    effectiveMaxPeers: Math.max(MIN_SWARM_PEERS, input.initialEffectiveMaxPeers),
    adaptiveConnectionBudget: input.initialAdaptiveConnectionBudget,
    adaptiveReservationBudget: input.initialAdaptiveReservationBudget,
    consecutiveCriticalLoadTicks: 0,
    consecutiveHealthyTicks: 0,
    adjustmentCount: 0,
  };
}

export function computeUserFirstSwarmBudget(sample: RelayCapacityRuntimeSample): number {
  return computeSwarmBudgetFromAdaptiveBudget(
    Math.min(sample.maxConnections, sample.adaptiveConnectionBudget),
    sample.reservationCount,
  );
}

export function computeSwarmBudgetFromAdaptiveBudget(
  adaptiveBudget: number,
  reservationCount: number,
): number {
  const raw = adaptiveBudget - Math.max(0, reservationCount) - FLEET_HEADROOM;
  return Math.max(MIN_SWARM_PEERS, raw);
}

export function reservationUtilization(
  reservationCount: number,
  adaptiveReservationBudget: number,
): number {
  if (adaptiveReservationBudget <= 0) return 0;
  return Math.min(1, reservationCount / adaptiveReservationBudget);
}

function isHealthySample(sample: RelayCapacityRuntimeSample): boolean {
  const dialOk =
    sample.dialQueueLength == null || sample.dialQueueLength < HEALTHY_DIAL_QUEUE;
  const lagOk = sample.eventLoopLagMs < HEALTHY_LAG_MS;
  const rssOk =
    sample.rssMb == null ||
    sample.maxRssMb == null ||
    sample.rssMb < sample.maxRssMb * 0.88;
  return lagOk && dialOk && rssOk;
}

function isCriticalSample(sample: RelayCapacityRuntimeSample): boolean {
  return (
    sample.eventLoopLagMs >= CRITICAL_LAG_MS ||
    (sample.dialQueueLength != null && sample.dialQueueLength >= CRITICAL_DIAL_QUEUE)
  );
}

function growStep(current: number, ceiling: number, minStep: number): number {
  const headroom = ceiling - current;
  const step = Math.max(minStep, Math.floor(headroom * GROW_STEP_FRACTION));
  return Math.min(ceiling, current + step);
}

export function tickRelayCapacityController(
  state: RelayCapacityRuntimeState,
  sample: RelayCapacityRuntimeSample,
): { state: RelayCapacityRuntimeState; changed: boolean; logLine?: string } {
  const prevConn = state.adaptiveConnectionBudget;
  const prevRes = state.adaptiveReservationBudget;
  const prevPeers = state.effectiveMaxPeers;

  const criticalLoad = isCriticalSample(sample);
  const healthy = isHealthySample(sample);

  let consecutiveCriticalLoadTicks = state.consecutiveCriticalLoadTicks;
  let consecutiveHealthyTicks = state.consecutiveHealthyTicks;

  if (criticalLoad) {
    consecutiveCriticalLoadTicks += 1;
    consecutiveHealthyTicks = 0;
  } else if (healthy) {
    consecutiveHealthyTicks += 1;
    consecutiveCriticalLoadTicks = 0;
  } else {
    consecutiveHealthyTicks = 0;
    consecutiveCriticalLoadTicks = 0;
  }

  const emergencyShrink = consecutiveCriticalLoadTicks >= CRITICAL_TICKS_NEEDED;
  const growReady = healthy && consecutiveHealthyTicks >= HEALTHY_TICKS_FOR_GROW;

  let nextRes = prevRes;
  let nextConn = prevConn;
  let resAction: "emergency-shrink" | "grow-healthy" | "hold" = "hold";
  let connAction: "emergency-shrink" | "grow-healthy" | "hold" = "hold";

  if (emergencyShrink) {
    nextRes = Math.max(
      sample.reservationBudgetFloor,
      Math.floor(nextRes * EMERGENCY_SHRINK_FACTOR),
    );
    nextConn = Math.max(
      sample.connectionBudgetFloor,
      Math.floor(nextConn * EMERGENCY_SHRINK_FACTOR),
    );
    resAction = "emergency-shrink";
    connAction = "emergency-shrink";
    consecutiveCriticalLoadTicks = 0;
    consecutiveHealthyTicks = 0;
  } else {
    if (growReady && nextRes < sample.maxReservations) {
      nextRes = growStep(nextRes, sample.maxReservations, MIN_RES_GROW_STEP);
      resAction = "grow-healthy";
    }
    const resUtil = reservationUtilization(sample.reservationCount, prevRes);
    if (
      growReady &&
      nextConn < sample.maxConnections &&
      resUtil < MAX_RESERVATION_UTIL_FOR_CONN_GROW
    ) {
      nextConn = growStep(nextConn, sample.maxConnections, MIN_CONN_GROW_STEP);
      connAction = "grow-healthy";
    }
    if (resAction === "grow-healthy" || connAction === "grow-healthy") {
      consecutiveHealthyTicks = 0;
    }
  }

  let lastAction = "hold";
  if (connAction === "emergency-shrink" || resAction === "emergency-shrink") {
    lastAction = "emergency-shrink";
  } else if (connAction === "grow-healthy" || resAction === "grow-healthy") {
    lastAction = "grow-healthy";
  }

  let target = computeSwarmBudgetFromAdaptiveBudget(nextConn, sample.reservationCount);
  if (lastAction === "emergency-shrink") {
    target = Math.max(MIN_SWARM_PEERS, Math.floor(target * EMERGENCY_SHRINK_FACTOR));
  }

  const resUtilForAlpha = reservationUtilization(sample.reservationCount, nextRes);
  const alpha = resUtilForAlpha > 0.5 ? 0.45 : 0.25;
  const effectiveMaxPeers = Math.max(
    MIN_SWARM_PEERS,
    Math.floor(prevPeers * (1 - alpha) + target * alpha),
  );

  const next: RelayCapacityRuntimeState = {
    effectiveMaxPeers,
    adaptiveConnectionBudget: nextConn,
    adaptiveReservationBudget: nextRes,
    consecutiveCriticalLoadTicks,
    consecutiveHealthyTicks,
    adjustmentCount: state.adjustmentCount,
    lastAction,
  };

  const connChanged = nextConn !== prevConn;
  const resChanged = nextRes !== prevRes;
  const peersChanged = effectiveMaxPeers !== prevPeers;
  if (connChanged || resChanged || peersChanged) {
    next.adjustmentCount += 1;
  }

  if (!connChanged && !resChanged && !peersChanged && lastAction === "hold") {
    return { state: next, changed: false };
  }

  const logLine =
    `[relay-capacity] ${lastAction}: conn ${prevConn}→${nextConn}/${sample.maxConnections} ` +
    `res ${prevRes}→${nextRes}/${sample.maxReservations} ` +
    `swarm ${prevPeers}→${effectiveMaxPeers} ` +
    `(homes=${sample.reservationCount} peers=${sample.totalPeerIds} ` +
    `lag=${sample.eventLoopLagMs}ms dialQueue=${sample.dialQueueLength ?? "?"} ` +
    `healthy=${next.consecutiveHealthyTicks}/${HEALTHY_TICKS_FOR_GROW})`;

  return {
    state: next,
    changed: connChanged || resChanged || peersChanged,
    logLine,
  };
}

export function relayCapacityPruneTriggerPeers(
  effectiveMaxPeers: number,
  _maxConnections: number,
): number {
  return Math.max(MIN_SWARM_PEERS, effectiveMaxPeers);
}

export function relayCapacityPruneTargetPeers(effectiveMaxPeers: number): number {
  return Math.max(MIN_SWARM_PEERS, Math.floor(effectiveMaxPeers * 0.92));
}
