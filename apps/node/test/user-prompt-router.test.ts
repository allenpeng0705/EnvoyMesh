/**
 * Phase 8 / Step 5 — unit tests for `routeUserPrompt`.
 *
 * **What this covers:** every signal category
 * (mesh-keyword, tool-name, explicit-hint), every
 * decision branch (default, opt-in-disabled, signal,
 * envoy-harness-unready), and the env-var helper
 * `readSignalOptInEnv`.
 *
 * **Hermetic:** the router is a pure function. No
 * I/O, no clock, no `process.env` reads in
 * `routeUserPrompt` itself. The env-var helper is
 * tested separately by setting/restoring
 * `process.env.ENVOY_HARNESS_SIGNAL_OPT_IN`.
 *
 * **Why no e2e here:** the host wiring
 * (`runOwnerAgentTurnViaRuntime` + dispatch) is
 * the e2e layer; tested in
 * `run-owner-agent-turn-routing.test.ts` (sub-chunk
 * 5.2). This file tests the algorithm in isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readSignalOptInEnv,
  routeUserPrompt,
  SIGNAL_OPT_IN_ENV_VAR,
  type RouteUserPromptInput,
} from "../src/user-prompt-router.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a default input. Tests override one
 *  field at a time for clarity. */
function makeInput(
  overrides: Partial<RouteUserPromptInput> = {},
): RouteUserPromptInput {
  return {
    prompt: "",
    isEnvoyHarnessReady: true,
    envoyHarnessUnreadyReason: undefined,
    signalOptIn: "enabled",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. No signal → default OpenClaw
// ---------------------------------------------------------------------------

describe("routeUserPrompt — no signal branch", () => {
  it("returns openclaw for an empty prompt", () => {
    const decision = routeUserPrompt(makeInput({ prompt: "" }));
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
    expect(decision.hintPrefixLength).toBeUndefined();
  });

  it("returns openclaw for a whitespace-only prompt", () => {
    const decision = routeUserPrompt(makeInput({ prompt: "   \n\t  " }));
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });

  it("returns openclaw for an ordinary chat prompt", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "translate this article to French" }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });

  it("returns openclaw for an ordinary code prompt", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "review this PR for security issues" }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Mesh keyword branch
// ---------------------------------------------------------------------------

describe("routeUserPrompt — mesh keyword branch", () => {
  it("routes to envoy-harness on the `mesh` keyword", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "set up a mesh sub-agent for this task" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.reason).toBe("signal");
    expect(decision.signals).toHaveLength(1);
    expect(decision.signals[0]).toMatchObject({
      token: "mesh",
      category: "mesh-keyword",
    });
  });

  it("routes to envoy-harness on the `federated` keyword", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "federated scoreboard query for peer X" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.reason).toBe("signal");
    expect(decision.signals[0]).toMatchObject({
      token: "federated",
      category: "mesh-keyword",
    });
  });

  it("routes to envoy-harness on the `cross-node` keyword", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "spawn a cross-node verifier rule" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.reason).toBe("signal");
    expect(decision.signals[0]).toMatchObject({
      token: "cross-node",
      category: "mesh-keyword",
    });
  });

  it("matches case-insensitively (uppercase MESH)", () => {
    const decision = routeUserPrompt(makeInput({ prompt: "this is MESH" }));
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]?.token).toBe("MESH");
  });

  it("matches case-insensitively (mixed-case Mesh)", () => {
    const decision = routeUserPrompt(makeInput({ prompt: "Mesh-based routing" }));
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]?.token).toBe("Mesh");
  });

  it("rejects substring false positives in v0 fallback (e.g. `meshes` does NOT match `mesh`)", () => {
    // Phase 8 v1.1 — the v0 fallback (`MESH_KEYWORDS`)
    // is matched with the v1.1 algorithm
    // (word-boundary regex for single-word tags).
    // This cleans up the v0 substring FP (Q6
    // follow-up) — `meshes` no longer matches `mesh`,
    // `codes` no longer matches `code`. The v0
    // LIST stays the same; the ALGORITHM is the
    // v1.1 word-boundary one.
    const decision = routeUserPrompt(makeInput({ prompt: "the meshes overlap" }));
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });

  it("captures multiple mesh keywords in one prompt", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "mesh sub-agent for the federated cross-node task" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals).toHaveLength(3);
    const categories = decision.signals.map((s) => s.category);
    expect(categories.every((c) => c === "mesh-keyword")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Tool name branch
// ---------------------------------------------------------------------------

describe("routeUserPrompt — tool name branch", () => {
  it("routes to envoy-harness on `RemoteMeshSubmitter`", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "spawn via RemoteMeshSubmitter please" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.reason).toBe("signal");
    expect(decision.signals[0]).toMatchObject({
      token: "RemoteMeshSubmitter",
      category: "tool-name",
    });
  });

  it("routes to envoy-harness on `FanOutSpec`", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "build a FanOutSpec for this" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "FanOutSpec",
      category: "tool-name",
    });
  });

  it("routes to envoy-harness on `lsp_goto_definition`", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "use lsp_goto_definition on this file" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "lsp_goto_definition",
      category: "tool-name",
    });
  });

  it("routes to envoy-harness on `lsp_hover`", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "show lsp_hover for this symbol" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]?.token).toBe("lsp_hover");
  });

  it("matches lsp_* case-insensitively", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "call LSP_FIND_REFERENCES" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]?.token).toBe("LSP_FIND_REFERENCES");
  });

  it("does NOT match a word that contains lsp_ but not at boundary (e.g. `mylsp_foo`)", () => {
    // The \b in LSP_REGEX prevents mid-word matches.
    // `mylsp_foo` should NOT match.
    const decision = routeUserPrompt(makeInput({ prompt: "the mylsp_foo helper" }));
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// Phase 8 v1.1 — capability-tag-based signal detection
// ---------------------------------------------------------------------------

describe("routeUserPrompt — v1.1 manifest-tag detection", () => {
  it("matches a single-word manifest tag with word-boundary regex", () => {
    // The manifest exposes `mesh` as a tag (from
    // `setup-sponsor-friend`, `peer-list`,
    // `relay-status`). The prompt's word `mesh`
    // matches with the v1.1 word-boundary algorithm.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sub-agent for this task",
        envoyHarnessTags: ["mesh"],
      }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.reason).toBe("signal");
    expect(decision.signals[0]).toMatchObject({
      token: "mesh",
      category: "mesh-keyword",
    });
  });

  it("rejects substring false positives (`meshes` does NOT match `mesh`)", () => {
    // v1.1 cleans up the v0 substring FP (Q6
    // follow-up). The `mesh` tag uses word-boundary
    // regex, so `meshes` no longer matches.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "the meshes overlap in the graph",
        envoyHarnessTags: ["mesh"],
      }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });

  it("does NOT match a tag that is not in the manifest (e.g. `federated`)", () => {
    // v0 had `federated` in MESH_KEYWORDS. v1.1's
    // dynamic vocabulary is the manifest's tags;
    // `federated` is not in any envoy-harness skill's
    // tags. So a prompt with `federated` does NOT
    // trigger envoy-harness (the v0 `federated` is
    // gone).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "federated scoreboard query for peer X",
        envoyHarnessTags: ["mesh", "observability"],
      }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });

  it("matches a hyphenated manifest tag as exact substring", () => {
    // Hyphenated tags use exact substring match
    // (per Q2). `cross-node` matches `cross-node`
    // in the prompt; the `\b` would have failed
    // because `-` is a non-word char.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "spawn a cross-node verifier rule",
        envoyHarnessTags: ["cross-node"],
      }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "cross-node",
      category: "mesh-keyword",
    });
  });

  it("matches multiple manifest tags in one prompt", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "show me the mesh and observability dashboards",
        envoyHarnessTags: ["mesh", "observability", "code"],
      }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals).toHaveLength(2);
    const tokens = decision.signals.map((s) => s.token);
    expect(tokens).toContain("mesh");
    expect(tokens).toContain("observability");
  });

  it("falls back to v0 MESH_KEYWORDS when envoyHarnessTags is undefined (backward compat)", () => {
    // No `envoyHarnessTags` → router uses the v0
    // MESH_KEYWORDS list (`mesh`, `federated`,
    // `cross-node`) with the v1.1 algorithm
    // (word-boundary regex).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sub-agent",
        // envoyHarnessTags omitted → undefined → v0 fallback
      }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({ token: "mesh" });
  });

  it("returns no tag-based signals when envoyHarnessTags is an empty array", () => {
    // Empty array → no tag vocabulary. The v0
    // tool names / lsp / hint still work.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sub-agent",
        envoyHarnessTags: [],
      }),
    );
    // No manifest tag for `mesh` → no signal → default OpenClaw.
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
  });

  it("combines manifest-tag signals with v0 vocabulary (tool names / lsp / hint)", () => {
    // The prompt has BOTH a manifest tag (`mesh`)
    // and a tool name (`lsp_goto_definition`). The
    // router unions both signal sources.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "use lsp_goto_definition on the mesh sub-agent",
        envoyHarnessTags: ["mesh"],
      }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals).toHaveLength(2);
    const categories = decision.signals.map((s) => s.category);
    expect(categories).toContain("mesh-keyword");
    expect(categories).toContain("tool-name");
  });

  it("rejects hyphenated substring that is part of a longer word (e.g. `across-node` matches `cross-node`)", () => {
    // The hyphenated tag uses exact substring
    // match. `across-node` contains `cross-node`
    // as a substring (the `a` is just before
    // `cross`). This is a v1.1 limitation: the
    // exact-substring approach accepts FPs for
    // hyphenated tags. v1.2 could tighten to a
    // smarter boundary.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "the across-node failure caused a retry",
        envoyHarnessTags: ["cross-node"],
      }),
    );
    // v1.1 accepts this FP (substring match for
    // hyphenated tags). Documented behavior; future
    // v1.2 could tighten.
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "cross-node",
      category: "mesh-keyword",
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Explicit hint prefix branch
// ---------------------------------------------------------------------------

describe("routeUserPrompt — explicit hint prefix branch", () => {
  it("routes to envoy-harness on `!eh` prefix", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "!eh translate this to French" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.reason).toBe("signal");
    expect(decision.signals[0]).toMatchObject({
      token: "!eh",
      category: "explicit-hint",
      offset: 0,
    });
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("routes to envoy-harness on `/eh` prefix", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "/eh translate this to French" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "/eh",
      category: "explicit-hint",
      offset: 0,
    });
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("matches hint prefix case-insensitively (`!EH`)", () => {
    const decision = routeUserPrompt(makeInput({ prompt: "!EH do the thing" }));
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]?.token).toBe("!EH");
  });

  it("matches hint prefix after leading whitespace", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "   !eh do the thing" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "!eh",
      category: "explicit-hint",
      offset: 3, // after 3 spaces
    });
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("does NOT match hint prefix mid-prompt (only at start)", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "translate this !eh now" }),
    );
    // The hint at position 16 is NOT at the start;
    // it's a mid-prompt token. The router should
    // not classify it as `explicit-hint`. It will
    // fall back to default (no other signals).
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });

  it("does NOT match a word that starts with the hint but isn't a command (e.g. `!ehSomething`)", () => {
    // The hint must be followed by whitespace or
    // end-of-string; `!ehSomething` is one word,
    // not a command. Without this guard, the
    // earlier `startsWith` check would misfire.
    const decision = routeUserPrompt(
      makeInput({ prompt: "!ehSomething is not a command" }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
    expect(decision.hintPrefixLength).toBeUndefined();
  });

  it("matches a standalone hint (the prompt is exactly the hint)", () => {
    const decision = routeUserPrompt(makeInput({ prompt: "!eh" }));
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "!eh",
      category: "explicit-hint",
      offset: 0,
    });
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("matches the hint followed by a newline (multi-line prompt)", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "!eh\ntranslate this paragraph" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]).toMatchObject({
      token: "!eh",
      category: "explicit-hint",
    });
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("matches the hint followed by a tab", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "/eh\tdo the thing" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals[0]?.category).toBe("explicit-hint");
  });

  it("returns hintPrefixLength=undefined when no hint prefix matched", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "spawn a federated sub-agent" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.hintPrefixLength).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. envoy-harness-unready branch
// ---------------------------------------------------------------------------

describe("routeUserPrompt — envoy-harness-unready branch", () => {
  it("falls back to OpenClaw when signal matched but EH unready", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sub-agent",
        isEnvoyHarnessReady: false,
        envoyHarnessUnreadyReason: "envoy_harness_api_key_missing",
      }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("envoy-harness-unready");
    // Signals still populated — caller / UI can surface.
    expect(decision.signals).toHaveLength(1);
    expect(decision.signals[0]?.token).toBe("mesh");
  });

  it("preserves hintPrefixLength in the unready branch", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!eh translate this",
        isEnvoyHarnessReady: false,
      }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("envoy-harness-unready");
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("returns default when no signals AND EH unready", () => {
    // No signals, EH unready → `default`, not
    // `envoy-harness-unready` (the unready
    // branch only fires when signals matched).
    const decision = routeUserPrompt(
      makeInput({ prompt: "translate this", isEnvoyHarnessReady: false }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("default");
    expect(decision.signals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. opt-in-disabled branch
// ---------------------------------------------------------------------------

describe("routeUserPrompt — opt-in-disabled branch", () => {
  it("returns openclaw with `opt-in-disabled` even when signals match", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sub-agent for federated tasks",
        signalOptIn: "disabled",
      }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("opt-in-disabled");
    // Signals are NOT populated when opt-in is
    // disabled — the user explicitly turned off
    // signal routing, so reporting which signals
    // would have fired is noise.
    expect(decision.signals).toEqual([]);
  });

  it("returns openclaw with `opt-in-disabled` even on explicit hint", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "!eh translate this", signalOptIn: "disabled" }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("opt-in-disabled");
    expect(decision.signals).toEqual([]);
    expect(decision.hintPrefixLength).toBeUndefined();
  });

  it("returns openclaw with `opt-in-disabled` for an empty prompt", () => {
    const decision = routeUserPrompt(
      makeInput({ prompt: "", signalOptIn: "disabled" }),
    );
    expect(decision.runtime).toBe("openclaw");
    expect(decision.reason).toBe("opt-in-disabled");
  });
});

// ---------------------------------------------------------------------------
// 7. Mixed signals — sort order
// ---------------------------------------------------------------------------

describe("routeUserPrompt — mixed signal sort order", () => {
  it("returns signals sorted by offset (ascending)", () => {
    // The hint prefix is at offset 0, the mesh
    // keyword is later. The list is sorted
    // by offset.
    const decision = routeUserPrompt(
      makeInput({ prompt: "!eh set up a mesh sub-agent" }),
    );
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.signals).toHaveLength(2);
    expect(decision.signals[0]).toMatchObject({
      category: "explicit-hint",
      offset: 0,
    });
    expect(decision.signals[1]).toMatchObject({
      category: "mesh-keyword",
      token: "mesh",
    });
  });

  it("returns the first keyword occurrence (not subsequent)", () => {
    // `mesh` appears twice; the first one wins.
    const decision = routeUserPrompt(
      makeInput({ prompt: "mesh first then mesh again" }),
    );
    expect(decision.signals).toHaveLength(1);
    expect(decision.signals[0]?.offset).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. readSignalOptInEnv — env-var helper
// ---------------------------------------------------------------------------

describe("readSignalOptInEnv", () => {
  const original = process.env[SIGNAL_OPT_IN_ENV_VAR];

  beforeEach(() => {
    delete process.env[SIGNAL_OPT_IN_ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[SIGNAL_OPT_IN_ENV_VAR];
    } else {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = original;
    }
  });

  it("returns 'enabled' when env var is unset", () => {
    expect(readSignalOptInEnv()).toBe("enabled");
  });

  it("returns 'enabled' when env var is empty string", () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "";
    expect(readSignalOptInEnv()).toBe("enabled");
  });

  it("returns 'enabled' when env var is an unknown value", () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "yes please";
    expect(readSignalOptInEnv()).toBe("enabled");
  });

  it("returns 'disabled' when env var is 'disabled'", () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "disabled";
    expect(readSignalOptInEnv()).toBe("disabled");
  });

  it("returns 'disabled' when env var is 'DISABLED' (case-insensitive)", () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "DISABLED";
    expect(readSignalOptInEnv()).toBe("disabled");
  });

  it("returns 'disabled' when env var is 'Disabled' (mixed case)", () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "Disabled";
    expect(readSignalOptInEnv()).toBe("disabled");
  });
});

// ---------------------------------------------------------------------------
// Phase 8 / v1.2 — per-skill tag matching
// ---------------------------------------------------------------------------

/**
 * The v1.2 router picks a specific envoy-harness
 * skill when the prompt's tags uniquely match
 * one skill (Q1 — uniquely-held threshold; tie
 * → fall through to v1.1 free-form LLM ask).
 *
 * Tests in this section mirror the 8 envoy-harness
 * skills (see `envoy-harness/packages/envoy-harness-adapter/src/skills.ts:61`).
 */
describe("routeUserPrompt — v1.2 per-skill targetSkill", () => {
  // The 8 envoy-harness skills' tags. Mirrors
  // ENVOY_HARNESS_SKILLS so the tests document
  // the actual catalog.
  const ENVOY_HARNESS_SKILLS = [
    { skillId: "code-edit", tags: ["code", "edit"] },
    { skillId: "code-review", tags: ["code", "review"] },
    { skillId: "doc-search", tags: ["doc", "search"] },
    { skillId: "bash-run", tags: ["bash", "shell"] },
    { skillId: "plan", tags: ["plan"] },
    { skillId: "setup-sponsor-friend", tags: ["mesh", "bond", "sponsor"] },
    { skillId: "peer-list", tags: ["mesh", "observability"] },
    { skillId: "relay-status", tags: ["mesh", "observability"] },
  ] as const;

  it("picks a skill with the unique-best tag count (setup-sponsor-friend over mesh+bond)", () => {
    // The prompt "set up a mesh sponsor bond" has
    // `mesh` + `sponsor` (2 matches for
    // setup-sponsor-friend); `mesh` only (1 match)
    // for peer-list + relay-status. setup-sponsor-
    // friend is the unique best (Q1).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sponsor bond",
        envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal-skill");
    expect(decision.targetSkill).toBe("setup-sponsor-friend");
    expect(decision.runtime).toBe("envoy-harness");
  });

  it("falls through to free-form LLM ask on tied top score (mesh shared by 3 skills)", () => {
    // "set up a mesh sub-agent" matches `mesh`
    // for setup-sponsor-friend, peer-list, AND
    // relay-status (score 1 each). The top score
    // is shared → fall through (Q1).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sub-agent",
        envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.targetSkill).toBeUndefined();
    expect(decision.runtime).toBe("envoy-harness");
  });

  it("picks the skill with 2 tags (code-review over code-edit when only `code` + `review` match)", () => {
    // "review this code" has `code` (2 skills) +
    // `review` (1 skill). code-review scores 2;
    // code-edit scores 1. code-review is unique
    // best.
    //
    // We also pass `envoyHarnessTags` so the
    // v1.1 signal scan matches the prompt
    // (otherwise it'd be a `default` branch
    // and `targetSkill` would never be picked).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "review this code for me",
        envoyHarnessTags: ["code", "review"],
        envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal-skill");
    expect(decision.targetSkill).toBe("code-review");
  });

  it("falls through when no skill scores (prompt has no manifest tags)", () => {
    // "hello" doesn't match any skill's tags.
    // But "hello" also has no v1.1 signal —
    // so the v1.1 default branch fires first.
    // This test is here to document that
    // targetSkill stays undefined when the
    // signal scan is empty.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "hello",
        envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("default");
    expect(decision.targetSkill).toBeUndefined();
  });

  it("falls through when envoyHarnessSkills is undefined (v1.1 behavior preserved)", () => {
    // No `envoyHarnessSkills` → v1.1 free-form
    // LLM ask path. The v1.1 signal scan still
    // matches `mesh`, so the decision is EH +
    // reason "signal" (not "signal-skill").
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sponsor bond",
        // envoyHarnessSkills omitted → v1.1 path
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.targetSkill).toBeUndefined();
  });

  it("falls through when envoyHarnessSkills is empty array", () => {
    // Empty skills list → no per-skill match
    // → v1.1 free-form LLM ask path. v1.1
    // signal scan still matches `mesh`.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sponsor bond",
        envoyHarnessSkills: [],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.targetSkill).toBeUndefined();
  });

  it("matches hyphenated tag (cross-node) in the per-skill scan", () => {
    // Add a skill with a hyphenated tag.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "spawn a cross-node verifier rule",
        envoyHarnessSkills: [
          { skillId: "cross-node-verifier", tags: ["cross-node", "verifier"] },
          { skillId: "lone-mesh", tags: ["mesh"] },
        ],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal-skill");
    expect(decision.targetSkill).toBe("cross-node-verifier");
  });

  it("returns env-harness-unready with targetSkill undefined when EH not ready", () => {
    // v1.2 — when EH is not ready, the per-skill
    // match is moot (we'd fall through to OpenClaw
    // anyway). The targetSkill field stays
    // undefined (the UI doesn't claim a skill
    // routing when EH didn't run).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "set up a mesh sponsor bond",
        envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
        isEnvoyHarnessReady: false, // ← EH unready
      }),
    );
    expect(decision.reason).toBe("envoy-harness-unready");
    expect(decision.targetSkill).toBeUndefined();
    expect(decision.runtime).toBe("openclaw");
  });

  it("rejects substring false positives (does NOT pick `code` for `codes`)", () => {
    // v1.2 inherits v1.1's word-boundary for
    // single-word tags. "the codes are wrong"
    // does NOT match the `code` tag (word-boundary
    // is `\b`).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "the codes are wrong",
        envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
        isEnvoyHarnessReady: true,
      }),
    );
    // "codes" doesn't match `code` (v1.1 word-
    // boundary tightening). The v1.1 signal
    // scan also finds no match → default.
    expect(decision.reason).toBe("default");
    expect(decision.targetSkill).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 8 / v1.5 — extractPromptHints + routeUserPrompt integration
// ---------------------------------------------------------------------------

import {
  extractPromptHints,
  type ParsedPromptHints,
} from "../src/user-prompt-router.js";

describe("extractPromptHints", () => {
  it("returns an empty hints object + unchanged prompt when no hints are present", () => {
    const result = extractPromptHints("explain the mesh");
    expect(result.cleanPrompt).toBe("explain the mesh");
    expect(result.hints).toEqual({});
  });

  it("parses /cost:0.5 anywhere in the prompt and strips it", () => {
    const result = extractPromptHints("explain the mesh /cost:0.5");
    expect(result.cleanPrompt).toBe("explain the mesh");
    expect(result.hints.costCapUsd).toBe(0.5);
    expect(result.hints.providerHint).toBeUndefined();
  });

  it("parses /provider:openai and strips it", () => {
    const result = extractPromptHints("/provider:openai explain the mesh");
    expect(result.cleanPrompt).toBe("explain the mesh");
    expect(result.hints.providerHint).toBe("openai");
    expect(result.hints.costCapUsd).toBeUndefined();
  });

  it("parses both /cost + /provider in the same prompt", () => {
    const result = extractPromptHints(
      "/cost:0.5 /provider:openai explain the mesh",
    );
    expect(result.cleanPrompt).toBe("explain the mesh");
    expect(result.hints.costCapUsd).toBe(0.5);
    expect(result.hints.providerHint).toBe("openai");
  });

  it("is case-insensitive for both the kind and the value", () => {
    const result = extractPromptHints(
      "explain the mesh /COST:1.0 /PROVIDER:OpenAI",
    );
    expect(result.cleanPrompt).toBe("explain the mesh");
    expect(result.hints.costCapUsd).toBe(1.0);
    expect(result.hints.providerHint).toBe("openai");
  });

  it("accepts hyphenated provider names (Q1 — for future 'openai-4')", () => {
    const result = extractPromptHints("explain mesh /provider:openai-4");
    expect(result.cleanPrompt).toBe("explain mesh");
    expect(result.hints.providerHint).toBe("openai-4");
  });

  it("falls back to no-cost-cap when the value is invalid (Q4)", () => {
    // /cost:abc → Number.parseFloat("abc") = NaN → undefined
    // The dispatch sees costCapUsd=undefined and uses the
    // per-skill default (Q4 of the v1.5 sub-plan).
    const result = extractPromptHints("explain mesh /cost:abc");
    expect(result.cleanPrompt).toBe("explain mesh");
    expect(result.hints.costCapUsd).toBeUndefined();
  });

  it("first occurrence wins on duplicate cost hints", () => {
    const result = extractPromptHints(
      "/cost:0.5 /cost:1.0 explain mesh",
    );
    expect(result.hints.costCapUsd).toBe(0.5);
  });

  it("first occurrence wins on duplicate provider hints", () => {
    const result = extractPromptHints(
      "/provider:openai /provider:ollama explain mesh",
    );
    expect(result.hints.providerHint).toBe("openai");
  });

  it("collapses multiple whitespace from the strip", () => {
    // The strip leaves a double-space; the
    // collapse + trim cleans it up.
    const result = extractPromptHints(
      "explain mesh /cost:0.5  please",
    );
    expect(result.cleanPrompt).toBe("explain mesh please");
  });

  it("does NOT match plain 'cost:0.5' (Q1 — slash is required)", () => {
    // Plain `cost:0.5` (no slash) is too
    // ambiguous — would match legitimate
    // English text. The slash is the
    // "command marker".
    const result = extractPromptHints("cost:0.5 explain mesh");
    expect(result.hints.costCapUsd).toBeUndefined();
    expect(result.cleanPrompt).toBe("cost:0.5 explain mesh");
  });

  it("preserves the original prompt's signal-bearing tokens (Q2 — signal after hint)", () => {
    // The signal scan uses the ORIGINAL
    // prompt (not the cleanPrompt). A
    // signal after the hint should still
    // fire.
    const result = extractPromptHints("/cost:0.5 explain the mesh");
    expect(result.cleanPrompt).toBe("explain the mesh");
    // The cost cap is recorded on the hints.
    expect(result.hints.costCapUsd).toBe(0.5);
    // The signal scan (caller's job) still
    // sees "mesh" in the original prompt —
    // this is just a unit test of the
    // extraction, not the signal scan.
  });
});

describe("routeUserPrompt — v1.5 inline hint integration", () => {
  it("threads the parsed cost cap through to the decision", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "explain the mesh /cost:0.5",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.costCapUsd).toBe(0.5);
    expect(decision.providerHint).toBeUndefined();
    expect(decision.cleanPrompt).toBe("explain the mesh");
  });

  it("threads the parsed provider hint through to the decision", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/provider:ollama explain the mesh",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.providerHint).toBe("ollama");
    expect(decision.costCapUsd).toBeUndefined();
    expect(decision.cleanPrompt).toBe("explain the mesh");
  });

  it("threads both hints through + strips the cleanPrompt", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/cost:1.0 /provider:anthropic explain the mesh",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.costCapUsd).toBe(1.0);
    expect(decision.providerHint).toBe("anthropic");
    expect(decision.cleanPrompt).toBe("explain the mesh");
  });

  it("cleanPrompt equals the original prompt when no hints are present", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "what is the weather today",
        isEnvoyHarnessReady: false,
      }),
    );
    expect(decision.reason).toBe("default");
    expect(decision.cleanPrompt).toBe("what is the weather today");
    expect(decision.costCapUsd).toBeUndefined();
    expect(decision.providerHint).toBeUndefined();
  });

  it("signals after a hint still fire (the signal scan uses the original prompt)", () => {
    // Q2 — the hint is inline anywhere; the
    // signal scan uses the original prompt
    // (with the hint) so a signal after the
    // hint still fires.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/cost:0.5 explain the mesh",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.costCapUsd).toBe(0.5);
    expect(decision.cleanPrompt).toBe("explain the mesh");
  });

  it("hints are NOT extracted on opt-in-disabled (the router short-circuits before extraction; cleanPrompt is the original)", () => {
    // The opt-in check is the FIRST branch;
    // it short-circuits before hint extraction.
    // The cleanPrompt is the original (no
    // extraction happened). This is a
    // conscious design — when opt-in is off,
    // we don't care about the hints.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/cost:0.5 explain the mesh",
        signalOptIn: "disabled",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-in-disabled");
    expect(decision.costCapUsd).toBeUndefined();
    expect(decision.providerHint).toBeUndefined();
    expect(decision.cleanPrompt).toBe("/cost:0.5 explain the mesh");
  });
});

// ---------------------------------------------------------------------------
// Phase 8 / v1.6 — `!openclaw` opt-out + v0 corner-case fix
// ---------------------------------------------------------------------------

describe("routeUserPrompt — v1.6 `!openclaw` opt-out", () => {
  it("routes to OpenClaw with reason: opt-out-explicit when `!openclaw` is the only prefix", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!openclaw translate this to French",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-out-explicit");
    expect(decision.runtime).toBe("openclaw");
    // The `!openclaw` prefix is reported as a signal
    // + its length (9) is the hintPrefixLength.
    expect(decision.hintPrefixLength).toBe(9);
    expect(decision.signals[0]?.token).toBe("!openclaw");
    expect(decision.targetSkill).toBeUndefined();
  });

  it("`!openclaw` overrides other signals (e.g. mesh) — the opt-out is the safety net", () => {
    // The prompt has BOTH `!openclaw` AND `mesh`
    // (an EH signal). The opt-out wins.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!openclaw explain the mesh",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-out-explicit");
    expect(decision.runtime).toBe("openclaw");
    // The `mesh` signal is still in the list
    // (for the audit log) but the runtime is
    // OpenClaw.
    expect(
      decision.signals.some((s) => s.token === "mesh"),
    ).toBe(true);
  });

  it("`!openclaw` strips v1.5 inline hints from the cleanPrompt (Q6)", () => {
    // The user typed both `!openclaw` AND
    // v1.5 hints. The v1.5 hints are stripped
    // from the cleanPrompt; they're still on
    // the decision (for the audit log) but
    // not threaded to OpenClaw.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!openclaw translate this /cost:0.5 /provider:openai",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-out-explicit");
    expect(decision.cleanPrompt).toBe("!openclaw translate this");
    // The v1.5 hints are still on the decision
    // (for the audit log) — but the dispatch
    // ignores them on the OpenClaw path.
    expect(decision.costCapUsd).toBe(0.5);
    expect(decision.providerHint).toBe("openai");
  });

  it("`!openclaw` is case-insensitive (matches v0 `!eh` case-insensitivity)", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!OPENCLAW translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-out-explicit");
    expect(decision.runtime).toBe("openclaw");
  });

  it("`!eh !openclaw translate` → EH (the order in HINT_PREFIXES is !openclaw first; user typed !eh first so it wins)", () => {
    // Q5 — the order in HINT_PREFIXES is the
    // precedence order. The first prefix at
    // offset 0 wins. Here, `!eh` is at offset
    // 0, so the v0 prefix scan matches `!eh`
    // first.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!eh !openclaw translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("`!openclaw !eh translate` → OpenClaw (the order in HINT_PREFIXES is !openclaw first; !openclaw is at offset 0)", () => {
    // Q5 — `!openclaw` is first in HINT_PREFIXES;
    // when at offset 0, it matches first.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!openclaw !eh translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-out-explicit");
    expect(decision.runtime).toBe("openclaw");
    expect(decision.hintPrefixLength).toBe(9);
  });

  it("`!openclaw` with opt-in-disabled still routes to OpenClaw (opt-in-disabled is the first branch; Q7)", () => {
    // Q7 — opt-in-disabled wins over `!openclaw`.
    // The router short-circuits before the
    // opt-out check. The opt-in check is the
    // first branch.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!openclaw translate this",
        signalOptIn: "disabled",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-in-disabled");
    expect(decision.runtime).toBe("openclaw");
    // The opt-in-disabled branch doesn't extract
    // v1.5 hints + doesn't scan for v0 prefixes.
    expect(decision.hintPrefixLength).toBeUndefined();
    expect(decision.cleanPrompt).toBe("!openclaw translate this");
  });
});

describe("routeUserPrompt — v1.6 v0 corner-case fix (re-scan cleanPrompt for v0 prefixes)", () => {
  it("`/cost:0.5 !eh translate` → EH (the v0 corner case: !eh masked by v1.5 hint, cleanPrompt re-scan finds it)", () => {
    // Q8 — the cleanPrompt re-scan fixes the v0
    // corner case. The original prompt starts
    // with `/cost:0.5`; the v0 prefix scan
    // (which uses the original) doesn't find
    // `!eh`. The cleanPrompt re-scan (which uses
    // the v1.5-stripped prompt) starts with
    // `!eh`; it finds the v0 prefix.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/cost:0.5 !eh translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.hintPrefixLength).toBe(3);
    expect(decision.cleanPrompt).toBe("!eh translate this");
  });

  it("`/cost:0.5 !openclaw translate` → OpenClaw (the v0 corner case for !openclaw, cleanPrompt re-scan finds it)", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/cost:0.5 !openclaw translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-out-explicit");
    expect(decision.runtime).toBe("openclaw");
    expect(decision.hintPrefixLength).toBe(9);
    expect(decision.cleanPrompt).toBe("!openclaw translate this");
  });

  it("`!eh /cost:0.5 translate` → EH (original scan finds !eh; no re-scan needed)", () => {
    // The original prompt starts with `!eh`; the
    // v0 prefix scan finds it. The cleanPrompt
    // re-scan is a no-op (the original already
    // had a v0 prefix).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!eh /cost:0.5 translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("`mesh /cost:0.5 !eh translate` → EH (mesh signal wins; !eh is NOT detected because v0 prefix is not at start)", () => {
    // **Known v0 corner case (not fully fixed by
    // the cleanPrompt re-scan):** the v0 prefix
    // scan checks the START of the prompt
    // (trimmed). When the v1.5 hint is in the
    // MIDDLE (after `mesh`), the cleanPrompt
    // re-scan still doesn't find `!eh` (it's
    // not at the start of the cleanPrompt
    // either). The mesh signal wins, and the
    // LLM sees `mesh !eh translate` (the `!eh`
    // is leaked to the LLM). This is a v0
    // design limitation; a future chunk could
    // fix it by scanning the whole prompt for
    // v0 prefixes.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "mesh /cost:0.5 !eh translate this",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.runtime).toBe("envoy-harness");
    // The `!eh` is NOT detected (not at the
    // start of either the original or the
    // cleanPrompt), so the hintPrefixLength
    // is undefined. The LLM sees the original
    // cleanPrompt (with the leaked `!eh`).
    expect(decision.hintPrefixLength).toBeUndefined();
    expect(decision.cleanPrompt).toBe("mesh !eh translate this");
  });

  it("`/cost:0.5 /provider:openai mesh` → OpenClaw (no v0 prefix in either scan; default OpenClaw)", () => {
    // The v1.5 hints are stripped, the cleanPrompt
    // is just `mesh`. The cleanPrompt re-scan
    // finds `mesh` (a v1.1 dynamic tag, NOT an
    // explicit-hint). No v0 prefix anywhere.
    // The router routes to OpenClaw on `mesh` +
    // envoy-harness-unready (or envoy-harness +
    // free-form LLM ask, depending on readiness).
    // Here, envoy-harness is NOT ready.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "/cost:0.5 /provider:openai mesh",
        isEnvoyHarnessReady: false,
      }),
    );
    expect(decision.reason).toBe("envoy-harness-unready");
    expect(decision.runtime).toBe("openclaw");
    expect(decision.hintPrefixLength).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 8 / v1.7 — OpenClaw tags as negative signals
// ---------------------------------------------------------------------------

describe("routeUserPrompt — v1.7 OpenClaw tags as negative signals", () => {
  it("routes to OpenClaw when the prompt matches an OpenClaw tag (the negative rule)", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "write a creative story for me",
        openClawTags: ["creative", "writing", "story"],
        isEnvoyHarnessReady: true,
      }),
    );
    // The OpenClaw tag "creative" matches the
    // prompt; the negative rule routes to
    // OpenClaw regardless of EH readiness.
    expect(decision.reason).toBe("openclaw-tag-match");
    expect(decision.runtime).toBe("openclaw");
    // The matched OpenClaw tag is in the
    // signals list (for the audit log).
    expect(
      decision.signals.some((s) => s.token === "creative"),
    ).toBe(true);
  });

  it("OpenClaw tag vetoes EH signal (Q2 — veto semantics)", () => {
    // The prompt has BOTH an OpenClaw tag
    // ("creative") AND an EH tag (via the
    // MESH_KEYWORDS fallback — "mesh"). The
    // negative rule wins (veto).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "write a creative story about the mesh",
        openClawTags: ["creative", "writing"],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("openclaw-tag-match");
    expect(decision.runtime).toBe("openclaw");
    // Both signals are in the list (for
    // the audit log).
    expect(
      decision.signals.some((s) => s.token === "creative"),
    ).toBe(true);
    expect(
      decision.signals.some((s) => s.token === "mesh"),
    ).toBe(true);
  });

  it("`!eh` prefix overrides the OpenClaw tag (Q3 — explicit prefix wins)", () => {
    // The user types `!eh write a creative
    // story` — the !eh prefix is an explicit
    // EH route. The OpenClaw tag matches, but
    // the !eh prefix wins.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "!eh write a creative story for me",
        openClawTags: ["creative", "writing"],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.runtime).toBe("envoy-harness");
    expect(decision.hintPrefixLength).toBe(3);
  });

  it("OpenClaw tag that is also an EH tag — EH wins (Q4 — shared tag precedence)", () => {
    // The prompt has "mesh", which is BOTH
    // an EH tag (MESH_KEYWORDS fallback) AND
    // an OpenClaw tag. The positive rule wins.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "explain the mesh",
        openClawTags: ["mesh", "creative"],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("signal");
    expect(decision.runtime).toBe("envoy-harness");
  });

  it("OpenClaw tag with opt-in-disabled — opt-in-disabled wins (Q7)", () => {
    // Opt-in-disabled is the first branch;
    // the OpenClaw tag scan never runs.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "write a creative story for me",
        openClawTags: ["creative", "writing"],
        signalOptIn: "disabled",
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("opt-in-disabled");
    expect(decision.runtime).toBe("openclaw");
  });

  it("`openClawTags: undefined` → no negative signal scan (Q10 — backward compat)", () => {
    // When `openClawTags` is undefined, the
    // v1.6 behavior is preserved (no negative
    // signal scan).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "write a creative story for me",
        // openClawTags: undefined (omitted)
        isEnvoyHarnessReady: true,
      }),
    );
    // No OpenClaw tag scan, no signals
    // match (no EH tags either), default
    // OpenClaw.
    expect(decision.reason).toBe("default");
    expect(decision.runtime).toBe("openclaw");
  });

  it("`openClawTags: []` → no negative signal scan (Q9 — empty array)", () => {
    const decision = routeUserPrompt(
      makeInput({
        prompt: "write a creative story for me",
        openClawTags: [],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("default");
    expect(decision.runtime).toBe("openclaw");
  });

  it("hyphenated OpenClaw tag matches exactly (Q5 — same as v1.1)", () => {
    // Hyphenated tags use exact substring
    // (not word-boundary). "creative-writing"
    // matches "creative-writing" but NOT
    // "creative" + "writing" separately.
    const decision = routeUserPrompt(
      makeInput({
        prompt: "do some creative-writing for me",
        openClawTags: ["creative-writing"],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("openclaw-tag-match");
    expect(decision.runtime).toBe("openclaw");
  });

  it("OpenClaw tag with v1.5 inline hints — hints are stripped, OpenClaw tag still routes", () => {
    // The v1.5 hints are stripped from the
    // cleanPrompt; the OpenClaw tag scan
    // uses the original prompt (consistent
    // with v1.1 + v1.2 + v1.6).
    const decision = routeUserPrompt(
      makeInput({
        prompt: "write a creative story /cost:0.5 /provider:openai",
        openClawTags: ["creative", "writing"],
        isEnvoyHarnessReady: true,
      }),
    );
    expect(decision.reason).toBe("openclaw-tag-match");
    expect(decision.runtime).toBe("openclaw");
    // The v1.5 hints are still on the
    // decision (for the audit log).
    expect(decision.costCapUsd).toBe(0.5);
    expect(decision.providerHint).toBe("openai");
  });
});
