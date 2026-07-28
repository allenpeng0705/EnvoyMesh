/**
 * Coalesce concurrent async work so overlapping callers share one in-flight
 * run and a follow-up pass still applies if another request arrived mid-flight.
 *
 * Used by bridge HTTP rebind: Social may flip port then secret quickly; both
 * must land on disk-backed state without dropping the second change.
 */
export function createCoalescedRunner(
  run: (reason: string) => Promise<void>,
): (reason: string) => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let pending = false;
  let pendingReason: string | null = null;

  return async function coalesce(reason: string): Promise<void> {
    pendingReason = reason;
    pending = true;
    while (true) {
      if (inFlight) {
        await inFlight;
        if (!pending) return;
        continue;
      }
      inFlight = (async () => {
        while (pending) {
          pending = false;
          const r = pendingReason ?? "run";
          pendingReason = null;
          await run(r);
        }
      })();
      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
      if (!pending) return;
    }
  };
}
