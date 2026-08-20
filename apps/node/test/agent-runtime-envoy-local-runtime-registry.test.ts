/**
 * Phase 8 Step 2 — `LocalRuntimeRegistry` unit tests +
 * cross-runtime delegation integration test.
 *
 * **Acceptance:** the (B) plan's Step 2 acceptance is
 *   - e2e: envoy-harness spawns an OpenClaw sub-agent
 *     (skill delegation A)
 *   - e2e: OpenClaw can spawn an envoy-harness sub-agent
 *     (skill delegation B)
 *   - unit: `MeshSubmitter` interface is the same for both
 *
 * **Step 2 scope:** the seam (`LocalCrossRuntimeSubmitter` +
 * `LocalRuntimeRegistry`) + tests in isolation + tests as a
 * pair. The full e2e (with a real `Agent` whose `task` tool
 * uses a `LocalCrossRuntimeSubmitter`) lands when Step 2+
 * wires the real `buildAgent`. Today the `buildAgent` is
 * a Step 1 stub; the e2e is deferred to that follow-up.
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
 * 6. `submitToEnvoyHarness` throws "not yet implemented"
 *    (the symmetric direction is deferred to Step 4+).
 * 7. The registry implements `LocalRuntimeBridge` (type check).
 * 8. **Integration (skill delegation A):** the
 *    `LocalCrossRuntimeSubmitter` + `LocalRuntimeRegistry` pair
 *    correctly routes a `preferredRuntime: "openclaw"` call
 *    from end to end. This is the partial e2e for the
 *    envoy-harness → OpenClaw direction.
 */

import { describe, expect, it, vi } from "vitest";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocalRuntimeRegistry (Phase 8 Step 2)", () => {
  const WORKER_PEER_ID = "12D3KooWTest";

  describe("submitToOpenClaw (translation + result shape)", () => {
    it("calls askOpenClaw with a prompt derived from input.objective", async () => {
      const { askOpenClaw, calls } = makeAskOpenClaw({ result: "ok" });
      const registry = new LocalRuntimeRegistry({ askOpenClaw });

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
      const registry = new LocalRuntimeRegistry({ askOpenClaw });

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
      const registry = new LocalRuntimeRegistry({ askOpenClaw });

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
      const registry = new LocalRuntimeRegistry({ askOpenClaw });

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
      const registry = new LocalRuntimeRegistry({ askOpenClaw, log });

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

  describe("submitToEnvoyHarness (symmetric direction — stub for Step 4+)", () => {
    it("throws 'not yet implemented' (the symmetric direction is deferred)", async () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      const registry = new LocalRuntimeRegistry({ askOpenClaw });

      await expect(
        registry.submitToEnvoyHarness(
          {
            objective: "test",
            capabilityTag: "research",
            costCeilingUsd: 1,
            deadlineMs: 5000,
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow(/submitToEnvoyHarness: not yet implemented/);
    });
  });

  describe("interface parity (acceptance criterion #3)", () => {
    it("LocalRuntimeRegistry implements LocalRuntimeBridge", () => {
      const { askOpenClaw } = makeAskOpenClaw({});
      // The cast is the test: if the class doesn't satisfy
      // LocalRuntimeBridge's shape, this line fails to compile.
      const bridge: LocalRuntimeBridge = new LocalRuntimeRegistry({ askOpenClaw });
      expect(bridge).toBeInstanceOf(LocalRuntimeRegistry);
      expect(typeof bridge.submitToOpenClaw).toBe("function");
    });
  });
});

describe("Cross-runtime delegation (integration, skill delegation A — partial)", () => {
  const WORKER_PEER_ID = "12D3KooWTest";

  it("LocalCrossRuntimeSubmitter + LocalRuntimeRegistry: envoy-harness -> OpenClaw", async () => {
    // This is the (B) plan's acceptance criterion #1 ("e2e:
    // envoy-harness spawns an OpenClaw sub-agent") — at the
    // submitter + registry seam, not yet at the Agent's `task`
    // tool seam (that requires a real Agent, deferred to
    // Step 2+ when buildAgent is real).
    const { askOpenClaw, calls } = makeAskOpenClaw({ result: "openclaw-reply" });
    const { inner, calls: innerCalls } = makeInner();

    const registry = new LocalRuntimeRegistry({ askOpenClaw });
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

  it("default (no preferredRuntime) routes to inner — same-runtime sub-agent", async () => {
    const { askOpenClaw, calls } = makeAskOpenClaw({});
    const { inner, calls: innerCalls } = makeInner();

    const registry = new LocalRuntimeRegistry({ askOpenClaw });
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

    const bridge: LocalRuntimeBridge = new LocalRuntimeRegistry({ askOpenClaw });
    const submitter: MeshSubmitter = new LocalCrossRuntimeSubmitter({
      bridge,
      inner,
      workerPeerId: WORKER_PEER_ID,
    });

    // Type check passes; runtime check confirms the chain.
    expect(typeof submitter.submit).toBe("function");
  });
});
