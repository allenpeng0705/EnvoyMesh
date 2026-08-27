/**
 * Phase 60B — WorkerLeaseStore accept/revoke/TTL/replay tests.
 */
import { describe, expect, it } from "vitest";
import { createAgentWorkerLeasePayload } from "@envoymesh/protocol";
import {
  WORKER_LEASE_CLOCK_SKEW_MS,
  WORKER_LEASE_MAX_TTL_MS,
  WorkerLeaseStore,
  leaseRefreshIntervalMs,
} from "../src/worker-lease-store.js";

function lease(overrides: Partial<ReturnType<typeof createAgentWorkerLeasePayload>> = {}) {
  const now = Date.parse("2030-01-01T00:00:00.000Z");
  return createAgentWorkerLeasePayload({
    leaseId: "lease_1",
    workerPeerId: "envoy_worker_a",
    ownerId: "envoy:owner:a",
    issuedAt: new Date(now).toISOString(),
    notBefore: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    sequence: 1,
    runtimes: [
      {
        runtime: "envoy-harness",
        ready: true,
        capacity: { maxConcurrent: 1, availableSlots: 1, queueDepth: 0 },
        skillIds: ["research"],
      },
    ],
    connectivity: { direct: true, relay: false },
    nonce: "0123456789abcdef",
    ...overrides,
  });
}

describe("WorkerLeaseStore", () => {
  it("accepts a fresh lease and reports ready", () => {
    const store = new WorkerLeaseStore();
    const now = new Date("2030-01-01T00:00:05.000Z");
    expect(store.accept(lease(), { now }).ok).toBe(true);
    expect(store.getAvailability("envoy_worker_a", now)).toMatchObject({
      state: "ready",
      source: "lease",
      leaseId: "lease_1",
    });
  });

  it("rejects stale sequence and duplicate sequence/replay", () => {
    const store = new WorkerLeaseStore();
    const now = new Date("2030-01-01T00:00:05.000Z");
    expect(store.accept(lease({ sequence: 2, nonce: "aaaaaaaaaaaaaaaa" }), { now }).ok).toBe(true);
    expect(store.accept(lease({ sequence: 1, nonce: "bbbbbbbbbbbbbbbb" }), { now }).ok).toBe(false);
    expect(store.accept(lease({ sequence: 2, nonce: "aaaaaaaaaaaaaaaa" }), { now })).toMatchObject({
      ok: false,
      reason: "replay",
    });
    expect(store.accept(lease({ sequence: 2, nonce: "cccccccccccccccc" }), { now })).toMatchObject({
      ok: false,
      reason: "duplicate_sequence",
    });
  });

  it("rejects overlong TTL and already-expired leases", () => {
    const store = new WorkerLeaseStore();
    const now = new Date("2030-01-01T00:00:05.000Z");
    const issued = Date.parse("2030-01-01T00:00:00.000Z");
    expect(
      store.accept(
        lease({
          expiresAt: new Date(issued + WORKER_LEASE_MAX_TTL_MS + 1).toISOString(),
          nonce: "dddddddddddddddd",
        }),
        { now },
      ),
    ).toMatchObject({ ok: false, reason: "ttl_too_long" });
    expect(
      store.accept(
        lease({
          expiresAt: new Date(issued - 1).toISOString(),
          nonce: "eeeeeeeeeeeeeeee",
        }),
        { now },
      ),
    ).toMatchObject({ ok: false, reason: "expires_before_start" });
  });

  it("honors clock skew without extending expiresAt", () => {
    const store = new WorkerLeaseStore();
    const issued = Date.parse("2030-01-01T00:00:00.000Z");
    const expires = issued + 30_000;
    expect(
      store.accept(lease({ expiresAt: new Date(expires).toISOString() }), {
        now: new Date(issued + 5_000),
      }).ok,
    ).toBe(true);
    // Within skew after expiry → still ready.
    expect(
      store.getAvailability(
        "envoy_worker_a",
        new Date(expires + WORKER_LEASE_CLOCK_SKEW_MS - 1),
      ).state,
    ).toBe("ready");
    // Past skew → expired.
    expect(
      store.getAvailability(
        "envoy_worker_a",
        new Date(expires + WORKER_LEASE_CLOCK_SKEW_MS + 1),
      ).state,
    ).toBe("expired");
  });

  it("rejects stale leases after revoke (no resurrection)", () => {
    const store = new WorkerLeaseStore();
    const now = new Date("2030-01-01T00:00:05.000Z");
    expect(store.accept(lease({ sequence: 3, nonce: "ffffffffffffffff" }), { now }).ok).toBe(true);
    expect(
      store.revoke({ workerPeerId: "envoy_worker_a", leaseId: "lease_1", sequence: 3 }),
    ).toMatchObject({ ok: true, cleared: true });
    expect(
      store.accept(lease({ sequence: 3, nonce: "gggggggggggggggg" }), { now }),
    ).toMatchObject({ ok: false, reason: "revoked_sequence" });
    expect(
      store.accept(lease({ sequence: 2, nonce: "hhhhhhhhhhhhhhhh" }), { now }),
    ).toMatchObject({ ok: false, reason: "stale_sequence" });
    expect(
      store.accept(lease({ sequence: 4, nonce: "iiiiiiiiiiiiiiii" }), { now }).ok,
    ).toBe(true);
    expect(store.getAvailability("envoy_worker_a", now).state).toBe("ready");
  });

  it("revokes when sequence is equal or higher", () => {
    const store = new WorkerLeaseStore();
    const now = new Date("2030-01-01T00:00:05.000Z");
    expect(store.accept(lease({ sequence: 3, nonce: "ffffffffffffffff" }), { now }).ok).toBe(true);
    expect(
      store.revoke({ workerPeerId: "envoy_worker_a", leaseId: "lease_1", sequence: 2 }),
    ).toMatchObject({ ok: false, reason: "stale_sequence" });
    expect(
      store.revoke({ workerPeerId: "envoy_worker_a", leaseId: "lease_1", sequence: 3 }),
    ).toMatchObject({ ok: true, cleared: true });
    expect(store.getAvailability("envoy_worker_a", now).state).toBe("revoked");
  });

  it("caps the store and prefers higher sequence replacement", () => {
    const store = new WorkerLeaseStore(2);
    const now = new Date("2030-01-01T00:00:05.000Z");
    expect(
      store.accept(lease({ workerPeerId: "w1", nonce: "1111111111111111" }), {
        now,
        maxWorkers: 2,
      }).ok,
    ).toBe(true);
    expect(
      store.accept(
        lease({
          workerPeerId: "w2",
          leaseId: "lease_2",
          nonce: "2222222222222222",
        }),
        { now: new Date(now.getTime() + 1), maxWorkers: 2 },
      ).ok,
    ).toBe(true);
    expect(
      store.accept(
        lease({
          workerPeerId: "w3",
          leaseId: "lease_3",
          nonce: "3333333333333333",
        }),
        { now: new Date(now.getTime() + 2), maxWorkers: 2 },
      ).ok,
    ).toBe(true);
    expect(store.size()).toBe(2);
    expect(store.getLease("w1")).toBeUndefined();
    expect(store.getLease("w3")).toBeDefined();
  });

  it("computes deterministic refresh jitter from peer id", () => {
    const a = leaseRefreshIntervalMs("peer-a");
    const b = leaseRefreshIntervalMs("peer-a");
    const c = leaseRefreshIntervalMs("peer-b");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(9_000);
    expect(a).toBeLessThanOrEqual(11_000);
    expect(c).toBeGreaterThanOrEqual(9_000);
    expect(c).toBeLessThanOrEqual(11_000);
  });
});
