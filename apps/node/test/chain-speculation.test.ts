/**
 * Phase 60E — speculative attempt helpers.
 */
import { describe, expect, it } from "vitest";
import { ChainMandateSignedSchema } from "@envoymesh/protocol";
import { createChainState } from "../src/chain-orchestrator.js";
import {
  createSpeculativeAttempt,
  decideSpeculationForSubtask,
  selectAmongSpeculativeFinals,
} from "../src/chain-speculation.js";

function makeState(criticality: "normal" | "high" = "high") {
  const mandate = ChainMandateSignedSchema.parse({
    version: "0.1",
    chainMandateId: "chainmandate_spec_1",
    chainId: "chain_spec_1",
    issuerOwnerId: "envoy:owner:a",
    orchestratorOwnerId: "envoy:owner:a",
    maxChainCostUsd: 20,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2030-01-02T00:00:00.000Z",
    createdAt: "2030-01-01T00:00:00.000Z",
    signature: "stub",
    criticality,
    maxParallelAttemptsPerStep: 2,
    teamStrategyId: "highest-confidence",
    speculationEnabled: true,
  });
  return createChainState(mandate, { awardMode: "direct", goal: "speculate" });
}

describe("chain-speculation helpers", () => {
  it("allows immediate_dual for highest-confidence when gates pass", () => {
    const state = makeState("high");
    const decision = decideSpeculationForSubtask({
      state,
      strategyId: "highest-confidence",
      maxAttemptsPerStep: 2,
      independentWorkerCount: 2,
      disclosureAllowed: true,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.mode).toBe("immediate_dual");
  });

  it("creates speculative sibling and selects cheaper equivalent final", () => {
    const state = makeState("high");
    const primary = createSpeculativeAttempt(state, {
      subtaskId: "step_1",
      workerPeerId: "worker_a",
      acceptedCostUsd: 3,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    // Override role for primary-like attempt after create (helper always speculative).
    primary.role = "primary";
    const speculative = createSpeculativeAttempt(state, {
      subtaskId: "step_1",
      workerPeerId: "worker_b",
      acceptedCostUsd: 1,
      now: new Date("2030-01-01T00:00:01.000Z"),
    });
    primary.state = "final_received";
    speculative.state = "final_received";
    const payload = {
      partial: {
        version: "0.1" as const,
        subtaskId: "step_1",
        chainId: "chain_spec_1",
        workerPeerId: "worker_b",
        seq: 1,
        isFinal: true,
        note: "same answer",
        createdAt: "2030-01-01T00:00:02.000Z",
      },
    };
    state.partials.set("step_1", payload);
    state.partialsByAttempt.set(primary.attemptId, {
      partial: { ...payload.partial, workerPeerId: "worker_a" },
    });
    state.partialsByAttempt.set(speculative.attemptId, payload);
    const result = selectAmongSpeculativeFinals(state, "step_1");
    expect(result.selectedAttemptId).toBe(speculative.attemptId);
    expect(result.reason).toMatch(/equivalent_|single_pass/);
  });
});
