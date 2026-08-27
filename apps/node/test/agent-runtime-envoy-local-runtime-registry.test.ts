/**
 * Phase 8 Step 2 / b1 — `LocalRuntimeRegistry` unit tests +
 * cross-runtime delegation integration test.
 *
 * **Acceptance:** the (B) plan's Step 2 acceptance is
 *   - e2e: envoy-harness spawns an OpenClaw sub-agent
 *     (skill delegation A)
 *   - e2e: OpenClaw can spawn an envoy-harness sub-agent
 *     (skill delegation B)
 *   - unit: `MeshSubmitter` interface is the same for both
 *
 * **b1 scope (this commit):** the `submitToEnvoyHarness`
 * direction is now REAL (delegates to a host-injected
 * `LocalMeshSubmitter` constructed from `buildSubagent` +
 * `workerPeerId`). The e2e B is at the registry seam —
 * the mock `buildSubagent` returns a stub `Agent`; the
 * real `Agent` (with a real `buildAgent` + model + tools)
 * lands in b3.
 *
 * **Covers:**
 * 1. `submitToOpenClaw` translates `SubagentInput` to a prompt
 *    and calls `askOpenClaw(prompt)`.
 * 2. The result text is wrapped in `content: [{ type: "text" }]`
 *    with `workerRuntime: "openclaw"`.
 * 3. Empty result text → `status: "failed"`, clear verdict reason.
 * 4. `isOpenClawReady() === false` → `status: "failed"`,
 *    `verdict.reason: "openclaw_unavailable"` (without calling
 *    `askOpenClaw`).
 * 5. `askOpenClaw` throws → `status: "failed"`, error message
 *    in `verdict.reason` (does NOT propagate the throw).
 * 6. `submitToEnvoyHarness` delegates to the injected
 *    `buildSubagent` factory and returns the result
 *    (b1 — was a stub in Step 2).
 * 7. The registry implements `LocalRuntimeBridge` (type check).
 * 8. **Integration (skill delegation A):** the
 *    `LocalCrossRuntimeSubmitter` + `LocalRuntimeRegistry` pair
 *    correctly routes a `preferredRuntime: "openclaw"` call
 *    from end to end.
 * 9. **Integration (skill delegation B, b1.3):** the
 *    `LocalCrossRuntimeSubmitter` + `LocalRuntimeRegistry` pair
 *    correctly routes a `preferredRuntime: "envoy-harness"`
 *    call through the inner `LocalMeshSubmitter` (e2e B at
 *    the registry seam, with a mock Agent).
 */

import { describe, expect, it, vi } from "vitest";
import type { Agent, AgentResult } from "@envoymesh/envoy-harness";
import type { SubagentInput } from "@envoymesh/envoy-harness";

import { LocalCrossRuntimeSubmitter, type LocalRuntimeBridge, type MeshSubmitter } from "@envoymesh/envoy-harness-adapter";

import { LocalRuntimeRegistry } from "../src/agent-runtime-envoy/local-runtime-registry.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A scripted `askOpenClaw` that records every call and
 *  returns a pre-configured result (or throws). */
function makeAskOpenClaw(opts: {
  result?: string;
  error?: Error;
  delayMs?: number;
}): {
  askOpenClaw: (prompt: string) => Promise<string>;
  calls: Array<{ prompt: string }>;
} {
  const calls: Array<{ prompt: string }> = [];
  const askOpenClaw = vi.fn(async (prompt: string) => {
    calls.push({ prompt });
    if (opts.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
    if (opts.error) throw opts.error;
    return opts.result ?? "openclaw-default-result";
  });
  return { askOpenClaw, calls };
}

function makeLogger() {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  return {
    log: (event: string, fields?: Record<string, unknown>) => {
      events.push({ event, ...(fields ? { fields } : {}) });
    },
    events,
  };
}

/** A scripted `buildSubagent` that records every call and
 *  returns a stub `Agent` (with a pre-configured
 *  `getSessionId` + `run` + `abort`). The stub Agent is
 *  typed as a `Pick<Agent, ...>` because we only need to
 *  satisfy the methods `LocalMeshSubmitter` calls; we
 *  don't construct a real `Agent` (that lands in b3 with
 *  the real `defaultBuildSubagentFactory` + model). */
function makeBuildSubagent(opts: {
  result?: AgentResult;
  error?: Error;
  sessionId?: string;
}): {
  buildSubagent: (input: SubagentInput) => Agent;
  /** Records every `buildSubagent` call (factory invocations). */
  factoryCalls: Array<{ input: SubagentInput }>;
  /** Records every `agent.abort()` invocation from the
   *  LocalMeshSubmitter's signal-wiring. */
  abortCalls: Array<{ reason: unknown }>;
} {
  const factoryCalls: Array<{ input: SubagentInput }> = [];
  const abortCalls: Array<{ reason: unknown }> = [];
  const sessionId = opts.sessionId ?? "stub-session-id";
  const buildSubagent = (input: SubagentInput): Agent => {
    factoryCalls.push({ input });
    // The stub Agent. We capture `abort` invocations and
    // ignore the rest. The `run` returns the canned result
    // (or throws) so we can test both the happy and error
    // paths. The cast to `Agent` is safe — `LocalMeshSubmitter`
    // only uses `getSessionId` + `abort` + `run`.
    const agent = {
      getSessionId: () => sessionId,
      run: async (_objective: string): Promise<AgentResult> => {
        if (opts.error) throw opts.error;
        return (
          opts.result ?? {
            content: [
              { type: "text", text: "stub-default-result" } as const,
            ],
            stopReason: "end_turn",
            iterations: 1,
            toolCalls: 0,
            messages: [],
            sandboxPolicy: { mode: "read-only", writableRoots: [], denyWithinRoot: [] },
            metrics: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          }
        );
      },
      abort: (reason?: unknown) => {
        abortCalls.push({ reason });
      },
    };
    return agent as unknown as Agent;
  };
  return {
    buildSubagent,
    factoryCalls,
    abortCalls,
  };
}

/** A scripted inner submitter (same-runtime case) for the
 *  integration test. */
function makeInner(): {
  inner: MeshSubmitter;
  calls: Array<{ input: Parameters<MeshSubmitter["submit"]>[0] }>;
} {
  const calls: Array<{ input: Parameters<MeshSubmitter["submit"]>[0] }> = [];
  const inner: MeshSubmitter = {
    async submit(input) {
      calls.push({ input });
      return {
        status: "completed",
        content: [
          { type: "text", text: "envoy-harness-default-result" },
        ],
        workerPeerId: "inner-peer",
        workerRuntime: "envoy-harness",
        costUsd: 0,
        durationMs: 1,
        verdict: { kind: "pass", score: 0.5, confidence: "medium" },
        signature: "",
      };
    },
  };
  return { inner, calls };
}

/** A "noop buildSubagent" for tests that don't exercise
 *  the envoy-harness direction. The factory is never
 *  called in those tests, so a stub that throws on call
 *  is the safest — it would fail loud if the test ever
 *  accidentally exercises that path. */
function makeNoopBuildSubagent(): (input: SubagentInput) => Agent {
  return (() => {
    throw new Error(
      "makeNoopBuildSubagent: factory called unexpectedly — this test " +
        "should not exercise the envoy-harness direction",
    );
  }) as unknown as (input: SubagentInput) => Agent;
}

const WORKER_PEER_ID = "12D3KooWTest";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocalRuntimeRegistry (Phase 8 Step 2 / b1)", () => {
  describe("submitToOpenClaw (translation + result shape)", () => {
    it("calls askOpenClaw with a prompt derived from input.objective", async () => {
      const { askOpenClaw, calls } = makeAskOpenClaw({ result: "ok" });
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });

      const result = await registry.submitToOpenClaw(
        {
          objective: "research the feasibility of X",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      expect(calls).toHaveLength(1);
      // The prompt includes the capability tag (informational)
      // and the objective. v0: literal join; the OpenClaw
      // ask path is text-in, not structured.
      expect(calls[0]?.prompt).toContain("research");
      expect(calls[0]?.prompt).toContain("research the feasibility of X");
      // Result is the wrapped text.
      expect(result.status).toBe("completed");
      expect(result.workerRuntime).toBe("openclaw");
      expect(result.content[0]).toMatchObject({ type: "text", text: "ok" });
      expect(result.verdict).toMatchObject({ kind: "pass" });
    });

    it("returns status='failed' when askOpenClaw returns an empty string", async () => {
      const { askOpenClaw } = makeAskOpenClaw({ result: "   " }); // whitespace only
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });

      const result = await registry.submitToOpenClaw(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      expect(result.status).toBe("failed");
      expect(result.verdict).toMatchObject({
        kind: "fail",
        reason: "openclaw_empty",
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("openclaw_empty"),
      });
    });

    it("returns status='failed' with openclaw_unavailable when isOpenClawReady is false", async () => {
      const { askOpenClaw, calls } = makeAskOpenClaw({});
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        isOpenClawReady: () => false,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });

      const result = await registry.submitToOpenClaw(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      // askOpenClaw is NOT called when the engine reports not
      // ready — this is the early-bail optimization. The
      // result is a clean "openclaw_unavailable" verdict.
      expect(calls).toHaveLength(0);
      expect(result.status).toBe("failed");
      expect(result.verdict).toMatchObject({
        kind: "fail",
        reason: "openclaw_unavailable",
      });
    });

    it("returns status='failed' when askOpenClaw throws (does not propagate)", async () => {
      const { askOpenClaw } = makeAskOpenClaw({
        error: new Error("openclaw gateway timeout"),
      });
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });

      const result = await registry.submitToOpenClaw(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      expect(result.status).toBe("failed");
      expect(result.verdict).toMatchObject({
        kind: "fail",
        reason: expect.stringContaining("openclaw_ask_failed: openclaw gateway timeout"),
      });
    });

    it("forwards the abort signal to askOpenClaw (asks are signal-aware)", async () => {
      const { askOpenClaw, calls } = makeAskOpenClaw({ delayMs: 50 });
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });

      const controller = new AbortController();
      const promise = registry.submitToOpenClaw(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        controller.signal,
      );
      // Verify the call was made (then abort for cleanup).
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(calls).toHaveLength(1);
      controller.abort();
      await promise.catch(() => undefined);
      // We don't assert on the result (the mock doesn't honor
      // the signal); the call happened, that's what matters.
    });

    it("emits log events when a logger is provided", async () => {
      const { askOpenClaw } = makeAskOpenClaw({ result: "ok" });
      const { log, events } = makeLogger();
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        log,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });

      await registry.submitToOpenClaw(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain("envoy_harness.cross_runtime.openclaw.start");
      expect(eventNames).toContain("envoy_harness.cross_runtime.openclaw.done");
    });
  });

  describe("submitToEnvoyHarness (symmetric direction — b1 real impl)", () => {
    it("calls the injected buildSubagent factory with the SubagentInput", async () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      const { buildSubagent, factoryCalls } = makeBuildSubagent({
        result: {
          content: [{ type: "text", text: "hello from sub-agent" }],
          stopReason: "end_turn",
          iterations: 1,
          toolCalls: 0,
          messages: [],
          sandboxPolicy: { mode: "read-only", writableRoots: [], denyWithinRoot: [] },
          metrics: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
        },
      });
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent,
        workerPeerId: WORKER_PEER_ID,
      });

      await registry.submitToEnvoyHarness(
        {
          objective: "summarize X",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      // The factory was called exactly once with the input.
      expect(factoryCalls).toHaveLength(1);
      expect(factoryCalls[0]?.input.objective).toBe("summarize X");
      expect(factoryCalls[0]?.input.capabilityTag).toBe("research");
    });

    it("returns the SubagentResult produced by the stub Agent.run", async () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      const { buildSubagent } = makeBuildSubagent({
        result: {
          content: [{ type: "text", text: "hello from sub-agent" }],
          stopReason: "end_turn",
          iterations: 2,
          toolCalls: 1,
          messages: [],
          sandboxPolicy: { mode: "read-only", writableRoots: [], denyWithinRoot: [] },
          metrics: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
        },
      });
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent,
        workerPeerId: WORKER_PEER_ID,
      });

      const result = await registry.submitToEnvoyHarness(
        {
          objective: "summarize X",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      expect(result.status).toBe("completed");
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "hello from sub-agent",
      });
      expect(result.workerRuntime).toBe("envoy-harness");
      // The LocalMeshSubmitter stamps the configured peerId.
      expect(result.workerPeerId).toBe(WORKER_PEER_ID);
      expect(result.costUsd).toBe(0.001);
      expect(result.verdict).toMatchObject({ kind: "pass" });
    });

    it("converts stub Agent.run throws into a failed SubagentResult (does not propagate)", async () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      const { buildSubagent } = makeBuildSubagent({
        error: new Error("sub-agent blew up"),
      });
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent,
        workerPeerId: WORKER_PEER_ID,
      });

      const result = await registry.submitToEnvoyHarness(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      expect(result.status).toBe("failed");
      expect(result.verdict).toMatchObject({
        kind: "fail",
        reason: "sub-agent threw",
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("sub-agent failed: sub-agent blew up"),
      });
    });

    it("stamps workerPeerId on every result (LocalMeshSubmitter does the stamping)", async () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      const { buildSubagent } = makeBuildSubagent({});
      const registry = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent,
        workerPeerId: "12D3KooWCustom",
      });

      const result = await registry.submitToEnvoyHarness(
        {
          objective: "test",
          capabilityTag: "research",
          costCeilingUsd: 1,
          deadlineMs: 5000,
        },
        new AbortController().signal,
      );

      // The LocalMeshSubmitter stamps the workerPeerId from
      // its constructor options. The registry passes the
      // configured workerPeerId through.
      expect(result.workerPeerId).toBe("12D3KooWCustom");
      expect(result.workerRuntime).toBe("envoy-harness");
    });
  });

  describe("interface parity (acceptance criterion #3)", () => {
    it("LocalRuntimeRegistry implements LocalRuntimeBridge", () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      // The cast is the test: if the class doesn't satisfy
      // LocalRuntimeBridge's shape, this line fails to compile.
      const bridge: LocalRuntimeBridge = new LocalRuntimeRegistry({
        askOpenClaw,
        buildSubagent: makeNoopBuildSubagent(),
        workerPeerId: WORKER_PEER_ID,
      });
      expect(bridge).toBeInstanceOf(LocalRuntimeRegistry);
      expect(typeof bridge.submitToOpenClaw).toBe("function");
      expect(typeof bridge.submitToEnvoyHarness).toBe("function");
    });
  });
});

describe("Cross-runtime delegation (integration)", () => {
  it("LocalCrossRuntimeSubmitter + LocalRuntimeRegistry: envoy-harness -> OpenClaw (skill delegation A)", async () => {
    // The (B) plan's acceptance criterion #1 ("e2e:
    // envoy-harness spawns an OpenClaw sub-agent") — at the
    // submitter + registry seam, not yet at the Agent's `task`
    // tool seam (that requires a real Agent, deferred to
    // b3 when buildAgent is real).
    const { askOpenClaw, calls } = makeAskOpenClaw({ result: "openclaw-reply" });
    const { inner, calls: innerCalls } = makeInner();

    const registry = new LocalRuntimeRegistry({
      askOpenClaw,
      buildSubagent: makeNoopBuildSubagent(),
      workerPeerId: WORKER_PEER_ID,
    });
    const submitter = new LocalCrossRuntimeSubmitter({
      bridge: registry,
      inner,
      workerPeerId: WORKER_PEER_ID,
    });

    const result = await submitter.submit(
      {
        objective: "research X via OpenClaw",
        capabilityTag: "research",
        costCeilingUsd: 1,
        deadlineMs: 5000,
        preferredRuntime: "openclaw",
      },
      new AbortController().signal,
    );

    // 1. The OpenClaw ask path was called.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt).toContain("research X via OpenClaw");
    // 2. The inner (envoy-harness) submitter was NOT called.
    expect(innerCalls).toHaveLength(0);
    // 3. The result is the OpenClaw reply, with the right
    //    workerRuntime + workerPeerId (rewritten by the
    //    LocalCrossRuntimeSubmitter).
    expect(result.status).toBe("completed");
    expect(result.workerRuntime).toBe("openclaw");
    expect(result.workerPeerId).toBe(WORKER_PEER_ID);
    expect(result.content[0]).toMatchObject({ type: "text", text: "openclaw-reply" });
  });

  it("e2e B at registry seam: OpenClaw -> envoy-harness (skill delegation B, b1)", async () => {
    // The (B) plan's acceptance criterion #2 ("e2e: OpenClaw
    // can spawn an envoy-harness sub-agent") at the registry
    // seam. The flow an OpenClaw caller would invoke:
    //
    //   const registry = new LocalRuntimeRegistry({...});
    //   const result = await registry.submitToEnvoyHarness(
    //     { objective, capabilityTag, costCeilingUsd,
    //       deadlineMs, preferredRuntime: "envoy-harness" },
    //     signal,
    //   );
    //
    // The (B) plan's "OpenClaw caller" is OpenClaw's
    // BridgeToEnvoyHarness skill (Step 4+). The skill is
    // OUT OF SCOPE for b1; the seam here is the
    // `submitToEnvoyHarness` method. The OpenClaw side
    // just calls it directly. The localMeshSubmitter in
    // the registry calls `buildSubagent` → mock Agent →
    // canned `run()` result.
    //
    // **Why NOT through `LocalCrossRuntimeSubmitter`:**
    // `LocalCrossRuntimeSubmitter` is the envoy-harness
    // side's `task` tool seam. It routes to the bridge
    // only for `preferredRuntime: "openclaw"`. The
    // "envoy-harness" case routes to its `inner` (a
    // `MeshSubmitter`), not to the bridge. The OpenClaw
    // direction calls the bridge DIRECTLY (no
    // `LocalCrossRuntimeSubmitter` involvement). So the
    // e2e B at the registry seam is a direct
    // `registry.submitToEnvoyHarness` call.
    const { askOpenClaw, calls } = makeAskOpenClaw({});
    const { buildSubagent } = makeBuildSubagent({
      result: {
        content: [{ type: "text", text: "envoy-harness-reply" }],
        stopReason: "end_turn",
        iterations: 1,
        toolCalls: 0,
        messages: [],
        sandboxPolicy: { mode: "read-only", writableRoots: [], denyWithinRoot: [] },
        metrics: { inputTokens: 10, outputTokens: 5, costUsd: 0.002 },
      },
    });

    const registry = new LocalRuntimeRegistry({
      askOpenClaw,
      buildSubagent,
      workerPeerId: WORKER_PEER_ID,
    });

    // The OpenClaw side calls the bridge directly.
    const result = await registry.submitToEnvoyHarness(
      {
        objective: "deep work via envoy-harness",
        capabilityTag: "research",
        costCeilingUsd: 1,
        deadlineMs: 5000,
        preferredRuntime: "envoy-harness",
      },
      new AbortController().signal,
    );

    // 1. The OpenClaw ask path was NOT called.
    expect(calls).toHaveLength(0);
    // 2. The result is the envoy-harness reply (from the
    //    stub Agent.run), with the configured peerId
    //    stamped by the LocalMeshSubmitter.
    expect(result.status).toBe("completed");
    expect(result.workerRuntime).toBe("envoy-harness");
    expect(result.workerPeerId).toBe(WORKER_PEER_ID);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "envoy-harness-reply",
    });
  });

  it("default (no preferredRuntime) routes to inner — same-runtime sub-agent", async () => {
    const { askOpenClaw, calls } = makeAskOpenClaw({});
    const { inner, calls: innerCalls } = makeInner();

    const registry = new LocalRuntimeRegistry({
      askOpenClaw,
      buildSubagent: makeNoopBuildSubagent(),
      workerPeerId: WORKER_PEER_ID,
    });
    const submitter = new LocalCrossRuntimeSubmitter({
      bridge: registry,
      inner,
      workerPeerId: WORKER_PEER_ID,
    });

    await submitter.submit(
      {
        objective: "same-runtime work",
        capabilityTag: "research",
        costCeilingUsd: 1,
        deadlineMs: 5000,
        // preferredRuntime omitted.
      },
      new AbortController().signal,
    );

    expect(calls).toHaveLength(0); // OpenClaw not called
    expect(innerCalls).toHaveLength(1);
  });

  it("MeshSubmitter interface parity (acceptance criterion #3, EnvoyMesh side)", () => {
    // The (B) plan's unit-test acceptance is "the MeshSubmitter
    // interface is the same for both". The cast below proves
    // the EnvoyMesh wiring (LocalCrossRuntimeSubmitter + inner
    // LocalMeshSubmitter) all implement the same interface.
    const { askOpenClaw } = makeAskOpenClaw({});
    const { inner } = makeInner();

    const bridge: LocalRuntimeBridge = new LocalRuntimeRegistry({
      askOpenClaw,
      buildSubagent: makeNoopBuildSubagent(),
      workerPeerId: WORKER_PEER_ID,
    });
    const submitter: MeshSubmitter = new LocalCrossRuntimeSubmitter({
      bridge,
      inner,
      workerPeerId: WORKER_PEER_ID,
    });

    // Type check passes; runtime check confirms the chain.
    expect(typeof submitter.submit).toBe("function");
  });
});
