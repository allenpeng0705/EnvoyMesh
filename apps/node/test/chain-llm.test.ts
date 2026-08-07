/**
 * Phase 41A — LLM decomposition & merge tests.
 *
 * Tests createLlmDecompose() and createLlmMerge() with a mock LLM provider.
 * Verifies prompt construction, JSON parsing, error handling, and edge cases.
 *
 * Run: npx vitest run apps/node/test/chain-llm.test.ts
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  createLlmDecompose,
  createLlmMerge,
  estimateTokens,
  estimateSynthesisCostUsd,
  type LlmProvider,
} from "../src/chain-llm.js";

// ---------------------------------------------------------------------------
// Mock LLM provider
// ---------------------------------------------------------------------------

function mockProvider(responses: string[]): LlmProvider {
  let idx = 0;
  return {
    complete: vi.fn().mockImplementation(async () => {
      const text = responses[idx] ?? responses[responses.length - 1] ?? "[]";
      idx++;
      return {
        text,
        usage: { promptTokens: 100, completionTokens: 50 },
      };
    }),
  };
}

function decompositionResponse(caps: string[]): string {
  return JSON.stringify(
    caps.map((c, i) => ({
      requiredSkill: c,
      objective: `${c} task ${i + 1}`,
      costCeilingUsd: 2.5 + i,
    })),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chain-llm — createLlmDecompose", () => {
  const CAPS = ["translation", "review", "search", "summarize", "analyze"];

  it("decomposes a simple goal into subtasks", async () => {
    const provider = mockProvider([decompositionResponse(["search", "summarize"])]);
    const decompose = createLlmDecompose(provider, CAPS);

    const result = await decompose("Find and summarize Paris restaurant reviews");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subtasks.length).toBe(2);
      expect(result.subtasks[0].requiredSkill).toBe("search");
      expect(result.subtasks[1].requiredSkill).toBe("summarize");
      expect(result.estimatedTotalCostUsd).toBeCloseTo(6);
      expect(result.tokenUsage.promptTokens).toBe(100);
    }
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("validates the prompt includes the goal and capabilities", async () => {
    const provider = mockProvider([decompositionResponse(["review"])]);
    const decompose = createLlmDecompose(provider, CAPS);

    await decompose("Review this document");
    const call = (provider.complete as any).mock.calls[0][0];
    expect(call.userPrompt).toContain("Review this document");
    expect(call.userPrompt).toContain("translation, review, search, summarize, analyze");
    expect(call.systemPrompt).toContain("task decomposition engine");
    expect(call.maxTokens).toBe(4096);
  });

  it("rejects empty goal", async () => {
    const decompose = createLlmDecompose(mockProvider([]), CAPS);
    const r = await decompose("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty_goal");
  });

  it("rejects whitespace-only goal", async () => {
    const decompose = createLlmDecompose(mockProvider([]), CAPS);
    const r = await decompose("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty_goal");
  });

  it("rejects when no capabilities available", async () => {
    const decompose = createLlmDecompose(mockProvider([]), []);
    const r = await decompose("Some goal");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_capabilities");
  });

  it("handles LLM provider failure gracefully", async () => {
    const provider: LlmProvider = {
      complete: vi.fn().mockRejectedValue(new Error("API down")),
    };
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Test");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("llm_unavailable");
  });

  it("rejects non-JSON response", async () => {
    const provider = mockProvider(["not json at all"]);
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Test");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("parse_failed");
  });

  it("handles markdown-fenced JSON response", async () => {
    const provider = mockProvider(["```json\n" + decompositionResponse(["translation"]) + "\n```"]);
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Translate this");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.subtasks.length).toBe(1);
  });

  it("handles single-object response (not array)", async () => {
    const provider = mockProvider([JSON.stringify({ requiredSkill: "search", objective: "test" })]);
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Test");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("parse_failed");
  });

  it("rejects too many subtasks", async () => {
    const manyCapabilities = Array.from({ length: 20 }, (_, i) => `cap_${i}`);
    const provider = mockProvider([JSON.stringify(manyCapabilities.map((c) => ({
      requiredSkill: c,
      objective: `${c} task`,
      costCeilingUsd: 1,
    })))]);
    const decompose = createLlmDecompose(provider, manyCapabilities);
    const r = await decompose("Massive task");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_many_subtasks");
  });

  it("filters out unknown capabilities", async () => {
    const provider = mockProvider([JSON.stringify([
      { requiredSkill: "translation", objective: "Translate", costCeilingUsd: 2 },
      { requiredSkill: "unknown_cap", objective: "Unknown", costCeilingUsd: 5 },
    ])]);
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Test");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subtasks.length).toBe(1);
      expect(r.subtasks[0].requiredSkill).toBe("translation");
    }
  });

  it("rejects when all subtasks filtered out", async () => {
    const provider = mockProvider([JSON.stringify([
      { requiredSkill: "unknown_1", objective: "a", costCeilingUsd: 1 },
      { requiredSkill: "unknown_2", objective: "b", costCeilingUsd: 1 },
    ])]);
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Test");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("parse_failed");
  });

  it("filters out invalid cost values", async () => {
    const provider = mockProvider([JSON.stringify([
      { requiredSkill: "search", objective: "Good", costCeilingUsd: 5 },
      { requiredSkill: "review", objective: "Bad cost 0", costCeilingUsd: 0 },
      { requiredSkill: "analyze", objective: "Too expensive", costCeilingUsd: 100 },
    ])]);
    const decompose = createLlmDecompose(provider, CAPS);
    const r = await decompose("Test");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subtasks.length).toBe(1);
      expect(r.subtasks[0].requiredSkill).toBe("search");
    }
  });
});

// ---------------------------------------------------------------------------
// createLlmMerge tests
// ---------------------------------------------------------------------------

describe("chain-llm — createLlmMerge", () => {
  function makePartial(text: string, confidence: number): any {
    return {
      version: "0.1",
      partial: {
        subtaskId: "sub_1",
        chainId: "chain_test",
        workerPeerId: "envoy_agent_worker",
        seq: 1,
        isFinal: true,
        createdAt: new Date().toISOString(),
        confidence: confidence / 100,
        artifactFragment: text,
      },
    };
  }

  const mergeResponse = JSON.stringify({
    summary: "The document was reviewed and found satisfactory.",
    sections: [
      { title: "Review", body: "All sections are well-structured.", confidence: 0.9 },
    ],
    sources: [
      { workerIndex: 1, contributionSummary: "Reviewed the document" },
    ],
  });

  it("merges contributions into a structured report", async () => {
    const provider = mockProvider([mergeResponse]);
    const merge = createLlmMerge(provider);

    const r = await merge({
      contributions: [
        { workerIndex: 1, partial: makePartial("Document is well-structured.", 90) },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged.summary).toContain("satisfactory");
      expect(r.merged.sections.length).toBe(1);
      expect(r.merged.sections[0].confidence).toBe(0.9);
      expect(r.merged.sources.length).toBe(1);
    }
  });

  it("rejects empty contributions", async () => {
    const merge = createLlmMerge(mockProvider([]));
    const r = await merge({ contributions: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_contributions");
  });

  it("handles LLM failure", async () => {
    const provider: LlmProvider = {
      complete: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const merge = createLlmMerge(provider);
    const r = await merge({ contributions: [{ workerIndex: 1, partial: makePartial("test", 50) }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("llm_unavailable");
  });

  it("rejects non-JSON response", async () => {
    const provider = mockProvider(["not json"]);
    const merge = createLlmMerge(provider);
    const r = await merge({ contributions: [{ workerIndex: 1, partial: makePartial("test", 50) }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("parse_failed");
  });

  it("rejects response missing summary", async () => {
    const provider = mockProvider([JSON.stringify({ sections: [] })]);
    const merge = createLlmMerge(provider);
    const r = await merge({ contributions: [{ workerIndex: 1, partial: makePartial("test", 50) }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("parse_failed");
  });

  it("validates prompt includes worker contributions", async () => {
    const provider = mockProvider([mergeResponse]);
    const merge = createLlmMerge(provider);
    await merge({ contributions: [{ workerIndex: 1, partial: makePartial("Hello world", 80) }] });
    const call = (provider.complete as any).mock.calls[0][0];
    expect(call.userPrompt).toContain("Hello world");
    expect(call.userPrompt).toContain("[Worker 1]");
    expect(call.systemPrompt).toContain("report synthesis");
    expect(call.maxTokens).toBe(8192);
  });

  it("clamps confidence to 0..1 range", async () => {
    const provider = mockProvider([JSON.stringify({
      summary: "ok",
      sections: [
        { title: "a", body: "b", confidence: 1.5 },
        { title: "c", body: "d", confidence: -0.2 },
      ],
      sources: [],
    })]);
    const merge = createLlmMerge(provider);
    const r = await merge({ contributions: [{ workerIndex: 1, partial: makePartial("x", 50) }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged.sections[0].confidence).toBe(1);
      expect(r.merged.sections[1].confidence).toBe(0);
    }
  });

  it("handles markdown-fenced JSON in merge response", async () => {
    const provider = mockProvider(["```json\n" + mergeResponse + "\n```"]);
    const merge = createLlmMerge(provider);
    const r = await merge({ contributions: [{ workerIndex: 1, partial: makePartial("test", 50) }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged.summary).toContain("satisfactory");
  });
});

// ---------------------------------------------------------------------------
// estimateTokens + estimateSynthesisCostUsd
// ---------------------------------------------------------------------------

describe("chain-llm — token estimation", () => {
  it("estimateTokens returns ~chars/4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hello")).toBe(2);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });

  it("estimateSynthesisCostUsd uses $0.002/1K tokens", () => {
    expect(estimateSynthesisCostUsd(0)).toBe(0);
    expect(estimateSynthesisCostUsd(1000)).toBeCloseTo(0.002);
    expect(estimateSynthesisCostUsd(10000)).toBeCloseTo(0.02);
  });
});
