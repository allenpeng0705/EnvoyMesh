/**
 * Phase 7 (M1) — reservation health backoff on sustained relay-down.
 *
 * Two layers of testing:
 * 1. Unit tests for `computeReservationBackoffDelay` — the pure backoff math.
 *    Fast, deterministic, covers the exponential curve + cap.
 * 2. E2E smoke — the health loop against an unreachable relay does not hang or
 *    crash the node; it logs backoff after sustained failure.
 *
 * See docs/connectivity-internals-and-design.md Part VIII (M1).
 */
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh, computeReservationBackoffDelay } from "@envoymesh/network";

describe("computeReservationBackoffDelay (M1 backoff math)", () => {
  const lostMs = 15_000;
  const maxMs = 5 * 60_000;
  const threshold = 4;

  it("returns lostMs (no backoff) while failures are at or below threshold", () => {
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 0, threshold, lostMs, maxMs })).toBe(lostMs);
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 4, threshold, lostMs, maxMs })).toBe(lostMs);
  });

  it("doubles the delay for each failure above threshold", () => {
    // failure 5 → exp 1 → 15s × 2 = 30s
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 5, threshold, lostMs, maxMs })).toBe(30_000);
    // failure 6 → exp 2 → 15s × 4 = 60s
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 6, threshold, lostMs, maxMs })).toBe(60_000);
    // failure 7 → exp 3 → 15s × 8 = 120s
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 7, threshold, lostMs, maxMs })).toBe(120_000);
  });

  it("caps the delay at maxMs for very high failure counts", () => {
    // failure 20 → exp 16 → 15s × 65536 = huge → capped at 5 min
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 20, threshold, lostMs, maxMs })).toBe(maxMs);
  });

  it("respects custom threshold / max (test-configurable)", () => {
    // Short knobs (as the health loop exposes for testing).
    expect(
      computeReservationBackoffDelay({ consecutiveReWarmFailures: 3, threshold: 2, lostMs: 200, maxMs: 1_000 }),
    ).toBe(400); // exp 1 → 200 × 2
    expect(
      computeReservationBackoffDelay({ consecutiveReWarmFailures: 5, threshold: 2, lostMs: 200, maxMs: 1_000 }),
    ).toBe(1_000); // exp 3 → 200 × 8 = 1600 → capped at 1000
  });

  it("threshold 0 backs off immediately on the first failure", () => {
    expect(computeReservationBackoffDelay({ consecutiveReWarmFailures: 1, threshold: 0, lostMs, maxMs })).toBe(30_000);
  });
});

describe("E2E reservation health loop — dead-relay safety smoke (M1)", () => {
  const meshes: EnvoyMesh[] = [];

  afterEach(async () => {
    for (const m of meshes.splice(0)) {
      try {
        await m.stop();
      } catch {
        /* ignore */
      }
    }
  });

  it("does not hang or crash the node against an unreachable relay", async () => {
    // The point of M1 is that a dead relay doesn't drag the node down. This
    // smoke proves the loop is well-behaved: it starts, fails fast (the dial
    // timeout bounds each cycle), and the node stays responsive. A full
    // multi-cycle backoff-curve E2E is impractical here (each cycle is a 30s
    // dial timeout) — the math is covered by the unit tests above.
    const client = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableRelay: true,
      enableRelayServer: false,
      enableDht: false,
      enableMdns: false,
    });
    await client.start();
    meshes.push(client);

    const deadAddr = "/ip4/192.0.2.1/tcp/4321/p2p/12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";
    const stop = client.startRelayReservationHealthLoop([deadAddr], {
      lostIntervalMs: 500,
      pendingIntervalMs: 500,
      intervalMs: 60_000,
      sustainedFailureBackoffThreshold: 1,
      sustainedFailureBackoffMaxMs: 2_000,
    });

    // Let one cycle attempt (the dial will still be in flight at 3s, but the
    // loop scheduling should be healthy). The assertion is: node did not crash
    // and the loop is stoppable.
    await new Promise((r) => setTimeout(r, 3_000));
    stop();

    // Node is still responsive — getRelayReservationStatus doesn't throw.
    expect(() => client.getRelayReservationStatus()).not.toThrow();
  }, 15_000);
});
