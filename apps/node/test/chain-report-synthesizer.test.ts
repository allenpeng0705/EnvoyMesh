/**
 * Phase 40 — chain-report-synthesizer tests.
 *
 * Covers the four aggregation kinds and the budget pre-flight integration:
 * - concatenate: text-only join with no LLM cost
 * - weighted_concat: composite artifact with normalized weights
 * - merge_structured: requires llmMerge; fails with merge_llm_unavailable
 *   when missing; succeeds when llmMerge returns ok
 * - owner_review: emits a placeholder summary, no synthesis cost
 * - preflight: rejects synthesis when the ledger's preflight fails
 * - ledger.recordSynthesisSpend idempotency
 * - empty contributions: returns no_contributions
 * - cost estimation: zero for concatenate / weighted_concat / owner_review;
 *   proportional to total chars for merge_structured
 * - normalized weights sum to 1.0
 */

import { describe, expect, it } from "vitest";

import {
  SYNTHESIS_DEFAULT_KIND,
  estimateSynthesisCostUsd,
  synthesizeChainReport,
  type WorkerContribution,
} from "../src/chain-report-synthesizer.js";
import { createChainBudgetLedger } from "../src/chain-budget-ledger.js";
import {
  ChainSubtaskAwardSchema,
  type ChainMandate,
} from "@envoymesh/protocol";

const NOW = "2026-06-18T00:00:00.000Z";

function mandate(overrides: Partial<ChainMandate> = {}): ChainMandate {
  return {
    version: "0.1",
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    issuerOwnerId: "envoy:owner:orchestrator",
    orchestratorOwnerId: "envoy:owner:orchestrator",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW,
    signature: "stub",
    ...overrides,
  };
}

function award(overrides: Partial<{ subtaskId: string; acceptedCostUsd: number }> = {}) {
  return ChainSubtaskAwardSchema.parse({
    version: "0.1",
    subtaskId: overrides.subtaskId ?? "subtask_a",
    chainId: "chain_test-1",
    workerPeerId: "12D3KooW-w1",
    negotiationRound: 1,
    acceptedCostUsd: overrides.acceptedCostUsd ?? 1,
    deadlineAt: "2026-06-18T01:00:00.000Z",
    createdAt: NOW,
  });
}

function contribution(
  subtaskId: string,
  text: string,
  confidence: number,
  overrides: Partial<{ workerPeerId: string; acceptedCostUsd: number }> = {},
): WorkerContribution {
  return {
    subtaskId,
    workerPeerId: overrides.workerPeerId ?? `12D3KooW-${subtaskId}`,
    workerOwnerId: "envoy:owner:worker",
    text,
    confidence,
    award: award({ subtaskId, acceptedCostUsd: overrides.acceptedCostUsd ?? 1 }),
  };
}

describe("estimateSynthesisCostUsd", () => {
  it("returns 0 for concatenate / weighted_concat / owner_review", () => {
    const cs: WorkerContribution[] = [contribution("subtask_a", "hello", 0.5)];
    expect(estimateSynthesisCostUsd(cs, "concatenate")).toBe(0);
    expect(estimateSynthesisCostUsd(cs, "weighted_concat")).toBe(0);
    expect(estimateSynthesisCostUsd(cs, "owner_review")).toBe(0);
  });

  it("scales with total chars for merge_structured", () => {
    const cs: WorkerContribution[] = [
      contribution("subtask_a", "a".repeat(1000), 0.5),
      contribution("subtask_b", "b".repeat(1000), 0.5),
    ];
    const cost = estimateSynthesisCostUsd(cs, "merge_structured");
    // 2000 chars * 1e-6 = 0.002 → clamped to min 0.01
    expect(cost).toBeGreaterThanOrEqual(0.01);
  });
});

describe("synthesizeChainReport", () => {
  it("concatenate: uses last contribution as the final report", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [
        contribution("subtask_a", "first answer", 0.5),
        contribution(
          "subtask_b",
          "scratch\n\n```job_result\n# Final brief\n\nDone.\n```",
          0.7,
        ),
      ],
      kind: "concatenate",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usedKind).toBe("concatenate");
    expect(r.report.executiveSummary).toContain("# Final brief");
    expect(r.report.executiveSummary).not.toContain("first answer");
    expect(r.report.sections.some((s) => s.heading.startsWith("Working notes"))).toBe(true);
    expect(r.compositeArtifact).toBeUndefined();
    expect(r.actualSynthesisCostUsd).toBe(0);
    expect(r.report.chainSummary.workerCount).toBe(2);
  });

  it("weighted_concat: emits a composite artifact with normalized weights", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [
        contribution("subtask_a", "first", 1.0),
        contribution("subtask_b", "second", 1.0),
        contribution("subtask_c", "third", 1.0),
      ],
      kind: "weighted_concat",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usedKind).toBe("weighted_concat");
    expect(r.compositeArtifact).toBeDefined();
    const composite = r.compositeArtifact!;
    expect(composite.aggregation).toBe("weighted_concat");
    expect(composite.parts.length).toBe(3);
    // Equal confidences → weights sum to 1.
    const sum = composite.parts.reduce((s, p) => s + p.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-3);
  });

  it("weighted_concat: confidence weighting favours high-confidence worker", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [contribution("subtask_a", "low", 0.2), contribution("subtask_b", "high", 0.8)],
      kind: "weighted_concat",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parts = r.compositeArtifact!.parts;
    expect(parts[1].weight).toBeGreaterThan(parts[0].weight);
  });

  it("merge_structured: fails with merge_llm_unavailable when llmMerge is missing", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [contribution("subtask_a", "x", 0.5)],
      kind: "merge_structured",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("merge_llm_unavailable");
  });

  it("merge_structured: succeeds when llmMerge returns ok", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate({ maxChainCostUsd: 5 }),
      contributions: [
        contribution("subtask_a", JSON.stringify({ name: "alpha" }), 0.5),
        contribution("subtask_b", JSON.stringify({ name: "beta" }), 0.5),
      ],
      kind: "merge_structured",
      llmMerge: async () => ({ ok: true, mergedJson: { merged: true }, costUsd: 0.1 }),
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usedKind).toBe("merge_structured");
    expect(r.actualSynthesisCostUsd).toBe(0.1);
    expect(ledger.snapshot().synthesisSpendUsd).toBe(0.1);
  });

  it("merge_structured: returns merge_llm_failed when the LLM call fails", async () => {
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 5 }));
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate({ maxChainCostUsd: 5 }),
      contributions: [contribution("subtask_a", "x", 0.5)],
      kind: "merge_structured",
      llmMerge: async () => ({ ok: false, reason: "rate-limited" }),
      now: new Date(NOW),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("merge_llm_failed");
  });

  it("owner_review: emits a placeholder summary without synthesis cost", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [contribution("subtask_a", "x", 0.5)],
      kind: "owner_review",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usedKind).toBe("owner_review");
    expect(r.report.executiveSummary).toMatch(/Owner review/);
    expect(r.actualSynthesisCostUsd).toBe(0);
  });

  it("returns no_contributions when there are no contributions", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [],
      kind: "concatenate",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_contributions");
  });

  it("preflight: refuses synthesis when the ledger preflight fails", async () => {
    // Reserve the entire budget with a worker award so synthesis has no headroom.
    const ledger = createChainBudgetLedger(mandate({ maxChainCostUsd: 0.05 }));
    await ledger.reserve("worker1", "12D3KooW-w1", 0.05);
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate({ maxChainCostUsd: 0.05 }),
      contributions: [contribution("subtask_a", "x".repeat(10000), 0.5)],
      kind: "merge_structured",
      llmMerge: async () => ({ ok: true, mergedJson: {}, costUsd: 0.01 }),
      now: new Date(NOW),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("preflight_failed");
    // Ledger state should be unchanged — no synthesis spend recorded.
    expect(ledger.snapshot().synthesisSpendUsd).toBe(0);
  });

  it("synthesized report contains a citation per contribution", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [
        contribution("subtask_a", "a", 0.5),
        contribution("subtask_b", "b", 0.7),
      ],
      kind: "concatenate",
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const subSections = r.report.sections.filter((s) => s.heading.startsWith("Working notes"));
    expect(subSections.length).toBe(2);
    for (const s of subSections) {
      expect(s.citations.length).toBe(1);
    }
  });

  it("uses concatenate by default when no kind is specified", async () => {
    const ledger = createChainBudgetLedger(mandate());
    const r = await synthesizeChainReport(ledger, {
      chainMandate: mandate(),
      contributions: [contribution("subtask_a", "x", 0.5)],
      now: new Date(NOW),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usedKind).toBe(SYNTHESIS_DEFAULT_KIND);
  });
});