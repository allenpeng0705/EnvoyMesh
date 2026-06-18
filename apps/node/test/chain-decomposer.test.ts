/**
 * Phase 40D — LLM chain decomposer tests.
 *
 * The decomposer is prompt + parsing glue around `routeModelRequest`, so
 * the tests cover:
 *   - empty goal → ok=false / empty_goal (no LLM call)
 *   - no providers → ok=false / no_provider (constructor returns early)
 *   - valid JSON array → ok=true / N subtasks with depth ≤ 3
 *   - JSON wrapped in prose → salvage via `extractJson`
 *   - non-JSON garbage → ok=false / parse_failed
 *   - depth clamping (depth > 3 → clamped to 3; depth < 1 → clamped to 1)
 *   - missing fields → sensible defaults ("task.execute" capability, fallback objective)
 *
 * We never hit a real LLM here — the test uses a stub `ModelProvider` whose
 * `complete()` returns whatever JSON the test wants.
 */

import { describe, expect, it } from "vitest";

import {
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type Sensitivity,
} from "@envoymesh/models";

import { buildDecomposePrompt, createLlmDecomposer, extractJson } from "../src/chain-decomposer.js";

function makeProvider(respond: (req: ModelRequest) => ModelResponse): ModelProvider {
  return {
    policy: {
      providerId: "stub",
      providerType: "cloud",
      enabled: true,
      allowedSensitivity: ["public" as Sensitivity, "friends" as Sensitivity],
      allowedTaskTypes: ["*"],
      requiresOwnerApproval: false,
    },
    complete: async (req) => respond(req),
  };
}

const PROMPT_ONLY: ModelResponse = {
  providerId: "stub",
  modelName: "stub-1",
  text: "",
  usage: { inputTokens: 10, outputTokens: 5 },
};

function respondWith(text: string): ModelResponse {
  return { ...PROMPT_ONLY, text };
}

describe("createLlmDecomposer — basic behavior", () => {
  it("returns no_provider when constructed with no providers", async () => {
    const decomposer = createLlmDecomposer({ providers: [] });
    const r = await decomposer("do a thing");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_provider");
  });

  it("returns empty_goal without calling the LLM", async () => {
    let called = false;
    const provider = makeProvider((req) => {
      called = true;
      return respondWith("[]");
    });
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("empty_goal");
    expect(called).toBe(false);
  });
});

describe("createLlmDecomposer — successful parse", () => {
  it("parses a JSON array of subtasks and tags each with subtaskId + chainId", async () => {
    const provider = makeProvider(() =>
      respondWith(
        JSON.stringify([
          { objective: "research X", requiredCapability: "research.web", depth: 1 },
          { objective: "summarize X", requiredCapability: "summarize.text", depth: 2 },
        ]),
      ),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("build me a thing");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.length).toBe(2);
    expect(r.steps[0].requiredCapability).toBe("research.web");
    expect(r.steps[1].depth).toBe(2);
    // All subtasks share the chainId we generated internally.
    const chainIds = new Set(r.steps.map((s) => s.chainId));
    expect(chainIds.size).toBe(1);
    const subtaskIds = new Set(r.steps.map((s) => s.subtaskId));
    expect(subtaskIds.size).toBe(2);
  });

  it("clamps depth > 3 to 3 and depth < 1 to 1", async () => {
    const provider = makeProvider(() =>
      respondWith(
        JSON.stringify([
          { objective: "a", depth: 99 },
          { objective: "b", depth: -5 },
          { objective: "c", depth: 2 },
        ]),
      ),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].depth).toBe(3);
    expect(r.steps[1].depth).toBe(1);
    expect(r.steps[2].depth).toBe(2);
  });

  it("caps the array at 5 subtasks", async () => {
    const provider = makeProvider(() =>
      respondWith(
        JSON.stringify(
          Array.from({ length: 8 }, (_, i) => ({ objective: `s${i}`, requiredCapability: "task.execute" })),
        ),
      ),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.length).toBe(5);
  });

  it("applies defaults for missing requiredCapability and objective", async () => {
    const provider = makeProvider(() =>
      respondWith(JSON.stringify([{}])),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("build me a thing");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].requiredCapability).toBe("task.execute");
    expect(r.steps[0].objective).toBe("build me a thing");
  });
});

describe("createLlmDecomposer — parsing failures", () => {
  it("returns parse_failed when the response is not JSON", async () => {
    const provider = makeProvider(() => respondWith("sorry, I can't help with that"));
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_failed");
  });

  it("returns parse_failed when the JSON is not an array", async () => {
    const provider = makeProvider(() => respondWith(JSON.stringify({ objective: "x" })));
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_failed");
  });

  it("recovers when JSON is wrapped in prose via extractJson", async () => {
    const provider = makeProvider(() =>
      respondWith('Here you go:\n[{"objective":"a","requiredCapability":"task.execute"}]\nDone.'),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.length).toBe(1);
  });
});

describe("buildDecomposePrompt", () => {
  it("inlines the goal and tells the model to return JSON only", () => {
    const prompt = buildDecomposePrompt("summarize Q3 financials", { providers: [] });
    expect(prompt).toContain("summarize Q3 financials");
    expect(prompt).toMatch(/JSON/);
    expect(prompt).toMatch(/objective/);
  });
});

describe("extractJson", () => {
  it("returns the input unchanged when it already starts with [ or {", () => {
    expect(extractJson('[]')).toBe('[]');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
  it("slices the first [...] block out of a prose-wrapped string", () => {
    const text = 'Sure, here: [{"a":1}, {"a":2}] — enjoy';
    expect(extractJson(text)).toBe('[{"a":1}, {"a":2}]');
  });
  it("falls back to the first {...} block when no [...] is present", () => {
    const text = 'oops {"a":1} oh well';
    expect(extractJson(text)).toBe('{"a":1}');
  });
  it("returns the trimmed input when no JSON-looking substring exists", () => {
    expect(extractJson('  nothing here  ')).toBe('nothing here');
  });
});