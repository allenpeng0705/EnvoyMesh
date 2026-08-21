/**
 * Phase 8 / Step 5 — e2e tests for the
 * `runOwnerAgentTurnViaRuntime` routing integration.
 *
 * **What this covers:** the host-side wiring of the
 * signal router. The router's algorithm in isolation
 * is tested in `user-prompt-router.test.ts` (41 unit
 * tests). This file verifies that the dispatch:
 * 1. Calls `askEnvoyHarness` when the prompt
 *    contains a signal + EH is ready.
 * 2. Strips the hint prefix before any LLM call
 *    (so the LLM doesn't see `!eh` / `/eh`).
 * 3. Falls back to OpenClaw when the prompt
 *    contains a signal but EH is unready.
 * 4. Defaults to OpenClaw when the prompt has
 *    no signal.
 * 5. Respects `signalOptIn: "disabled"`.
 *
 * **Hermetic:** all tests use a fake
 * `askOpenClaw` + `askEnvoyHarness` on the
 * context. No real LLM, no real network.
 *
 * **Why these tests are e2e not unit:** the
 * `runOwnerAgentTurnViaRuntime` is the
 * integration point where the router's
 * decision becomes a real dispatch.
 * Verifying the dispatch behavior in
 * isolation requires the same context
 * builder the production uses — that's
 * what this file does.
 */

import { describe, expect, it, vi } from "vitest";

import {
  runOwnerAgentTurnViaRuntime,
  type RunOwnerAgentTurnContext,
} from "../src/node-service-handlers-run-owner-agent-turn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal `RunOwnerAgentTurnContext`
 * with spies. Defaults:
 *  - `ensureOpenClawReady: true` (OpenClaw is
 *    the default fallback; available unless
 *    the test overrides)
 *  - `signalOptIn: "enabled"` (router can
 *    pick EH when signals match; tests that
 *    want to disable override)
 *  - `isEnvoyHarnessReady: false` (EH not
 *    ready; tests that want EH dispatch
 *    override)
 *  - `askOpenClaw` returns "openclaw answer"
 *  - `askEnvoyHarness` returns
 *    "envoy-harness answer"
 *  - `runDocumentAgentTurnCore` returns
 *    `{ answer: "native answer" }` (deep
 *    fallback; usually not called)
 *  - `getScriptedTutorState` returns
 *    `null` (no scripted tutor; deep fallback
 *    falls to native planner)
 */
function makeCtx(
  overrides: Partial<RunOwnerAgentTurnContext> = {},
): {
  ctx: RunOwnerAgentTurnContext;
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {
    recordOwnerActivity: vi.fn(),
    ensureOpenClawReady: vi.fn(async () => true),
    beginOpenClawToolTracking: vi.fn(),
    endOpenClawToolTracking: vi.fn(() => []),
    buildOpenClawTurnContext: vi.fn(async () => ({})),
    askOpenClaw: vi.fn(async () => "openclaw answer"),
    isEnvoyHarnessReady: vi.fn(() => false),
    askEnvoyHarness: vi.fn(async () => "envoy-harness answer"),
    // Phase 8 / v1.2 — per-skill dispatch. The
    // default returns a text-formatted answer;
    // tests that need B-class (structured)
    // behavior override this. The default
    // `getNodeManifest: () => undefined` means
    // the v1.1 signal scan uses the v0 fallback
    // (no per-skill matching); v1.2 e2e tests
    // override both spies.
    askEnvoyHarnessSkill: vi.fn(
      async () => "skill answer",
    ),
    signalOptIn: "enabled",
    // Phase 8 / v1.1 — manifest read. The default
    // returns `undefined` so the existing 23 tests
    // continue to use the v0 `MESH_KEYWORDS` fallback
    // (the router's `envoyHarnessTags === undefined`
    // path). The v1.1 dynamic-vocabulary tests
    // (below) override this to inject a manifest
    // with specific tags.
    getNodeManifest: vi.fn(() => undefined),
    persistEnvoyAiChatExchange: vi.fn(async () => undefined),
    recordEnvoyAiHumanOutgoing: vi.fn(async () => undefined),
    maybeIngestTerminalAssistantReply: vi.fn(),
    getRagService: vi.fn(() => ({})),
    getTaskStore: vi.fn(() => ({})),
    runDocumentAgentTurnCore: vi.fn(async () => ({
      answer: "native answer",
      domain: "knowledge",
    })),
    getApprovalQueue: vi.fn(() => ({})),
    getScriptedTutorState: vi.fn(async () => null),
  };
  const ctx: RunOwnerAgentTurnContext = {
    ...spies,
    ...overrides,
  } as never;
  // **Self-review fix:** when a test overrides a
  // method (e.g. `isEnvoyHarnessReady: vi.fn(()
  // => true)`), the `ctx` now points at the
  // overridden function, but `spies` still has
  // the original default. Sync the spies from
  // ctx so the test asserts on the function
  // actually called. This is a common vitest
  // gotcha — the pattern `const ctx = {
  // ...spies, ...overrides }` puts overrides
  // in ctx but the spy object keeps the
  // original refs.
  for (const key of Object.keys(spies)) {
    const override = (overrides as Record<string, unknown>)[key];
    if (override !== undefined) {
      (spies as Record<string, unknown>)[key] = override;
    }
  }
  return { ctx, spies };
}

// ---------------------------------------------------------------------------
// 1. Default branch — no signal, OpenClaw
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — default branch", () => {
  it("routes an ordinary prompt to OpenClaw", async () => {
    const { ctx, spies } = makeCtx();
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "translate this article to French",
    );
    expect(out.modelUsed).toBe("openclaw");
    expect(out.answer).toBe("openclaw answer");
    expect(out.routingReason).toBe("default");
    expect(out.routingSignals).toEqual([]);
    expect(spies.askEnvoyHarness).not.toHaveBeenCalled();
    expect(spies.askOpenClaw).toHaveBeenCalledTimes(1);
    // Default branch: the LLM sees the
    // original prompt (no hint to strip).
    expect(spies.askOpenClaw).toHaveBeenCalledWith(
      "translate this article to French",
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Signal branch — mesh keyword, EH ready
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — signal branch (EH ready)", () => {
  it("routes a `mesh` keyword prompt to envoy-harness", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent for this task",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.answer).toBe("envoy-harness answer");
    expect(out.routingReason).toBe("signal");
    expect(out.routingSignals).toEqual(["mesh"]);
    expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    expect(spies.askOpenClaw).not.toHaveBeenCalled();
  });

  it("routes a `federated` keyword prompt to envoy-harness", async () => {
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "federated scoreboard query for peer X",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingSignals).toEqual(["federated"]);
  });

  it("routes a `cross-node` keyword prompt to envoy-harness", async () => {
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "spawn a cross-node verifier rule",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingSignals).toEqual(["cross-node"]);
  });

  it("routes a `RemoteMeshSubmitter` tool name to envoy-harness", async () => {
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "spawn via RemoteMeshSubmitter please",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    // v1.1: only the tool-name signal matches.
    // The v0 substring FP (`Mesh` inside
    // `RemoteMeshSubmitter`) is gone with the
    // word-boundary algorithm (Q6 follow-up).
    expect(out.routingSignals).toContain("RemoteMeshSubmitter");
  });

  it("routes a `lsp_goto_definition` tool name to envoy-harness", async () => {
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "use lsp_goto_definition on this file",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingSignals).toEqual(["lsp_goto_definition"]);
  });

  it("captures multiple signals in the result (mesh + tool)", async () => {
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent and call lsp_goto_definition",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingSignals).toContain("mesh");
    expect(out.routingSignals).toContain("lsp_goto_definition");
  });
});

// ---------------------------------------------------------------------------
// 3. EH-unready branch — signal matched but EH not ready
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — envoy-harness-unready branch", () => {
  it("falls back to OpenClaw when signal matched but EH unready", async () => {
    // Default `isEnvoyHarnessReady: () => false`.
    const { ctx, spies } = makeCtx();
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent",
    );
    expect(out.modelUsed).toBe("openclaw");
    expect(out.answer).toBe("openclaw answer");
    expect(out.routingReason).toBe("envoy-harness-unready");
    // Signals still populated so the UI can surface.
    expect(out.routingSignals).toEqual(["mesh"]);
    expect(spies.askEnvoyHarness).not.toHaveBeenCalled();
    expect(spies.askOpenClaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. EH-error branch — ready but call failed
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — envoy-harness-error branch", () => {
  it("falls back to OpenClaw when EH ready but askEnvoyHarness throws", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      askEnvoyHarness: vi.fn(async () => {
        throw new Error("envoy-harness API down");
      }),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent",
    );
    // Falls back to OpenClaw (the next-best AI engine).
    expect(out.modelUsed).toBe("openclaw");
    expect(out.answer).toBe("openclaw answer");
    // The router's original decision is preserved
    // in `routingReason` (the call failed AFTER
    // the router chose EH).
    expect(out.routingReason).toBe("signal");
    expect(out.routingSignals).toEqual(["mesh"]);
    expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    expect(spies.askOpenClaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. opt-in-disabled branch
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — opt-in-disabled branch", () => {
  it("forces OpenClaw when opt-in is disabled (even with signals)", async () => {
    const { ctx, spies } = makeCtx({
      signalOptIn: "disabled",
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent for federated tasks",
    );
    expect(out.modelUsed).toBe("openclaw");
    expect(out.answer).toBe("openclaw answer");
    expect(out.routingReason).toBe("opt-in-disabled");
    // Signals are empty when opt-in is disabled
    // (the owner turned off signal routing, so
    // reporting which signals WOULD have fired
    // is noise).
    expect(out.routingSignals).toEqual([]);
    expect(spies.askEnvoyHarness).not.toHaveBeenCalled();
    expect(spies.askOpenClaw).toHaveBeenCalledTimes(1);
  });

  it("forces OpenClaw when opt-in is disabled (no signal, no change)", async () => {
    const { ctx } = makeCtx({ signalOptIn: "disabled" });
    const out = await runOwnerAgentTurnViaRuntime(ctx, "hi");
    expect(out.modelUsed).toBe("openclaw");
    expect(out.routingReason).toBe("opt-in-disabled");
  });
});

// ---------------------------------------------------------------------------
// 6. Hint prefix stripping
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — hint prefix stripping", () => {
  it("strips `!eh` hint before calling envoy-harness", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "!eh translate this to French",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    // v1.5 — the ask method now accepts the
    // v1.5 prompt hints (providerHint +
    // costCapUsd). The dispatch passes them
    // as the 2nd arg. The test prompt has no
    // hints, so both fields are undefined.
    expect(spies.askEnvoyHarness).toHaveBeenCalledWith(
      "translate this to French",
      { providerHint: undefined, costCapUsd: undefined },
    );
    // The LLM never saw the `!eh` prefix.
  });

  it("strips `/eh` hint before calling envoy-harness", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "/eh translate this to French",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(spies.askEnvoyHarness).toHaveBeenCalledWith(
      "translate this to French",
      { providerHint: undefined, costCapUsd: undefined },
    );
  });

  it("strips `!eh` hint even when OpenClaw is the chosen runtime (no signal beyond the hint)", async () => {
    // `!eh translate this` — hint is the only signal.
    // With EH ready, routes to EH. But if we test
    // the case where EH is unready + hint: the
    // OpenClaw fallback also gets the stripped
    // prompt.
    const { ctx, spies } = makeCtx({
      // Default `isEnvoyHarnessReady: false`.
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "!eh translate this to French",
    );
    expect(out.modelUsed).toBe("openclaw");
    expect(out.routingReason).toBe("envoy-harness-unready");
    expect(spies.askOpenClaw).toHaveBeenCalledWith(
      "translate this to French",
      expect.anything(),
    );
  });

  it("strips hint after leading whitespace", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "   !eh do the thing",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(spies.askEnvoyHarness).toHaveBeenCalledWith("do the thing", {
      providerHint: undefined,
      costCapUsd: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Fallback chain preservation
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — fallback chain preserved", () => {
  it("falls back to native planner when both EH and OpenClaw fail", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      askEnvoyHarness: vi.fn(async () => {
        throw new Error("EH down");
      }),
      askOpenClaw: vi.fn(async () => {
        throw new Error("OpenClaw down");
      }),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent",
    );
    // Deep fallback to native planner.
    expect(out.modelUsed).toBe("native");
    expect(out.answer).toBe("native answer");
    // The router's decision is preserved even
    // in the deep fallback.
    expect(out.routingReason).toBe("signal");
    expect(out.routingSignals).toEqual(["mesh"]);
    expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    expect(spies.askOpenClaw).toHaveBeenCalledTimes(1);
    expect(spies.runDocumentAgentTurnCore).toHaveBeenCalledTimes(1);
  });

  it("falls back through the deep-fallback chain when all AI engines fail", async () => {
    // The full chain: EH (ready + throws) →
    // OpenClaw (throws) → scripted-tutor (no
    // match for this prompt) → native planner.
    // The exact `modelUsed` depends on whether
    // the scripted tutor matches the prompt;
    // we don't assert on that here. The point
    // is: the routing fields are preserved
    // through the deep fallback.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      askEnvoyHarness: vi.fn(async () => {
        throw new Error("EH down");
      }),
      askOpenClaw: vi.fn(async () => {
        throw new Error("OpenClaw down");
      }),
      getScriptedTutorState: vi.fn(async () => null),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent",
    );
    // Both AI engines were tried.
    expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    expect(spies.askOpenClaw).toHaveBeenCalledTimes(1);
    // The deep fallback hit the native planner.
    expect(out.modelUsed).toBe("native");
    // The router's original decision is preserved
    // in `routingReason` — the user typed a
    // signal-bearing prompt; the engine chain
    // just couldn't service it.
    expect(out.routingReason).toBe("signal");
    expect(out.routingSignals).toEqual(["mesh"]);
  });
});

// ---------------------------------------------------------------------------
// 8. Result shape — routing fields always present
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — result shape", () => {
  it("result includes routingReason and routingSignals on OpenClaw path", async () => {
    const { ctx } = makeCtx();
    const out = await runOwnerAgentTurnViaRuntime(ctx, "hello");
    expect(out).toHaveProperty("routingReason");
    expect(out).toHaveProperty("routingSignals");
    expect(out.routingReason).toBe("default");
    expect(out.routingSignals).toEqual([]);
  });

  it("result includes routingReason and routingSignals on envoy-harness path", async () => {
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "spawn a mesh sub-agent",
    );
    expect(out.routingReason).toBe("signal");
    expect(out.routingSignals).toEqual(["mesh"]);
  });

  it("result includes routingReason and routingSignals on the deep-fallback path", async () => {
    // Force the deep fallback to native planner.
    const { ctx } = makeCtx({
      ensureOpenClawReady: vi.fn(async () => false),
    });
    const out = await runOwnerAgentTurnViaRuntime(ctx, "hi");
    // Deep fallback to native. The router still
    // ran (no signals → `default`), so the
    // result carries the routing fields.
    expect(out.modelUsed).toBe("native");
    expect(out.routingReason).toBe("default");
    expect(out.routingSignals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9. Persistence — every dispatch path persists the exchange
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — persistence invariant", () => {
  it("persists the exchange on the OpenClaw path", async () => {
    const { ctx, spies } = makeCtx();
    await runOwnerAgentTurnViaRuntime(ctx, "hi");
    expect(spies.persistEnvoyAiChatExchange).toHaveBeenCalledTimes(1);
  });

  it("persists the exchange on the envoy-harness path", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    await runOwnerAgentTurnViaRuntime(ctx, "set up a mesh sub-agent");
    expect(spies.persistEnvoyAiChatExchange).toHaveBeenCalledTimes(1);
  });

  it("persists the exchange on the deep-fallback path (native)", async () => {
    const { ctx, spies } = makeCtx({
      ensureOpenClawReady: vi.fn(async () => false),
    });
    await runOwnerAgentTurnViaRuntime(ctx, "hi");
    expect(spies.persistEnvoyAiChatExchange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Phase 8 / v1.1 — manifest-tag dynamic vocabulary
// ---------------------------------------------------------------------------

/**
 * The v1.1 host wiring. The runtime reads the
 * merged manifest via `ctx.getNodeManifest()`,
 * extracts envoy-harness skill tags, and passes
 * them to `routeUserPrompt` as the primary
 * vocabulary. The v0 `MESH_KEYWORDS` constant
 * is the fallback when the manifest is
 * unavailable (Q6 of the v1.1 sub-plan).
 *
 * The default `makeCtx` returns `undefined` from
 * `getNodeManifest()` (preserves the v0 fallback
 * for the 23 tests above). The tests in this
 * section override with a custom manifest.
 */
describe("runOwnerAgentTurnViaRuntime — v1.1 manifest-tag dynamic vocabulary", () => {
  /**
   * Build a minimal `NodeManifest` exposing one
   * envoy-harness skill with the given tags. The
   * shape mirrors `aggregateNodeManifest()`'s
   * output (see
   * `agent-adapter-manifest-aggregate.ts:67-107`).
   */
  function makeManifest(envoyHarnessTags: ReadonlyArray<string>) {
    return {
      peerId: "test-node",
      runtimes: [
        { runtime: "envoy-harness" as const, runtimeVersion: "test" },
        { runtime: "openclaw" as const, runtimeVersion: "test" },
      ],
      skills: [
        {
          skillId: "test-skill",
          description: "test",
          costCeilingUsd: undefined,
          maxSensitivity: "public" as const,
          tags: envoyHarnessTags,
          runtime: "envoy-harness" as const,
        },
      ],
    };
  }

  it("routes a manifest-tag keyword to envoy-harness", async () => {
    // The manifest exposes `mesh` (from a
    // envoy-harness skill). The prompt contains
    // `mesh`. The router matches the dynamic
    // vocabulary (not the v0 list) and routes
    // to EH.
    //
    // Phase 8 / v1.2 — the test mock manifest
    // has a single skill with tags
    // `["mesh", "observability"]`. The prompt
    // "set up a mesh sub-agent" matches `mesh`
    // (1 tag). The v1.2 per-skill matching
    // uniquely picks the test skill → the
    // dispatch uses the per-skill path
    // (`routingReason: "signal-skill"`,
    // `askEnvoyHarnessSkill` called).
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(["mesh", "observability"])),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent for this task",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingReason).toBe("signal-skill");
    expect(out.routingSignals).toContain("mesh");
    expect(out.targetSkill).toBe("test-skill");
    expect(spies.askEnvoyHarnessSkill).toHaveBeenCalledTimes(1);
  });

  it("does NOT route a v0-keyword that is not in the manifest (e.g. `federated`)", async () => {
    // The v0 `MESH_KEYWORDS` constant includes
    // `federated` + `cross-node`, but the
    // default envoy-harness manifest doesn't
    // expose either. With the v1.1 dynamic
    // vocabulary, a prompt with `federated`
    // does NOT route to EH (the v0 fallback
    // is bypassed when the manifest is
    // available).
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(["mesh", "observability"])),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "federated scoreboard query for peer X",
    );
    expect(out.modelUsed).toBe("openclaw");
    expect(out.routingReason).toBe("default");
    expect(out.routingSignals).toEqual([]);
    expect(spies.askEnvoyHarness).not.toHaveBeenCalled();
  });

  it("falls back to v0 MESH_KEYWORDS when the manifest is undefined", async () => {
    // When `getNodeManifest` returns `undefined`
    // (older host, early init, or read failure),
    // the router uses the v0 `MESH_KEYWORDS`
    // constant as the fallback. The v0 list
    // includes `federated`; a prompt with
    // `federated` does route to EH.
    const { ctx } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => undefined),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "federated scoreboard query for peer X",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingSignals).toContain("federated");
  });

  it("falls back to v0 MESH_KEYWORDS when getNodeManifest throws", async () => {
    // Q6 of the v1.1 sub-plan — the runtime
    // wraps the manifest read in a `try/catch`
    // and logs a warning. The router gets
    // `undefined` tags and uses the v0 fallback.
    // The user's prompt still works.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => {
        throw new Error("manifest store crashed");
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await runOwnerAgentTurnViaRuntime(
        ctx,
        "set up a mesh sub-agent",
      );
      expect(out.modelUsed).toBe("envoy-harness");
      expect(out.routingSignals).toContain("mesh");
      // Q6 — warning logged with the failure
      // reason so the owner can debug.
      expect(warnSpy).toHaveBeenCalled();
      const firstCall = warnSpy.mock.calls[0];
      expect(String(firstCall?.[0] ?? "")).toContain("getNodeManifest");
    } finally {
      warnSpy.mockRestore();
      void spies;
    }
  });

  it("routes a manifest tag that v0 MESH_KEYWORDS didn't have (e.g. `code`)", async () => {
    // The v0 constant didn't have `code`; the
    // v1.1 dynamic vocabulary is whatever tags
    // the envoy-harness skills expose. A
    // prompt with `code` matches when the
    // manifest has a `code` tag.
    //
    // Phase 8 / v1.2 — the test mock manifest
    // has a single skill with tags
    // `["code", "edit"]`. The prompt "review
    // this code for me" matches `code` (1 tag).
    // The v1.2 per-skill matching uniquely picks
    // the test skill → the dispatch uses the
    // per-skill path.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(["code", "edit"])),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "review this code for me",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingSignals).toContain("code");
    expect(out.targetSkill).toBe("test-skill");
    expect(out.routingReason).toBe("signal-skill");
    expect(spies.askEnvoyHarnessSkill).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Phase 8 / v1.2 — per-skill dispatch
// ---------------------------------------------------------------------------

/**
 * The v1.2 dispatch. When the router picks a
 * specific envoy-harness skill (Q1 — uniquely-held
 * threshold; tie → fall through), the host calls
 * `askEnvoyHarnessSkill(message, skillId)`
 * instead of `askEnvoyHarness(message)`. The
 * result's `targetSkill` is set + `routingReason`
 * is `"signal-skill"`.
 *
 * Failure modes (Q2 + Q7):
 * - The skill returns a `structured` first block
 *   (B-class) → `askEnvoyHarnessSkill` throws
 *   `StructuredResultError` → dispatch falls
 *   through to `askEnvoyHarness`.
 * - The skill throws any other error → dispatch
 *   falls through to `askEnvoyHarness`.
 * - The router doesn't pick a unique skill (tie)
 *   → `decision.targetSkill` is undefined → v1.1
 *   free-form LLM ask path.
 */
describe("runOwnerAgentTurnViaRuntime — v1.2 per-skill dispatch", () => {
  // The 8 envoy-harness skills' tags. Mirrors
  // ENVOY_HARNESS_SKILLS (from envoy-harness-adapter/src/skills.ts).
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

  /**
   * Build a minimal `NodeManifest` exposing the
   * given skills. The shape mirrors
   * `aggregateNodeManifest()`'s output.
   */
  function makeManifest(
    skills: ReadonlyArray<{ skillId: string; tags: ReadonlyArray<string> }>,
  ) {
    return {
      peerId: "test-node",
      runtimes: [
        { runtime: "envoy-harness" as const, runtimeVersion: "test" },
        { runtime: "openclaw" as const, runtimeVersion: "test" },
      ],
      skills: skills.map((s) => ({
        skillId: s.skillId,
        description: "test",
        costCeilingUsd: undefined,
        maxSensitivity: "public" as const,
        tags: s.tags,
        runtime: "envoy-harness" as const,
      })),
    };
  }

  it("routes a unique-best skill to askEnvoyHarnessSkill (not askEnvoyHarness)", async () => {
    // "set up a mesh sponsor bond" uniquely
    // matches `setup-sponsor-friend` (mesh + sponsor;
    // peer-list + relay-status only have `mesh`).
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(ENVOY_HARNESS_SKILLS)),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sponsor bond",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingReason).toBe("signal-skill");
    expect(out.targetSkill).toBe("setup-sponsor-friend");
    expect(spies.askEnvoyHarnessSkill).toHaveBeenCalledTimes(1);
    expect(spies.askEnvoyHarnessSkill).toHaveBeenCalledWith(
      "set up a mesh sponsor bond",
      "setup-sponsor-friend",
      { providerHint: undefined, costCapUsd: undefined },
    );
    // The free-form LLM ask is NOT called when
    // the per-skill path succeeds.
    expect(spies.askEnvoyHarness).not.toHaveBeenCalled();
  });

  it("falls through to askEnvoyHarness when askEnvoyHarnessSkill throws (Q7)", async () => {
    // The skill throws a generic error (e.g.
    // network, timeout). The dispatch falls
    // through to the v1.1 free-form LLM ask.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(ENVOY_HARNESS_SKILLS)),
      askEnvoyHarnessSkill: vi.fn(async () => {
        throw new Error("network error");
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await runOwnerAgentTurnViaRuntime(
        ctx,
        "set up a mesh sponsor bond",
      );
      // Falls through to the v1.1 free-form
      // LLM ask. The result keeps the LLM's
      // answer + `modelUsed: "envoy-harness"`
      // (the actual runtime that produced the
      // answer), but the routing decision
      // reverts to "signal" (not "signal-skill")
      // because the per-skill path failed.
      expect(out.modelUsed).toBe("envoy-harness");
      expect(out.answer).toBe("envoy-harness answer");
      // The result's `routingReason` comes from
      // the router's decision, which is still
      // "signal-skill" (the router picked the
      // skill; the dispatch just couldn't run
      // it). The targetSkill field mirrors the
      // decision too. The Social UI can use the
      // absence of the skill execution (logged
      // as a warning) to render "skill failed,
      // fell back to LLM" instead of the
      // "routed to skill" badge.
      expect(out.routingReason).toBe("signal-skill");
      expect(out.targetSkill).toBe("setup-sponsor-friend");
      // The LLM ask WAS called as the fallback.
      expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("falls through to askEnvoyHarness when targetSkill is undefined (tie)", async () => {
    // "set up a mesh sub-agent" matches `mesh`
    // for setup-sponsor-friend, peer-list, AND
    // relay-status (score 1 each). Top score
    // tied → `targetSkill` undefined → v1.1
    // free-form LLM ask.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(ENVOY_HARNESS_SKILLS)),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sub-agent",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingReason).toBe("signal");
    expect(out.targetSkill).toBeUndefined();
    expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    expect(spies.askEnvoyHarnessSkill).not.toHaveBeenCalled();
  });

  it("falls through to askEnvoyHarness when envoyHarnessSkills is undefined (v1.1 preserved)", async () => {
    // No `getNodeManifest` → no skills list → v1.1
    // free-form LLM ask path. The v1.1 signal
    // scan still matches `mesh`.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => undefined),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sponsor bond",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingReason).toBe("signal");
    expect(out.targetSkill).toBeUndefined();
    expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    expect(spies.askEnvoyHarnessSkill).not.toHaveBeenCalled();
  });

  it("returns the B-class formatted summary as the chat answer (v1.3 NEW)", async () => {
    // v1.3 — when the skill returns a B-class
    // `tool-result` block, `formatSkillResult`
    // dispatches to the per-skill formatter. The
    // formatted string is what the chat user
    // sees. The result keeps the v1.2 routing
    // fields (`routingReason: "signal-skill"`,
    // `targetSkill`, `modelUsed: "envoy-harness"`)
    // — only the `answer` field changes (it's
    // the per-skill formatted summary, not the
    // raw skill output).
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(ENVOY_HARNESS_SKILLS)),
      // The askEnvoyHarnessSkill mock returns the
      // B-class-formatted summary (as if the
      // formatter ran on the bridge's tool-result).
      // v1.2 returned the raw skill output; v1.3
      // returns the per-skill formatted string.
      askEnvoyHarnessSkill: vi.fn(
        async () => "Bonded with sponsor (12D3Koo) after 1 attempt",
      ),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sponsor bond",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    expect(out.routingReason).toBe("signal-skill");
    expect(out.targetSkill).toBe("setup-sponsor-friend");
    expect(out.answer).toBe(
      "Bonded with sponsor (12D3Koo) after 1 attempt",
    );
    expect(spies.askEnvoyHarness).not.toHaveBeenCalled();
  });

  it("falls through to askEnvoyHarness when the B-class formatter returns undefined (Q6)", async () => {
    // v1.3 (Q6) — the formatter returns `undefined`
    // for unknown schemaRef / non-B-class skillId.
    // The host's `askEnvoyHarnessSkill` throws
    // `StructuredResultError` on `undefined`. The
    // dispatch catches + falls through to the
    // v1.1 free-form LLM ask. The result keeps
    // the v1.2 routing fields (targetSkill +
    // signal-skill — the original decision) but
    // the actual dispatch is the LLM fallback.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: vi.fn(() => makeManifest(ENVOY_HARNESS_SKILLS)),
      askEnvoyHarnessSkill: vi.fn(async () => {
        // Simulate the v1.3 host wrapper: when
        // `formatSkillResult` returns undefined,
        // the wrapper throws StructuredResultError
        // so the dispatch catches + falls through.
        throw new Error("structured: B-class formatter not found");
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const out = await runOwnerAgentTurnViaRuntime(
        ctx,
        "set up a mesh sponsor bond",
      );
      // Falls through to askEnvoyHarness.
      expect(out.answer).toBe("envoy-harness answer");
      expect(out.modelUsed).toBe("envoy-harness");
      // The result keeps the v1.2 routing fields
      // (the original decision was a per-skill
      // match; the dispatch just couldn't run it).
      expect(out.routingReason).toBe("signal-skill");
      expect(out.targetSkill).toBe("setup-sponsor-friend");
      expect(spies.askEnvoyHarness).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 8 / v1.5 — prompt hint dispatch integration
// ---------------------------------------------------------------------------

describe("runOwnerAgentTurnViaRuntime — v1.5 prompt hints", () => {
  it("threads the provider hint to askEnvoyHarnessSkill (v1.2 per-skill path)", async () => {
    const ENVOY_HARNESS_SKILLS = [
      { skillId: "setup-sponsor-friend", tags: ["mesh", "bond", "sponsor"] },
    ] as const;
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: () => ({
        peerId: "local",
        skills: [
          {
            runtime: "envoy-harness",
            skillId: "setup-sponsor-friend",
            tags: ["mesh", "bond", "sponsor"],
            costCeilingUsd: 0.5,
            description: "Setup sponsor friend",
            inputSchema: { type: "object" },
          },
        ],
      }),
      envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "set up a mesh sponsor bond /provider:openai",
    );
    expect(out.routingReason).toBe("signal-skill");
    // v1.5 — the dispatch passes the provider
    // hint to the ask method.
    expect(spies.askEnvoyHarnessSkill).toHaveBeenCalledWith(
      "set up a mesh sponsor bond",
      "setup-sponsor-friend",
      { providerHint: "openai", costCapUsd: undefined },
    );
  });

  it("threads the cost cap to askEnvoyHarnessSkill (Q7 precedence)", async () => {
    const ENVOY_HARNESS_SKILLS = [
      { skillId: "code-edit", tags: ["code", "edit"] },
    ] as const;
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: () => ({
        peerId: "local",
        skills: [
          {
            runtime: "envoy-harness",
            skillId: "code-edit",
            tags: ["code", "edit"],
            costCeilingUsd: 0.5, // per-skill default
            description: "Code edit",
            inputSchema: { type: "object" },
          },
        ],
      }),
      envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "/cost:1.0 /provider:openai edit this code",
    );
    expect(out.routingReason).toBe("signal-skill");
    // v1.5 — the dispatch passes the per-prompt
    // cost cap to the ask method. The host
    // applies the env-var flag (Q9 + Q10); the
    // flag is off in tests, so the per-prompt
    // cap is recorded on the decision but the
    // host uses the per-skill default at
    // runtime.
    expect(spies.askEnvoyHarnessSkill).toHaveBeenCalledWith(
      "edit this code", // cleanPrompt (v1.5 hints stripped)
      "code-edit",
      { providerHint: "openai", costCapUsd: 1.0 },
    );
  });

  it("threads the hints to the v1.1 free-form LLM ask path", async () => {
    // The prompt has "mesh" (a tag on the
    // manifest's skill). The skill's tags
    // match, but the v1.2 pickTargetSkill
    // returns the skill (mesh matches
    // mesh-based-skill with 1 hit, no other
    // skill has "mesh"). Wait, that would
    // actually pick a skill... Let me use
    // a tie instead: 2 skills both have
    // "mesh" in their tags → tie → fall
    // through to free-form LLM ask.
    const ENVOY_HARNESS_SKILLS = [
      { skillId: "setup-sponsor-friend", tags: ["mesh", "bond", "sponsor"] },
      { skillId: "peer-list", tags: ["mesh", "observability"] },
    ] as const;
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
      getNodeManifest: () => ({
        peerId: "local",
        skills: [
          {
            runtime: "envoy-harness",
            skillId: "setup-sponsor-friend",
            tags: ["mesh", "bond", "sponsor"],
            description: "Setup sponsor friend",
            inputSchema: { type: "object" },
          },
          {
            runtime: "envoy-harness",
            skillId: "peer-list",
            tags: ["mesh", "observability"],
            description: "Peer list",
            inputSchema: { type: "object" },
          },
        ],
      }),
      envoyHarnessSkills: ENVOY_HARNESS_SKILLS,
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "explain the mesh /provider:ollama /cost:0.25",
    );
    // v1.2 — both skills have 1 mesh match
    // (tie) → fall through to v1.1 free-form
    // LLM ask (Q1 of the v1.2 sub-plan).
    expect(out.routingReason).toBe("signal");
    expect(out.targetSkill).toBeUndefined();
    // v1.5 — the hints are threaded to the
    // free-form ask method.
    expect(spies.askEnvoyHarness).toHaveBeenCalledWith(
      "explain the mesh",
      { providerHint: "ollama", costCapUsd: 0.25 },
    );
  });

  it("strips both the v1.5 inline hints AND the v0 prefix from the cleanPrompt", async () => {
    // The user typed both `!eh` (v0 prefix) AND
    // `/provider:openai /cost:0.5` (v1.5 inline).
    // The LLM sees neither.
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    const out = await runOwnerAgentTurnViaRuntime(
      ctx,
      "!eh translate this /provider:openai /cost:0.5",
    );
    expect(out.modelUsed).toBe("envoy-harness");
    // The LLM sees only the message text.
    expect(spies.askEnvoyHarness).toHaveBeenCalledWith(
      "translate this",
      { providerHint: "openai", costCapUsd: 0.5 },
    );
  });

  it("cleanPrompt equals the original prompt when no v1.5 hints are present", async () => {
    const { ctx, spies } = makeCtx({
      isEnvoyHarnessReady: vi.fn(() => true),
    });
    await runOwnerAgentTurnViaRuntime(
      ctx,
      "!eh translate this to French",
    );
    // No v1.5 hints → opts is `{ providerHint: undefined, costCapUsd: undefined }`.
    expect(spies.askEnvoyHarness).toHaveBeenCalledWith(
      "translate this to French",
      { providerHint: undefined, costCapUsd: undefined },
    );
  });
});
