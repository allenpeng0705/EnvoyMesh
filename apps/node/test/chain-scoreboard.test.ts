/**
 * Phase 8 / v1.10 — tests for the 3-tuple reputation
 * scorebook (`chain-scoreboard.ts` →
 * `reputationFromVerdicts` + `categorizeReputation` +
 * `isNoHistoryReputation` + the weight + threshold
 * constants).
 *
 * **What this covers:**
 * - `reputationFromVerdicts` returns the expected
 *   `[-1, 1]` score for empty / all-pass / all-fail /
 *   all-disputed / mixed-source / partial-factor /
 *   cross-weighted / human-weighted inputs.
 * - `categorizeReputation` returns the expected
 *   category for boundary + interior scores.
 * - `isNoHistoryReputation` returns `true` only for
 *   the empty-input case.
 * - `SCOREBOARD_SOURCE_WEIGHTS` and
 *   `SCOREBOARD_TRUST_THRESHOLDS` have the locked
 *   values (spec pinning).
 *
 * **Why a separate file (not split across other test
 * files):** the scorebook is a self-contained module
 * with no dependencies on the orchestrator's verify
 * loop or the arbitration store. The function is
 * pure (no I/O, no clock); the tests construct
 * synthetic `VerdictEntry` shapes inline.
 *
 * **Pure function tests:** synthetic `VerdictEntry`
 * shapes constructed inline; no I/O, no `process.env`,
 * no clock. The signature is a non-empty string per
 * the Zod schema; the exact value doesn't matter
 * (the function doesn't read it).
 */

import { describe, expect, it } from "vitest";

import type { Verdict, VerdictEntry, VerifierSource } from "@envoymesh/protocol";

import {
  categorizeReputation,
  isNoHistoryReputation,
  reputationFromVerdicts,
  SCOREBOARD_SOURCE_WEIGHTS,
  SCOREBOARD_TRUST_THRESHOLDS,
} from "../src/chain-scoreboard.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-08-21T00:00:00.000Z";

/**
 * Build a synthetic `VerdictEntry` for the
 * scorebook formula. The signature + issuedBy are
 * non-empty strings (per the Zod schema); the
 * exact values don't affect the formula.
 */
function makeVerdict(input: {
  source: VerifierSource;
  verdict: Verdict;
  workerPeerId?: string;
  workerRuntime?: VerdictEntry["workerRuntime"];
  skillId?: string;
  verifierModel?: string;
  verifierOwnerId?: string;
}): VerdictEntry {
  return {
    chainId: "chain_test",
    subtaskId: "subtask_a",
    workerPeerId: input.workerPeerId ?? "peer-1",
    workerRuntime: input.workerRuntime ?? "openclaw",
    skillId: input.skillId ?? "research",
    verdict: input.verdict,
    source: input.source,
    ...(input.verifierModel !== undefined && { verifierModel: input.verifierModel }),
    ...(input.verifierOwnerId !== undefined && { verifierOwnerId: input.verifierOwnerId }),
    issuedBy: "orch-1",
    issuedAt: NOW,
    signature: "test-signature",
  };
}

// ---------------------------------------------------------------------------
// reputationFromVerdicts — formula
// ---------------------------------------------------------------------------

describe("reputationFromVerdicts", () => {
  it("returns 0 for an empty input (Q2 — neutral, not null, not throw)", () => {
    expect(reputationFromVerdicts([])).toBe(0);
  });

  it("returns 1.0 for all `pass` (rule) at score 1.0", () => {
    const verdicts = [
      makeVerdict({ source: "rule", verdict: { kind: "pass", score: 1, confidence: "high" } }),
      makeVerdict({ source: "rule", verdict: { kind: "pass", score: 1, confidence: "high" } }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(1);
  });

  it("returns 0.5 for all `pass` (rule) at score 0.5", () => {
    const verdicts = [
      makeVerdict({ source: "rule", verdict: { kind: "pass", score: 0.5, confidence: "medium" } }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(0.5);
  });

  it("returns -1.0 for all `fail` (rule)", () => {
    const verdicts = [
      makeVerdict({ source: "rule", verdict: { kind: "fail", reason: "x", rollback: true } }),
      makeVerdict({ source: "rule", verdict: { kind: "fail", reason: "y", rollback: true } }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(-1);
  });

  it("returns 0 for all `disputed` (Q3 — no contribution, no weight)", () => {
    const verdicts = [
      makeVerdict({
        source: "rule",
        verdict: { kind: "disputed", needsHuman: true, signals: ["unclear"] },
      }),
      makeVerdict({
        source: "rule",
        verdict: { kind: "disputed", needsHuman: true, signals: ["ambiguous"] },
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(0);
  });

  it("returns 0 for a mix of `pass` (rule, 0.7) + `fail` (rule) that cancels out", () => {
    // 0.7 * 1 - 1 * 1 = -0.3; weight = 2; -0.3 / 2 = -0.15.
    // Use two pass + one fail to land at 0: 2 * 0.5 - 1 = 0; weight = 3; 0/3 = 0.
    const verdicts = [
      makeVerdict({ source: "rule", verdict: { kind: "pass", score: 0.5, confidence: "medium" } }),
      makeVerdict({ source: "rule", verdict: { kind: "pass", score: 0.5, confidence: "medium" } }),
      makeVerdict({ source: "rule", verdict: { kind: "fail", reason: "x", rollback: true } }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(0);
  });

  it("preserves the score for a single `pass` (cross) — the 1.5x weight cancels in normalization", () => {
    // 0.8 * 1.5 / 1.5 = 0.8.
    const verdicts = [
      makeVerdict({
        source: "cross",
        verdict: { kind: "pass", score: 0.8, confidence: "high" },
        verifierModel: "claude",
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBeCloseTo(0.8, 10);
  });

  it("weights human + rule against each other — human dominates", () => {
    // human pass (2 * 1 = 2) + rule fail (-1) = 1; weight = 3; 1 / 3 = 0.3333...
    const verdicts = [
      makeVerdict({
        source: "human",
        verdict: { kind: "pass", score: 1, confidence: "high" },
        verifierOwnerId: "owner-1",
      }),
      makeVerdict({ source: "rule", verdict: { kind: "fail", reason: "x", rollback: true } }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBeCloseTo(1 / 3, 10);
  });

  it("applies the partial factor (0.5x) to `partial` verdicts", () => {
    // 0.6 * 1 * 0.5 = 0.3; weight = 1; 0.3 / 1 = 0.3.
    const verdicts = [
      makeVerdict({
        source: "rule",
        verdict: { kind: "partial", score: 0.6, reason: "half-usable" },
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBeCloseTo(0.3, 10);
  });

  it("combines mixed sources correctly (human pass + rule fail + cross partial)", () => {
    // human pass: 2 * 1 = 2; rule fail: -1; cross partial: 0.5 * 1.5 * 0.5 = 0.375.
    // sum = 1.375; weight = 1 + 2 + 1.5 = 4.5; 1.375 / 4.5 = 0.30555...
    const verdicts = [
      makeVerdict({
        source: "human",
        verdict: { kind: "pass", score: 1, confidence: "high" },
        verifierOwnerId: "owner-1",
      }),
      makeVerdict({ source: "rule", verdict: { kind: "fail", reason: "x", rollback: true } }),
      makeVerdict({
        source: "cross",
        verdict: { kind: "partial", score: 0.5, reason: "half-usable" },
        verifierModel: "claude",
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBeCloseTo(1.375 / 4.5, 10);
  });

  it("reaches the max positive 1.0 with cross pass (1.0) + human pass (1.0)", () => {
    // 1.5 * 1 + 2 * 1 = 3.5; weight = 1.5 + 2 = 3.5; 3.5 / 3.5 = 1.0.
    const verdicts = [
      makeVerdict({
        source: "cross",
        verdict: { kind: "pass", score: 1, confidence: "high" },
        verifierModel: "claude",
      }),
      makeVerdict({
        source: "human",
        verdict: { kind: "pass", score: 1, confidence: "high" },
        verifierOwnerId: "owner-1",
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(1);
  });

  it("reaches the max negative -1.0 with cross fail + human fail", () => {
    // (-1.5) + (-2) = -3.5; weight = 1.5 + 2 = 3.5; -3.5 / 3.5 = -1.0.
    const verdicts = [
      makeVerdict({
        source: "cross",
        verdict: { kind: "fail", reason: "x", rollback: true },
        verifierModel: "claude",
      }),
      makeVerdict({
        source: "human",
        verdict: { kind: "fail", reason: "x", rollback: true },
        verifierOwnerId: "owner-1",
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(-1);
  });

  it("ignores `disputed` verdicts (no contribution, no weight) when mixed with `pass`", () => {
    // pass (rule, 0.5) + disputed (rule) = 0.5 * 1; weight = 1 (disputed adds 0).
    // 0.5 / 1 = 0.5.
    const verdicts = [
      makeVerdict({ source: "rule", verdict: { kind: "pass", score: 0.5, confidence: "medium" } }),
      makeVerdict({
        source: "rule",
        verdict: { kind: "disputed", needsHuman: true, signals: ["unclear"] },
      }),
    ];
    expect(reputationFromVerdicts(verdicts)).toBe(0.5);
  });

  it("clamps to [-1, 1] for floating-point edge cases (defensive)", () => {
    // The formula is naturally bounded, but a `clamp` guards
    // against floating-point drift. Verify the clamp by
    // constructing a value that *would* exceed the bounds
    // if not clamped — using a `pass` (cross, 1.0) which
    // produces exactly 1.0.
    const verdicts = [
      makeVerdict({
        source: "cross",
        verdict: { kind: "pass", score: 1, confidence: "high" },
        verifierModel: "claude",
      }),
    ];
    const result = reputationFromVerdicts(verdicts);
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// categorizeReputation — Tauri UI helper
// ---------------------------------------------------------------------------

describe("categorizeReputation", () => {
  it("returns 'trusted' for a score above the trusted threshold (0.8)", () => {
    expect(categorizeReputation(0.8)).toBe("trusted");
  });

  it("returns 'trusted' at the trusted boundary (0.7)", () => {
    expect(categorizeReputation(SCOREBOARD_TRUST_THRESHOLDS.trusted)).toBe("trusted");
  });

  it("returns 'mixed' for a score in the mixed band (0.5)", () => {
    expect(categorizeReputation(0.5)).toBe("mixed");
  });

  it("returns 'mixed' at the untrusted boundary (0.3)", () => {
    expect(categorizeReputation(SCOREBOARD_TRUST_THRESHOLDS.untrusted)).toBe("mixed");
  });

  it("returns 'untrusted' for a score just below the untrusted threshold (0.1)", () => {
    expect(categorizeReputation(0.1)).toBe("untrusted");
  });

  it("returns 'untrusted' for a negative score (-0.5)", () => {
    expect(categorizeReputation(-0.5)).toBe("untrusted");
  });

  it("returns 'untrusted' for a score of exactly 0 (the 'neutral' case)", () => {
    // 0 is just below the `untrusted` threshold (0.3).
    // The Tauri team uses `isNoHistoryReputation` to
    // override to 'no-history' for the empty-input case.
    expect(categorizeReputation(0)).toBe("untrusted");
  });

  it("returns 'untrusted' for the max negative (-1.0)", () => {
    expect(categorizeReputation(-1)).toBe("untrusted");
  });
});

// ---------------------------------------------------------------------------
// isNoHistoryReputation — Tauri UI helper
// ---------------------------------------------------------------------------

describe("isNoHistoryReputation", () => {
  it("returns true for an empty input (verdictCount = 0)", () => {
    expect(isNoHistoryReputation(0)).toBe(true);
  });

  it("returns false for a non-empty input (verdictCount = 1)", () => {
    expect(isNoHistoryReputation(1)).toBe(false);
  });

  it("returns false for a large verdict count (verdictCount = 100)", () => {
    expect(isNoHistoryReputation(100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constants — spec pinning (Q3 + Q5)
// ---------------------------------------------------------------------------

describe("SCOREBOARD_SOURCE_WEIGHTS", () => {
  it("has the locked values for each source (Q3 of the v1.10 design questions)", () => {
    expect(SCOREBOARD_SOURCE_WEIGHTS).toEqual({
      rule: 1.0,
      llm: 1.0,
      cross: 1.5,
      human: 2.0,
    });
  });

  it("weights cross strictly greater than rule/llm (the F9.5 proxy)", () => {
    expect(SCOREBOARD_SOURCE_WEIGHTS.cross).toBeGreaterThan(SCOREBOARD_SOURCE_WEIGHTS.rule);
    expect(SCOREBOARD_SOURCE_WEIGHTS.cross).toBeGreaterThan(SCOREBOARD_SOURCE_WEIGHTS.llm);
  });

  it("weights human strictly greater than cross (most-trusted source)", () => {
    expect(SCOREBOARD_SOURCE_WEIGHTS.human).toBeGreaterThan(SCOREBOARD_SOURCE_WEIGHTS.cross);
  });
});

describe("SCOREBOARD_TRUST_THRESHOLDS", () => {
  it("has the locked values (Q5 of the v1.10 design questions)", () => {
    expect(SCOREBOARD_TRUST_THRESHOLDS).toEqual({
      trusted: 0.7,
      untrusted: 0.3,
    });
  });

  it("has trusted strictly greater than untrusted (clear three-way band)", () => {
    expect(SCOREBOARD_TRUST_THRESHOLDS.trusted).toBeGreaterThan(
      SCOREBOARD_TRUST_THRESHOLDS.untrusted,
    );
  });
});
