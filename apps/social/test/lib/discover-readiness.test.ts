import { describe, expect, it, vi } from "vitest";
import {
  isCircuitReservationReady,
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

describe("discover-readiness", () => {
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
    const client = {
      getCircuitReservationStatus: vi.fn(async () => status({ state: "off" })),
    };
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
});
