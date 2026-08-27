/**
 * Phase 60D — worker attempt receipt store.
 */
import { describe, expect, it } from "vitest";
import { WorkerAttemptReceiptStore } from "../src/worker-attempt-receipt-store.js";
import type { TaskChainPartialPayload } from "@envoymesh/protocol";

const finalPartial = {
  partial: {
    version: "0.1" as const,
    subtaskId: "step_1",
    chainId: "chain_1",
    workerPeerId: "envoy_worker",
    seq: 2,
    isFinal: true,
    note: "done",
    createdAt: "2030-01-01T00:00:02.000Z",
  },
} as TaskChainPartialPayload;

describe("WorkerAttemptReceiptStore", () => {
  it("upserts and builds reports including unknown", () => {
    const store = new WorkerAttemptReceiptStore();
    store.upsert({
      chainId: "chain_1",
      attemptId: "attempt_1",
      subtaskId: "step_1",
      state: "running",
      lastPartialSeq: 1,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const reports = store.buildReports({
      chainId: "chain_1",
      knownAttempts: [
        { attemptId: "attempt_1", subtaskId: "step_1" },
        { attemptId: "attempt_missing", subtaskId: "step_2" },
      ],
      now: new Date("2030-01-01T00:00:01.000Z"),
    });
    expect(reports).toHaveLength(2);
    expect(reports[0]?.state).toBe("running");
    expect(reports[0]?.lastPartialSeq).toBe(1);
    expect(reports[1]?.state).toBe("unknown");
  });

  it("does not downgrade final to running", () => {
    const store = new WorkerAttemptReceiptStore();
    store.upsert({
      chainId: "chain_1",
      attemptId: "attempt_1",
      subtaskId: "step_1",
      state: "final",
      finalPartial,
      lastPartialSeq: 2,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    store.upsert({
      chainId: "chain_1",
      attemptId: "attempt_1",
      subtaskId: "step_1",
      state: "running",
      lastPartialSeq: 1,
      now: new Date("2030-01-01T00:00:01.000Z"),
    });
    const receipt = store.get("chain_1", "attempt_1");
    expect(receipt?.state).toBe("final");
    expect(receipt?.lastPartialSeq).toBe(2);
    expect(receipt?.finalPartial).toBeTruthy();
  });

  it("prunes expired receipts", () => {
    const store = new WorkerAttemptReceiptStore();
    store.upsert({
      chainId: "chain_1",
      attemptId: "attempt_old",
      subtaskId: "step_1",
      state: "accepted",
      now: new Date("2020-01-01T00:00:00.000Z"),
      mandateExpiresAt: "2020-01-01T01:00:00.000Z",
    });
    expect(store.prune(new Date("2030-01-01T00:00:00.000Z"))).toBe(1);
    expect(store.size()).toBe(0);
  });
});
