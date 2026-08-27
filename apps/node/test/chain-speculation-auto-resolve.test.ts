/**
 * Phase 63 — `autoResolveSpeculativeDisagreement` + speculationEnabled gate.
 *
 * Covers the new behavior:
 *   1. evaluateChainSpeculation returns `off` when `speculationEnabled` is
 *      missing or `false`, regardless of strategy preset.
 *   2. `autoResolveSpeculativeDisagreement` picks the cheaper verified
 *      attempt on `disagree_needs_verify`.
 *   3. `autoResolveSpeculativeDisagreement` returns `auto_reassign` on
 *      `none_pass`.
 *   4. The `chainResolveSpeculation` RPC accepts a new `action: "auto"`.
 *   5. The wire path auto-resolves when
 *      `chainMandate.speculationOnDisagreement === "auto"`, the default.
 *
 * The first three are pure-function unit tests. The last two are
 * source-level guards that pin the public API shape — full integration
 * lives in the lab matrix scenarios and the existing speculation wire
 * tests, which exercise both branches.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateChainSpeculation,
  speculationModeForStrategy,
} from "@envoymesh/api";
import { ChainMandateSignedSchema } from "@envoymesh/protocol";
import { createChainState } from "../src/chain-orchestrator.js";
import {
  autoResolveSpeculativeDisagreement,
  classifySpeculativeFinalSelection,
  selectAmongSpeculativeFinals,
} from "../src/chain-speculation.js";

const IMPL_PROVIDER = resolve(__dirname, "../src/node-service-impl.ts");
const IMPL_ORCHESTRATION = resolve(
  __dirname,
  "../src/node-service-chain-orchestration.ts",
);

function readSlice(path: string, fromLine: number, toLine: number): string {
  return readFileSync(path, "utf8")
    .split("\n")
    .slice(fromLine - 1, toLine)
    .join("\n");
}

function makeSpecState() {
  const mandate = ChainMandateSignedSchema.parse({
    version: "0.1",
    chainMandateId: "chainmandate_auto_1",
    chainId: "chain_auto_1",
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
    criticality: "high",
    maxParallelAttemptsPerStep: 2,
    teamStrategyId: "highest-confidence",
    speculationEnabled: true,
  });
  return createChainState(mandate, { awardMode: "direct", goal: "auto-resolve" });
}

describe("speculationEnabled gate (Phase 63)", () => {
  it("evaluateChainSpeculation returns off when speculationEnabled is missing", () => {
    const decision = evaluateChainSpeculation({
      strategyId: "highest-confidence",
      maxAttemptsPerStep: 2,
      maxParallelAttemptsPerStep: 2,
      criticality: "high",
      worstCaseCostUsd: 1,
      remainingBudgetUsd: 10,
      disclosureAllowed: true,
      independentWorkerCount: 2,
      hasNonIdempotentSideEffects: false,
      // speculationEnabled intentionally omitted
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("owner_disabled");
  });

  it("evaluateChainSpeculation returns off when speculationEnabled is false", () => {
    const decision = evaluateChainSpeculation({
      strategyId: "highest-confidence",
      maxAttemptsPerStep: 2,
      maxParallelAttemptsPerStep: 2,
      criticality: "high",
      worstCaseCostUsd: 1,
      remainingBudgetUsd: 10,
      disclosureAllowed: true,
      independentWorkerCount: 2,
      hasNonIdempotentSideEffects: false,
      speculationEnabled: false,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("owner_disabled");
  });

  it("strategy preset still maps to immediate_dual (off gate is upstream)", () => {
    // speculationModeForStrategy is a pure strategy lookup; the
    // owner_disabled gate is enforced one level up in
    // evaluateChainSpeculation. The preset map is unchanged.
    expect(speculationModeForStrategy("highest-confidence")).toBe(
      "immediate_dual",
    );
    expect(speculationModeForStrategy("fastest")).toBe("hedged");
    expect(speculationModeForStrategy("balanced")).toBe("verify_only");
  });

  it("evaluateChainSpeculation returns immediate_dual when owner enabled + strategy + gates pass", () => {
    const decision = evaluateChainSpeculation({
      strategyId: "highest-confidence",
      maxAttemptsPerStep: 2,
      maxParallelAttemptsPerStep: 2,
      criticality: "high",
      worstCaseCostUsd: 1,
      remainingBudgetUsd: 10,
      disclosureAllowed: true,
      independentWorkerCount: 2,
      hasNonIdempotentSideEffects: false,
      speculationEnabled: true,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.mode).toBe("immediate_dual");
  });
});

describe("autoResolveSpeculativeDisagreement (Phase 63)", () => {
  it("picks the cheaper verified attempt on disagree_needs_verify", () => {
    const state = makeSpecState();
    const cheaper = {
      attemptId: "attempt_cheap",
      chainId: "chain_auto_1",
      subtaskId: "step_1",
      workerPeerId: "worker_b",
      role: "speculative" as const,
      state: "final_received" as const,
      attemptNumber: 2,
      acceptedCostUsd: 1,
      createdAt: "2030-01-01T00:00:01.000Z",
      updatedAt: "2030-01-01T00:00:01.000Z",
    };
    const expensive = {
      ...cheaper,
      attemptId: "attempt_expensive",
      workerPeerId: "worker_a",
      role: "primary" as const,
      acceptedCostUsd: 5,
      updatedAt: "2030-01-01T00:00:02.000Z",
    };
    state.attempts.set(cheaper.attemptId, cheaper);
    state.attempts.set(expensive.attemptId, expensive);
    const auto = autoResolveSpeculativeDisagreement({
      state,
      subtaskId: "step_1",
      selectionReason: "disagree_needs_verify",
    });
    expect(auto.ok).toBe(true);
    if (auto.ok) {
      expect(auto.action).toBe("auto_pick");
      expect(auto.selectedAttemptId).toBe("attempt_cheap");
    }
  });

  it("ties on cost — picks the earlier final (deterministic tie-break)", () => {
    const state = makeSpecState();
    const earlier = {
      attemptId: "attempt_earlier",
      chainId: "chain_auto_1",
      subtaskId: "step_1",
      workerPeerId: "worker_a",
      role: "primary" as const,
      state: "final_received" as const,
      attemptNumber: 1,
      acceptedCostUsd: 2,
      createdAt: "2030-01-01T00:00:01.000Z",
      updatedAt: "2030-01-01T00:00:01.000Z",
    };
    const later = {
      ...earlier,
      attemptId: "attempt_later",
      workerPeerId: "worker_b",
      role: "speculative" as const,
      updatedAt: "2030-01-01T00:00:02.000Z",
    };
    state.attempts.set(earlier.attemptId, earlier);
    state.attempts.set(later.attemptId, later);
    const auto = autoResolveSpeculativeDisagreement({
      state,
      subtaskId: "step_1",
      selectionReason: "disagree_needs_verify",
    });
    expect(auto.ok).toBe(true);
    if (auto.ok) expect(auto.selectedAttemptId).toBe("attempt_earlier");
  });

  it("returns auto_reassign on none_pass", () => {
    const state = makeSpecState();
    const auto = autoResolveSpeculativeDisagreement({
      state,
      subtaskId: "step_1",
      selectionReason: "none_pass",
    });
    expect(auto.ok).toBe(true);
    if (auto.ok) expect(auto.action).toBe("auto_reassign");
  });

  it("returns ok=false when no verified finals (caller must fall back)", () => {
    const state = makeSpecState();
    // Subtask has no final_received attempts.
    const auto = autoResolveSpeculativeDisagreement({
      state,
      subtaskId: "step_1",
      selectionReason: "disagree_needs_verify",
    });
    expect(auto.ok).toBe(false);
  });
});

describe("classifySpeculativeFinalSelection (Phase 63)", () => {
  it("returns none_pass when both finals fail engine markers", () => {
    const state = makeSpecState();
    const now = new Date("2030-01-01T00:00:00.000Z");
    for (const [attemptId, workerPeerId, note] of [
      ["attempt_a", "worker_a", "AN_ENGINE_FAIL: timeout"],
      ["attempt_b", "worker_b", "AN_ENGINE_FAIL: timeout"],
    ] as const) {
      state.partialsByAttempt.set(attemptId, {
        partial: {
          version: "0.1",
          subtaskId: "step_1",
          chainId: "chain_auto_1",
          workerPeerId,
          seq: 1,
          isFinal: true,
          note,
          confidence: 0.1,
          createdAt: now.toISOString(),
        },
      } as never);
      state.attempts.set(attemptId, {
        attemptId,
        chainId: "chain_auto_1",
        subtaskId: "step_1",
        workerPeerId,
        role: attemptId === "attempt_a" ? "primary" : "speculative",
        state: "final_received",
        attemptNumber: attemptId === "attempt_a" ? 1 : 2,
        acceptedCostUsd: 2,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
    const decision = classifySpeculativeFinalSelection(state, "step_1", {
      verificationPassed: ({ partial }) => {
        if (!partial?.partial.isFinal) return false;
        return !partial.partial.note?.startsWith("AN_ENGINE_FAIL:");
      },
    });
    expect(decision.reason).toBe("none_pass");
  });
});

describe("selectAmongSpeculativeFinals — disagreement classification (Phase 63 wiring)", () => {
  it("returns disagree_needs_verify for two verified finals with different fingerprints", () => {
    const state = makeSpecState();
    const partials: Array<Parameters<typeof selectAmongSpeculativeFinals>>[0] = {
      state,
      subtaskId: "step_1",
    };
    // Build two attempts with different fingerprints.
    const now = new Date("2030-01-01T00:00:00.000Z");
    state.partialsByAttempt.set("attempt_a", {
      partial: {
        version: "0.1",
        subtaskId: "step_1",
        chainId: "chain_auto_1",
        workerPeerId: "worker_a",
        seq: 1,
        isFinal: true,
        note: "answer A",
        confidence: 0.9,
        createdAt: now.toISOString(),
      },
    } as never);
    state.partialsByAttempt.set("attempt_b", {
      partial: {
        version: "0.1",
        subtaskId: "step_1",
        chainId: "chain_auto_1",
        workerPeerId: "worker_b",
        seq: 1,
        isFinal: true,
        note: "answer B",
        confidence: 0.9,
        createdAt: now.toISOString(),
      },
    } as never);
    state.attempts.set("attempt_a", {
      attemptId: "attempt_a",
      chainId: "chain_auto_1",
      subtaskId: "step_1",
      workerPeerId: "worker_a",
      role: "primary",
      state: "final_received",
      attemptNumber: 1,
      acceptedCostUsd: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    state.attempts.set("attempt_b", {
      attemptId: "attempt_b",
      chainId: "chain_auto_1",
      subtaskId: "step_1",
      workerPeerId: "worker_b",
      role: "speculative",
      state: "final_received",
      attemptNumber: 2,
      acceptedCostUsd: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    const result = selectAmongSpeculativeFinals(state, "step_1");
    expect(result.selectedAttemptId).toBeUndefined();
    expect(result.reason).toBe("disagree_needs_verify");
    void partials;
  });
});

describe("chainResolveSpeculation RPC + handler (Phase 63 source-level)", () => {
  it("RPC params accept the new 'auto' action", () => {
    const text = readFileSync(
      resolve(__dirname, "../../../packages/api/src/ws-protocol.ts"),
      "utf8",
    );
    expect(text).toMatch(
      /action:\s*"pick"\s*\|\s*"reassign"\s*\|\s*"auto"/,
    );
  });

  it("handler branches on params.action === 'auto' (source-level)", () => {
    const text = readFileSync(IMPL_ORCHESTRATION, "utf8");
    // The handler must check `action === "auto"` before the reassign
    // branch (which is a single condition further down).
    const autoIdx = text.indexOf('params.action === "auto"');
    const reassignIdx = text.lastIndexOf("reassignSubtaskOwnerAction");
    expect(autoIdx).toBeGreaterThan(0);
    expect(autoIdx).toBeLessThan(reassignIdx);
  });

  it("handler emits chain state after auto-resolve", () => {
    const text = readFileSync(IMPL_ORCHESTRATION, "utf8");
    // The auto branch should call _emitChainState at the end so the
    // mobile UI receives the resolved state via chain:state push.
    const autoIdx = text.indexOf('params.action === "auto"');
    const nextReassignIdx = text.indexOf(
      "reassignSubtaskOwnerAction",
      autoIdx,
    );
    const slice = text.slice(autoIdx, nextReassignIdx > 0 ? nextReassignIdx : autoIdx + 1500);
    expect(slice).toContain("_emitChainState");
  });
});

describe("chain-speculation-wire auto-resolve path (Phase 63 source-level)", () => {
  it("wire path checks chainMandate.speculationOnDisagreement === 'auto' before falling through to block", () => {
    const text = readFileSync(
      resolve(__dirname, "../src/chain-speculation-wire.ts"),
      "utf8",
    );
    expect(text).toContain("speculationOnDisagreement");
    expect(text).toMatch(/onDisagreement\s*===\s*["']auto["']/);
  });

  it("wire path imports autoResolveSpeculativeDisagreement helper", () => {
    const text = readFileSync(
      resolve(__dirname, "../src/chain-speculation-wire.ts"),
      "utf8",
    );
    expect(text).toContain("autoResolveSpeculativeDisagreement");
  });
});

void IMPL_PROVIDER; // keep import alive for potential future use
