/**
 * Phase 60E — speculative execution policy tests.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateChainSpeculation,
  fingerprintSpeculativeOutput,
  selectSpeculativeFinal,
  speculationModeForStrategy,
} from "../src/chain-speculation.js";

describe("chain-speculation", () => {
  it("maps strategies to modes", () => {
    expect(speculationModeForStrategy("highest-confidence")).toBe("immediate_dual");
    expect(speculationModeForStrategy("fastest")).toBe("hedged");
    expect(speculationModeForStrategy("balanced")).toBe("verify_only");
    expect(speculationModeForStrategy("cheapest")).toBe("off");
  });

  it("rejects side-effecting and budget overruns", () => {
    const base = {
      strategyId: "highest-confidence" as const,
      maxAttemptsPerStep: 2,
      maxParallelAttemptsPerStep: 2,
      criticality: "high" as const,
      worstCaseCostUsd: 5,
      remainingBudgetUsd: 10,
      disclosureAllowed: true,
      independentWorkerCount: 2,
      hasNonIdempotentSideEffects: false,
      speculationEnabled: true,
    };
    expect(evaluateChainSpeculation(base).ok).toBe(true);
    expect(
      evaluateChainSpeculation({ ...base, hasNonIdempotentSideEffects: true }).ok,
    ).toBe(false);
    expect(
      evaluateChainSpeculation({ ...base, worstCaseCostUsd: 20 }).ok,
    ).toBe(false);
    expect(
      evaluateChainSpeculation({ ...base, independentWorkerCount: 1 }).ok,
    ).toBe(false);
  });

  it("requires mandate cap for dual execution", () => {
    const decision = evaluateChainSpeculation({
      strategyId: "highest-confidence",
      maxAttemptsPerStep: 2,
      maxParallelAttemptsPerStep: 1,
      criticality: "high",
      worstCaseCostUsd: 1,
      remainingBudgetUsd: 10,
      disclosureAllowed: true,
      independentWorkerCount: 2,
      hasNonIdempotentSideEffects: false,
      speculationEnabled: true,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("mandate_cap");
  });

  it("selects deterministically and never first-wins on disagreement", () => {
    const single = selectSpeculativeFinal({
      finals: [
        {
          attemptId: "a1",
          acceptedCostUsd: 2,
          finalizedAt: "2030-01-01T00:00:02.000Z",
          outputFingerprint: "x",
          verificationPassed: true,
        },
      ],
    });
    expect(single).toEqual({ selectedAttemptId: "a1", reason: "single_pass" });

    const agree = selectSpeculativeFinal({
      finals: [
        {
          attemptId: "a1",
          acceptedCostUsd: 3,
          finalizedAt: "2030-01-01T00:00:01.000Z",
          outputFingerprint: fingerprintSpeculativeOutput({ note: "same" }),
          verificationPassed: true,
        },
        {
          attemptId: "a2",
          acceptedCostUsd: 1,
          finalizedAt: "2030-01-01T00:00:02.000Z",
          outputFingerprint: fingerprintSpeculativeOutput({ note: "same" }),
          verificationPassed: true,
        },
      ],
    });
    expect(agree).toEqual({ selectedAttemptId: "a2", reason: "equivalent_cheaper" });

    const disagree = selectSpeculativeFinal({
      finals: [
        {
          attemptId: "a1",
          acceptedCostUsd: 1,
          finalizedAt: "2030-01-01T00:00:01.000Z",
          outputFingerprint: "alpha",
          verificationPassed: true,
        },
        {
          attemptId: "a2",
          acceptedCostUsd: 1,
          finalizedAt: "2030-01-01T00:00:02.000Z",
          outputFingerprint: "beta",
          verificationPassed: true,
        },
      ],
    });
    expect(disagree.reason).toBe("disagree_needs_verify");
    expect(disagree.selectedAttemptId).toBeUndefined();
  });
});
