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
