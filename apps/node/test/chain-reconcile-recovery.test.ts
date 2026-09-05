/**
 * Phase 60D — assigner recovery helpers (RECOVERING, reconcile apply, dedup).
 */
import { describe, expect, it } from "vitest";
import {
  ChainMandateSignedSchema,
  type TaskChainPartialPayload,
} from "@envoymesh/protocol";
import { createChainState, type ChainAttemptState } from "../src/chain-orchestrator.js";
import {
  applyReconcileReports,
  beginChainRecovery,
  buildReconcileRequest,
  isChainRecovering,
  partialDedupKey,
  tickChainRecovery,
} from "../src/chain-reconcile-recovery.js";

function makeState() {
  const mandate = ChainMandateSignedSchema.parse({
    version: "0.1",
    chainMandateId: "chainmandate_1",
    chainId: "chain_1",
    issuerOwnerId: "envoy:owner:a",
    orchestratorOwnerId: "envoy:owner:a",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 2,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2030-01-02T00:00:00.000Z",
    createdAt: "2030-01-01T00:00:00.000Z",
    signature: "stub",
  });
  const state = createChainState(mandate, { awardMode: "direct", goal: "test" });
  const attempt: ChainAttemptState = {
    attemptId: "attempt_1",
    chainId: "chain_1",
    subtaskId: "step_1",
    workerPeerId: "envoy_worker_b",
    role: "primary",
    state: "running",
    attemptNumber: 1,
    acceptedCostUsd: 1,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
  };
  state.attempts.set(attempt.attemptId, attempt);
  state.awards.set("step_1", {
    version: "0.1",
    awardId: "award_1",
    chainId: "chain_1",
    chainMandateId: "chainmandate_1",
    subtaskId: "step_1",
    workerPeerId: "envoy_worker_b",
    acceptedCostUsd: 1,
    negotiationRound: 1,
    awardedAt: "2030-01-01T00:00:00.000Z",
  } as never);
  return state;
}

const finalPartial = {
  partial: {
    version: "0.1" as const,
    subtaskId: "step_1",
    chainId: "chain_1",
    workerPeerId: "envoy_worker_b",
    seq: 3,
    isFinal: true,
    note: "finished",
    createdAt: "2030-01-01T00:00:03.000Z",
  },
} as TaskChainPartialPayload;

describe("chain-reconcile-recovery", () => {
  it("begins RECOVERING when in-flight attempts exist", () => {
    const state = makeState();
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_1",
      now: new Date("2030-01-01T00:00:00.000Z"),
      graceMs: 1_000,
    });
    expect(isChainRecovering(recovery)).toBe(true);
    expect(recovery.peers["envoy_worker_b"]?.status).toBe("pending");
    expect(recovery.graceDeadlineAt).toBe("2030-01-01T00:00:01.000Z");
  });

  it("builds reconcile request for the worker's attempts", () => {
    const state = makeState();
    const req = buildReconcileRequest({
      state,
      orchestratorEpoch: "orch_1",
      workerPeerId: "envoy_worker_b",
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(req.knownAttempts).toHaveLength(1);
    expect(req.knownAttempts[0]?.attemptId).toBe("attempt_1");
  });

  it("ingests recovered final once and dedups by key", () => {
    const state = makeState();
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_1",
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const seen = new Set<string>();
    const first = applyReconcileReports({
      state,
      recovery,
      workerPeerId: "envoy_worker_b",
      workerEpoch: "worker_1",
      reports: [
        {
          attemptId: "attempt_1",
          subtaskId: "step_1",
          state: "final",
          lastPartialSeq: 3,
          finalPartial,
        },
      ],
      seenPartialKeys: seen,
      now: new Date("2030-01-01T00:00:04.000Z"),
    });
    expect(first.ingestedFinals).toEqual(["attempt_1"]);
    expect(state.partials.get("step_1")?.partial.isFinal).toBe(true);
    expect(state.attempts.get("attempt_1")?.state).toBe("final_received");
    expect(seen.has(partialDedupKey("attempt_1", finalPartial))).toBe(true);

    const second = applyReconcileReports({
      state,
      recovery,
      workerPeerId: "envoy_worker_b",
      workerEpoch: "worker_1",
      reports: [
        {
          attemptId: "attempt_1",
          subtaskId: "step_1",
          state: "final",
          lastPartialSeq: 3,
          finalPartial,
        },
      ],
      seenPartialKeys: seen,
      now: new Date("2030-01-01T00:00:05.000Z"),
    });
    expect(second.ingestedFinals).toEqual([]);
  });

  it("resumes running without duplicate accept and exits after grace", () => {
    const state = makeState();
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_1",
      now: new Date("2030-01-01T00:00:00.000Z"),
      graceMs: 1_000,
    });
    applyReconcileReports({
      state,
      recovery,
      workerPeerId: "envoy_worker_b",
      workerEpoch: "worker_1",
      reports: [
        {
          attemptId: "attempt_1",
          subtaskId: "step_1",
          state: "running",
          lastPartialSeq: 1,
        },
      ],
      seenPartialKeys: new Set(),
      now: new Date("2030-01-01T00:00:00.500Z"),
    });
    expect(state.lastHeartbeatAt.has("step_1")).toBe(true);
    expect(recovery.peers["envoy_worker_b"]?.status).toBe("reconciled");

    const tick = tickChainRecovery({
      recovery,
      now: new Date("2030-01-01T00:00:02.000Z"),
    });
    expect(tick.done).toBe(true);
    expect(recovery.phase).toBe("running");
  });

  it("times out pending peers after grace", () => {
    const state = makeState();
    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_1",
      now: new Date("2030-01-01T00:00:00.000Z"),
      graceMs: 500,
    });
    const tick = tickChainRecovery({
      recovery,
      now: new Date("2030-01-01T00:00:01.000Z"),
    });
    expect(tick.timedOutPeers).toContain("envoy_worker_b");
    expect(recovery.phase).toBe("running");
  });

  it("seeds missing attempts on reclaim (placeholder replaced by worker receipt)", () => {
    const state = makeState();
    const placeholder = state.attempts.get("attempt_1")!;
    state.attempts.delete("attempt_1");
    state.attempts.set("attempt_reclaim_step_1", {
      ...placeholder,
      attemptId: "attempt_reclaim_step_1",
      lastReason: "reclaim_hydrate",
    });
    state.selectedAttemptBySubtask.set("step_1", "attempt_reclaim_step_1");
    (state.awards.get("step_1") as { attemptId?: string }).attemptId =
      "attempt_reclaim_step_1";

    const recovery = beginChainRecovery({
      state,
      orchestratorEpoch: "orch_reclaim",
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const applied = applyReconcileReports({
      state,
      recovery,
      workerPeerId: "envoy_worker_b",
      workerEpoch: "worker_1",
      reports: [
        {
          attemptId: "attempt_real_99",
          subtaskId: "step_1",
          state: "running",
          lastPartialSeq: 2,
        },
      ],
      seenPartialKeys: new Set(),
      seedMissingAttempts: true,
      now: new Date("2030-01-01T00:00:01.000Z"),
    });
    expect(applied.conflicts).toEqual([]);
    expect(state.attempts.has("attempt_reclaim_step_1")).toBe(false);
    expect(state.attempts.get("attempt_real_99")?.state).toBe("running");
    expect(state.selectedAttemptBySubtask.get("step_1")).toBe("attempt_real_99");
    // Reclaim: running-only receipt must not exit recovery early.
    expect(recovery.peers["envoy_worker_b"]?.status).toBe("pending");
    expect(
      buildReconcileRequest({
        state,
        orchestratorEpoch: "orch_reclaim",
        workerPeerId: "envoy_worker_b",
        requestAllReceipts: true,
      }).knownAttempts,
    ).toEqual([]);
  });
});
