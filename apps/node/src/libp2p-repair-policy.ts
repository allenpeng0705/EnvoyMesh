/** Minimum spacing between libp2p stop/start repairs (node-health + relay-health share one clock). */
export const LIBP2P_RESTART_MIN_INTERVAL_MS = 120_000;

/** Minimum spacing between relay-health bootstrap reprobe bursts while degraded. */
export const RELAY_HEALTH_REPROBE_MIN_INTERVAL_MS = 60_000;

/** Relay clients cap this counter so long outages do not inflate metrics forever. */
export const MAX_RELAY_CLIENT_CONSECUTIVE_FAILURES = 64;

export function shouldRunThrottledRepair(
  nowMs: number,
  lastRunAtMs: number,
  minIntervalMs: number,
): boolean {
  if (lastRunAtMs <= 0) {
    return true;
  }
  return nowMs - lastRunAtMs >= minIntervalMs;
}

export function capRelayClientConsecutiveFailures(count: number): number {
  return Math.min(count, MAX_RELAY_CLIENT_CONSECUTIVE_FAILURES);
}
