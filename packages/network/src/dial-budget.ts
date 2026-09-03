/**
 * Unified dial-queue pressure meter for home nodes.
 *
 * Preserves existing tiers (do not collapse into one threshold):
 *   ≤16  bond-sponsor settle target (apps/node only)
 *   ≤20  prune / bond-warm busy
 *   ≤48  speculative ensurePeerReachable soft defer
 *   ≤50  background work (DHT provide, bootstrap reprobe)
 *   ≥64  libp2p hard cap (even priorityDial soft-defers)
 */
import { PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD } from "./connection-stats.js";

/** Speculative ensurePeerReachable soft defer (must stay below hardCap). */
export const ENSURE_PEER_DIAL_QUEUE_DEFER_THRESHOLD = 48;
/** DHT provide / interest advertise / bootstrap reprobe defer. */
export const DHT_PROVIDE_DIAL_QUEUE_DEFER_THRESHOLD = 50;
/** Home-node default: refuse to enqueue hundreds of pending dials. */
export const DEFAULT_CLIENT_MAX_DIAL_QUEUE_LENGTH = 64;
/** Bond-sponsor circuit settle target (apps/node user-facing latency). */
export const BOND_SPONSOR_DIAL_QUEUE_SETTLE_TARGET = 16;

export const DIAL_BUDGET = {
  bondSettle: BOND_SPONSOR_DIAL_QUEUE_SETTLE_TARGET,
  prune: PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD,
  ensureSoft: ENSURE_PEER_DIAL_QUEUE_DEFER_THRESHOLD,
  background: DHT_PROVIDE_DIAL_QUEUE_DEFER_THRESHOLD,
  hardCap: DEFAULT_CLIENT_MAX_DIAL_QUEUE_LENGTH,
} as const;

export interface DialBudgetSnapshot {
  dialQueueLength: number;
  /** Queue above prune threshold — bond-warm should wait; prune may run. */
  busy: boolean;
  /** Queue above background threshold — DHT provide / reprobe should wait. */
  congested: boolean;
  /** Queue at/above libp2p hard cap. */
  saturated: boolean;
  shouldPrune: boolean;
  deferSpeculativeEnsure: boolean;
  deferBackgroundWork: boolean;
  deferBondWarm: boolean;
}

export function assessDialBudget(
  dialQueueLength: number | undefined,
  opts?: {
    ensureThreshold?: number;
    backgroundThreshold?: number;
    hardCap?: number;
    pruneThreshold?: number;
  },
): DialBudgetSnapshot {
  const q = dialQueueLength ?? 0;
  const ensureSoft = opts?.ensureThreshold ?? DIAL_BUDGET.ensureSoft;
  const background = opts?.backgroundThreshold ?? DIAL_BUDGET.background;
  const hardCap = opts?.hardCap ?? DIAL_BUDGET.hardCap;
  const prune = opts?.pruneThreshold ?? DIAL_BUDGET.prune;
  const saturated = q >= hardCap;
  const congested = q > background;
  const busy = q > prune;
  return {
    dialQueueLength: q,
    busy,
    congested,
    saturated,
    shouldPrune: busy,
    deferSpeculativeEnsure: saturated || q > ensureSoft,
    deferBackgroundWork: congested,
    deferBondWarm: busy,
  };
}

/** Speculative ensurePeerReachable should wait when the dial queue is flooded. */
export function shouldDeferEnsurePeerForDialQueue(input: {
  dialQueueLength: number | undefined;
  forceFreshDial?: boolean;
  priorityDial?: boolean;
  threshold?: number;
  /** Soft-defer everyone (incl. priority) at/above this — libp2p would reject. */
  hardCap?: number;
}): boolean {
  const len = input.dialQueueLength ?? 0;
  const hardCap = input.hardCap ?? DIAL_BUDGET.hardCap;
  if (len >= hardCap) return true;
  if (input.forceFreshDial === true || input.priorityDial === true) return false;
  return len > (input.threshold ?? DIAL_BUDGET.ensureSoft);
}

/** DHT provide / interest advertise should wait when the dial queue is flooded. */
export function isDialQueueLengthCongested(
  dialQueueLength: number | undefined,
  threshold: number = DIAL_BUDGET.background,
): boolean {
  return (dialQueueLength ?? 0) > threshold;
}
