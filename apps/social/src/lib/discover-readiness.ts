/**
 * Soft-gate Discover search until the home node has a usable circuit hop
 * (or a short wait elapses). Mirrors EnvoyGo `_waitForPhoneDiscoveryReady`.
 */
import type { CircuitReservationStatus } from "@envoymesh/api";

export type DiscoverReadinessClient = {
  getCircuitReservationStatus: () => Promise<CircuitReservationStatus>;
};

export function isCircuitReservationReady(status: CircuitReservationStatus): boolean {
  return status.live === true || status.state === "reserved";
}

/** Poll until reserved/live, or until maxWaitMs elapses. */
export async function waitForDiscoverReady(
  client: DiscoverReadinessClient,
  options?: { maxWaitMs?: number; pollMs?: number },
): Promise<{ ready: boolean }> {
  const maxWaitMs = options?.maxWaitMs ?? 8_000;
  const pollMs = options?.pollMs ?? 400;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const status = await client.getCircuitReservationStatus();
      if (isCircuitReservationReady(status)) return { ready: true };
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  try {
    const status = await client.getCircuitReservationStatus();
    return { ready: isCircuitReservationReady(status) };
  } catch {
    return { ready: false };
  }
}
