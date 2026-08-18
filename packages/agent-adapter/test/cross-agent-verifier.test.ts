/**
 * CrossAgentDisagreementVerifier tests.
 *
 * Covers the "two-doctor" pattern (design §6.4):
 * - same-runtime results degrade to disputed.
 * - agreement / partial / disagreement thresholding.
 * - injectable similarity override.
 * - `extractConclusion` (structured summary preference) and
 *   `defaultSemanticSimilarity` (deterministic token measure).
 */
import { describe, expect, it } from "vitest";
import {
  CrossAgentDisagreementVerifier,
  defaultSemanticSimilarity,
  extractConclusion,
} from "../src/index.js";
import type { SignedAgentResult } from "@envoymesh/protocol";

function result(runtime: "openclaw" | "pi", text: string): SignedAgentResult {
  return {
    skillId: "research",
    runtime,
    peerId: runtime === "openclaw" ? "envoy_agent_a" : "envoy_agent_b",
    correlationId: "chain_1:subtask_1",
    content: [{ kind: "text", text }],
    citations: [],
    metrics: { durationMs: 1, costUsd: 0 },
    completedAt: new Date().toISOString(),
    signature: "sig",
  };
}

const objective = "Summarize the key risks of the mesh rollout";

describe("CrossAgentDisagreementVerifier", () => {
  it("degrades to disputed when both results come from the same runtime", async () => {
    const v = new CrossAgentDisagreementVerifier();
    const verdict = await v.verify({
      objective,
      resultA: result("openclaw", "Risk one is governance."),
      resultB: result("openclaw", "Risk one is governance."),
    });
    expect(verdict.kind).toBe("disputed");
    if (verdict.kind === "disputed") {
      expect(verdict.signals.join(" ")).toMatch(/two distinct runtimes/);
    }
  });

  it("passes when two runtimes reach the same conclusion", async () => {
    const v = new CrossAgentDisagreementVerifier();
    const verdict = await v.verify({
      objective,
      resultA: result("openclaw", "Key risks: governance, node churn, and cost control."),
      resultB: result("pi", "Key risks: governance, node churn, and cost control."),
    });
    expect(verdict.kind).toBe("pass");
    if (verdict.kind === "pass") expect(verdict.confidence).toBe("high");
  });

  it("returns partial or pass when conclusions overlap but phrasing differs", async () => {
    const v = new CrossAgentDisagreementVerifier();
    const verdict = await v.verify({
      objective,
      resultA: result("openclaw", "Governance and node churn are the main risks."),
      resultB: result("pi", "The main risks are governance and node churn."),
    });
    expect(["pass", "partial"]).toContain(verdict.kind);
  });

  it("returns partial on moderate agreement", async () => {
    const v = new CrossAgentDisagreementVerifier();
    const verdict = await v.verify({
      objective,
      resultA: result("openclaw", "Governance and node churn are the main risks."),
      resultB: result("pi", "Network latency is the biggest problem we face."),
    });
    expect(["partial", "disputed"]).toContain(verdict.kind);
  });

  it("returns disputed when two runtimes clearly disagree", async () => {
    const v = new CrossAgentDisagreementVerifier();
    const verdict = await v.verify({
      objective,
      resultA: result("openclaw", "Governance is the main risk."),
      resultB: result("pi", "The rollout is completely safe with no risks at all."),
    });
    expect(verdict.kind).toBe("disputed");
  });

  it("uses an injected similarity function when provided", async () => {
    const v = new CrossAgentDisagreementVerifier(() => 1);
    const verdict = await v.verify({
      objective,
      resultA: result("openclaw", "a"),
      resultB: result("pi", "b"),
    });
    expect(verdict.kind).toBe("pass");
    if (verdict.kind === "pass") expect(verdict.score).toBe(1);
  });
});

describe("extractConclusion", () => {
  it("prefers a structured summary over the last text block", () => {
    const r = result("pi", "noisy narrative");
    r.content = [
      { kind: "text", text: "noisy narrative" },
      {
        kind: "structured",
        schemaRef: "envoymesh://pi/run/v1",
        data: { summary: "the conclusion", trace: [] },
      },
    ];
    expect(extractConclusion(r)).toBe("the conclusion");
  });

  it("falls back to the last text block", () => {
    expect(extractConclusion(result("openclaw", "  final answer  "))).toBe("final answer");
  });
});

describe("defaultSemanticSimilarity", () => {
  it("returns 1 for identical text", () => {
    expect(defaultSemanticSimilarity("governance and churn", "governance and churn")).toBe(1);
  });

  it("returns 0 for disjoint vocabulary", () => {
    expect(defaultSemanticSimilarity("alpha beta gamma", "delta epsilon zeta")).toBe(0);
  });

  it("returns a high score for heavily overlapping conclusions", () => {
    const score = defaultSemanticSimilarity(
      "key risks governance node churn cost",
      "governance node churn and cost are key risks",
    );
    expect(score).toBeGreaterThan(0.85);
  });

  it("returns 0 when either side is empty", () => {
    expect(defaultSemanticSimilarity("", "anything")).toBe(0);
    expect(defaultSemanticSimilarity("anything", "")).toBe(0);
  });
});
