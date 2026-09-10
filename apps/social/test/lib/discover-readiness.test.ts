import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCircuitReservationReady,
  isRecentlyDiscoverReady,
  noteDiscoverReady,
  RECENTLY_READY_WINDOW_MS,
  resetDiscoverReadinessMemo,
  waitForDiscoverReady,
} from "../../src/lib/discover-readiness.js";
import type { CircuitReservationStatus } from "@envoymesh/api";

function status(
  partial: Partial<CircuitReservationStatus> & Pick<CircuitReservationStatus, "state">,
): CircuitReservationStatus {
  return {
    live: false,
    everReserved: false,
    relayPeerIds: [],
    checkedAt: new Date().toISOString(),
    ...partial,
  };
}

function offClient() {
  return {
    getCircuitReservationStatus: vi.fn(async () => status({ state: "off" })),
  };
}

describe("discover-readiness", () => {
  beforeEach(() => {
    resetDiscoverReadinessMemo();
  });

  it("isCircuitReservationReady accepts live or reserved", () => {
    expect(isCircuitReservationReady(status({ state: "off" }))).toBe(false);
    expect(isCircuitReservationReady(status({ state: "pending" }))).toBe(false);
    expect(isCircuitReservationReady(status({ state: "reserved" }))).toBe(true);
    expect(isCircuitReservationReady(status({ state: "failed", live: true }))).toBe(true);
  });

  it("waitForDiscoverReady returns ready when reserved before deadline", async () => {
    let calls = 0;
    const client = {
      getCircuitReservationStatus: vi.fn(async () => {
        calls += 1;
        return status({ state: calls >= 2 ? "reserved" : "off" });
      }),
    };
    const result = await waitForDiscoverReady(client, { maxWaitMs: 2_000, pollMs: 20 });
    expect(result.ready).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("waitForDiscoverReady returns not ready after timeout", async () => {
    const client = offClient();
    const result = await waitForDiscoverReady(client, { maxWaitMs: 80, pollMs: 20 });
    expect(result.ready).toBe(false);
    expect(client.getCircuitReservationStatus.mock.calls.length).toBeGreaterThan(1);
  });

  it("waitForDiscoverReady keeps polling through thrown errors", async () => {
    let calls = 0;
    const client = {
      getCircuitReservationStatus: vi.fn(async () => {
        calls += 1;
        if (calls < 3) throw new Error("offline");
        return status({ state: "reserved", live: true });
      }),
    };
    const result = await waitForDiscoverReady(client, { maxWaitMs: 2_000, pollMs: 10 });
    expect(result.ready).toBe(true);
  });

  it("memoizes a live hop so the next search does not pay the wait", async () => {
    const warm = {
      getCircuitReservationStatus: vi.fn(async () => status({ state: "reserved", live: true })),
    };
    expect((await waitForDiscoverReady(warm, { maxWaitMs: 20, pollMs: 5 })).ready).toBe(true);
    expect(isRecentlyDiscoverReady()).toBe(true);

    // Hop has since dropped: the fast path still answers immediately, and the
    // search itself re-verifies — no 8s extra delay for the user.
    const cold = offClient();
    const startedAt = Date.now();
    const result = await waitForDiscoverReady(cold, { maxWaitMs: 5_000, pollMs: 50 });
    expect(result.ready).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(cold.getCircuitReservationStatus).toHaveBeenCalledTimes(1);
  });

  it("cold start (nothing remembered) still polls to the deadline", async () => {
    expect(isRecentlyDiscoverReady()).toBe(false);
    const client = offClient();
    const result = await waitForDiscoverReady(client, { maxWaitMs: 60, pollMs: 20 });
    expect(result.ready).toBe(false);
    expect(client.getCircuitReservationStatus.mock.calls.length).toBeGreaterThan(1);
  });

  it("memo expires after the window", () => {
    const now = 1_000_000;
    noteDiscoverReady(now);
    expect(isRecentlyDiscoverReady(now + RECENTLY_READY_WINDOW_MS)).toBe(true);
    expect(isRecentlyDiscoverReady(now + RECENTLY_READY_WINDOW_MS + 1)).toBe(false);
  });
});
