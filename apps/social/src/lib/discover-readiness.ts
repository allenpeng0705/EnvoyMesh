/**
 * Soft-gate Discover search until the home node has a usable circuit hop
 * (or a short wait elapses). Mirrors EnvoyGo `_waitForPhoneDiscoveryReady`.
 *
 * The gate exists because a search issued before the hop is live comes back
 * empty (local/directory hits only) and the user reads that as "nobody is on
 * the mesh". It must not, however, tax every search: a hop observed live within
 * {@link RECENTLY_READY_WINDOW_MS} short-circuits the wait, so only a genuinely
 * cold start pays the poll.
 */
import type { CircuitReservationStatus } from "@envoymesh/api";

export type DiscoverReadinessClient = {
  getCircuitReservationStatus: () => Promise<CircuitReservationStatus>;
};

/** How long a previously observed live hop keeps the fast path warm. */
export const RECENTLY_READY_WINDOW_MS = 60_000;

let lastReadyAtMs: number | null = null;

/** Record that the node had a usable hop at `at` (defaults to now). */
export function noteDiscoverReady(at: number = Date.now()): void {
  lastReadyAtMs = at;
}

/** Test hook / sign-out hook: forget the memoized readiness. */
export function resetDiscoverReadinessMemo(): void {
  lastReadyAtMs = null;
}

/** True when a usable hop was observed within the memo window. */
export function isRecentlyDiscoverReady(now: number = Date.now()): boolean {
  return lastReadyAtMs !== null && now - lastReadyAtMs <= RECENTLY_READY_WINDOW_MS;
}

export function isCircuitReservationReady(status: CircuitReservationStatus): boolean {
  return status.live === true || status.state === "reserved";
}

/**
 * Resolve as soon as the node has a usable circuit hop.
 *
 * Fast path: one status probe; if it is ready (or was ready recently) return
 * immediately. Cold path: poll until reserved/live or `maxWaitMs` elapses.
 */
export async function waitForDiscoverReady(
  client: DiscoverReadinessClient,
  options?: { maxWaitMs?: number; pollMs?: number },
): Promise<{ ready: boolean }> {
  const maxWaitMs = options?.maxWaitMs ?? 8_000;
  const pollMs = options?.pollMs ?? 400;

  const probe = async (): Promise<boolean | undefined> => {
    try {
      const status = await client.getCircuitReservationStatus();
      if (isCircuitReservationReady(status)) {
        noteDiscoverReady();
        return true;
      }
      return false;
    } catch {
      return undefined;
    }
  };

  const first = await probe();
  if (first === true) return { ready: true };
  // A hop was live a moment ago — do not make the user wait on a poll that
  // would most likely succeed anyway (search retries handle a real drop).
  if (isRecentlyDiscoverReady()) return { ready: true };

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const ready = await probe();
    if (ready === true) return { ready: true };
    // Never observed a successful probe *and* the node keeps erroring: keep
    // waiting out the window (the RPC may be up before the hop is).
  }

  const last = await probe();
  return { ready: last === true };
}
