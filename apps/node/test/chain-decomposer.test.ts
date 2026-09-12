/**
 * Phase 40D — LLM chain decomposer tests.
 *
 * The decomposer is prompt + parsing glue around `routeModelRequest`, so
 * the tests cover:
 *   - empty goal → ok=false / empty_goal (no LLM call)
 *   - no providers → ok=false / no_provider (constructor returns early)
 *   - valid JSON array → ok=true / N subtasks with depth ≤ the mandate budget
 *   - JSON wrapped in prose → salvage via `extractJson`
 *   - non-JSON garbage → ok=false / parse_failed
 *   - depth clamping to the **mandate budget** (Phase 65A: default 2,
 *     `allowDepth3` → 3, `allowDepth4` → 4, hard cap `CHAIN_MAX_DEPTH`; depth < 1
 *     → 1)
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
import { CHAIN_MAX_DEPTH } from "@envoymesh/protocol";

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
          { objective: "research X", requiredSkill: "research.web", depth: 1 },
          { objective: "summarize X", requiredSkill: "summarize.text", depth: 2 },
        ]),
      ),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("build me a thing");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.length).toBe(2);
    expect(r.steps[0].requiredSkill).toBe("research.web");
    expect(r.steps[1].depth).toBe(2);
    // All subtasks share the chainId we generated internally.
    const chainIds = new Set(r.steps.map((s) => s.chainId));
    expect(chainIds.size).toBe(1);
    const subtaskIds = new Set(r.steps.map((s) => s.subtaskId));
    expect(subtaskIds.size).toBe(2);
  });

  // Phase 65A moved the clamp target: it is no longer the protocol constant
  // (`CHAIN_MAX_DEPTH` = 4) or a fixed 3, but the **mandate budget** —
  // `resolveAllowedChainDepth` gives default 2, `allowDepth3` → 3, `allowDepth4`
  // → 4. This test asserted `99 → 3` unconditionally, which was the pre-65A rule
  // and had been failing ever since; it now covers all three budgets, which is
  // strictly more than the old expectation.
  it("clamps depth to the mandate budget, and depth < 1 to 1", async () => {
    const provider = makeProvider(() =>
      respondWith(
        JSON.stringify([
          { objective: "a", depth: 99 },
          { objective: "b", depth: -5 },
          { objective: "c", depth: 2 },
        ]),
      ),
    );

    // No flags: the default orchestrator → worker budget is 2.
    const byDefault = await createLlmDecomposer({ providers: [provider] })("x");
    expect(byDefault.ok).toBe(true);
    if (!byDefault.ok) return;
    expect(byDefault.steps[0].depth).toBe(2);
    expect(byDefault.steps[1].depth).toBe(1);
    expect(byDefault.steps[2].depth).toBe(2);

    // `allowDepth3` raises the ceiling to 3.
    const depth3 = await createLlmDecomposer({
      providers: [provider],
      chainContext: { chainId: "c1", chainMandateId: "m1", allowDepth3: true },
    })("x");
    expect(depth3.ok).toBe(true);
    if (!depth3.ok) return;
    expect(depth3.steps[0].depth).toBe(3);
    expect(depth3.steps[1].depth).toBe(1);

    // `allowDepth4` reaches the protocol hard cap.
    const depth4 = await createLlmDecomposer({
      providers: [provider],
      chainContext: { chainId: "c2", chainMandateId: "m2", allowDepth4: true },
    })("x");
    expect(depth4.ok).toBe(true);
    if (!depth4.ok) return;
    expect(depth4.steps[0].depth).toBe(4);

    // The per-call flags are the same budget, resolved the same way.
    const perCall = await createLlmDecomposer({ providers: [provider] })("x", { allowDepth3: true });
    expect(perCall.ok).toBe(true);
    if (!perCall.ok) return;
    expect(perCall.steps[0].depth).toBe(3);

    // But never above the protocol hard cap, even if both flags are set.
    const capped = await createLlmDecomposer({ providers: [provider] })("x", { allowDepth4: true });
    expect(capped.ok).toBe(true);
    if (!capped.ok) return;
    expect(capped.steps[0].depth).toBeLessThanOrEqual(CHAIN_MAX_DEPTH);
  });

  it("caps the array at 5 subtasks", async () => {
    const provider = makeProvider(() =>
      respondWith(
        JSON.stringify(
          Array.from({ length: 8 }, (_, i) => ({ objective: `s${i}`, requiredSkill: "task.execute" })),
        ),
      ),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.length).toBe(5);
  });

  it("applies defaults for missing requiredSkill and objective", async () => {
    const provider = makeProvider(() =>
      respondWith(JSON.stringify([{}])),
    );
    const decomposer = createLlmDecomposer({ providers: [provider] });
    const r = await decomposer("build me a thing");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].requiredSkill).toBe("task.execute");
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
      respondWith('Here you go:\n[{"objective":"a","requiredSkill":"task.execute"}]\nDone.'),
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
  it("ignores braces inside MiniMax <think> monologue", () => {
    const text = [
      "<think>",
      'Example shape: {"steps":[{"objective":"ignore me"}]}',
      "</think>",
      "",
      '{"steps":[{"objective":"real","requiredSkill":"coding","depth":1,"dependsOn":[],"assignedPeerId":"envoy_agent_c","reason":"ok"}]}',
    ].join("\n");
    expect(extractJson(text)).toContain('"objective":"real"');
    expect(extractJson(text)).not.toContain("ignore me");
  });
});
describe("createLlmDecomposer — plan+assign with roster", () => {
  it("materializes preferredWorkerPeerId and dependsOn from LLM JSON", async () => {
    const provider = makeProvider(() =>
      respondWith(
        JSON.stringify({
          steps: [
            {
              objective: "research",
              requiredSkill: "research.web",
              depth: 1,
              dependsOn: [],
              assignedPeerId: "envoy_agent_r",
              reason: "research specialist",
            },
            {
              objective: "write",
              requiredSkill: "coding",
              depth: 1,
              dependsOn: [0],
              assignedPeerId: "envoy_agent_c",
              reason: "coder",
            },
          ],
          aggregation: "concatenate",
        }),
      ),
    );
    const decomposer = createLlmDecomposer({
      providers: [provider],
      getRoster: async () => [
        {
          peerId: "envoy_agent_r",
          membership: ["task.execute", "research.web"],
          profile: {
            skills: ["research.web"],
            modelFreshness: 8,
            spendPosture: "metered",
            contextWindow: "512k",
          },
        },
        {
          peerId: "envoy_agent_c",
          membership: ["task.execute", "coding"],
          profile: {
            skills: ["coding"],
            modelFreshness: 9,
            spendPosture: "subscription",
            contextWindow: "1M+",
          },
        },
      ],
      chainContext: {
        chainId: "chain_plan_assign_ut",
        chainMandateId: "chainmandate_plan_assign_ut",
      },
    });
    const r = await decomposer("research then write");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0]!.preferredWorkerPeerId).toBe("envoy_agent_r");
    expect(r.steps[1]!.preferredWorkerPeerId).toBe("envoy_agent_c");
    expect(r.steps[1]!.dependsOn).toEqual([r.steps[0]!.subtaskId]);
  });
});
