/**
 * Phase 8 / Step 6 — `createEnvoyHarnessAdapter`
 * cross-verify wiring e2e.
 *
 * **What this covers:** the host-side factory
 * uses `buildEnvoyHarnessAdapterWithCrossVerify`
 * when `openClawAdapter` is provided. The
 * resulting adapter's `verify()` re-runs the
 * same skill on the OpenClaw adapter and returns
 * the local verifier's verdicts for the new
 * result.
 *
 * **Hermetic:** the factory's stub `buildAgent`
 * (throws `envoy_harness_stub_phase_8_step_1`)
 * is irrelevant for `verify()` because
 * `verify()` does not call `buildAgent`. The
 * OpenClaw adapter is stubbed too — it just
 * returns a canned `SignedAgentResult` so the
 * cross closure's `execute()` is observable.
 *
 * **Why this test lives in `apps/node/test/` (not
 * in the bridge's tests):** the factory is
 * host-side; the bridge's cross-verify is tested
 * in `packages/envoy-harness-adapter/test/cross-verify-adapter.test.ts`.
 * This file tests the host-side composition.
 */

import { describe, expect, it } from "vitest";

import type { AgentAdapter } from "@envoymesh/agent-adapter";
import type { SignedAgentResult } from "@envoymesh/protocol";

import { createEnvoyHarnessAdapter } from "../src/agent-runtime-envoy/factory.js";
import { loadEnvoyHarnessRuntimeConfig } from "../src/agent-runtime-envoy/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal OpenClaw adapter stub. The
 *  `execute` is observable; the `verify` is
 *  unused (the cross-verify closure calls
 *  `execute`, not `verify`). */
function makeOpenClawStub(opts: {
  onExecute?: (input: { skillId: string; objective: string }) => void;
  resultText: string;
}): AgentAdapter {
  return {
    runtime: "openclaw",
    describeSkills: () => [],
    buildManifest: async () => {
      throw new Error("buildManifest not used in this test");
    },
    execute: async (input) => {
      opts.onExecute?.({ skillId: input.skillId, objective: input.objective });
      const signed: SignedAgentResult = {
        version: "0.1",
        runtime: "openclaw",
        skillId: input.skillId,
        workerPeerId: "openclaw-peer",
        objective: input.objective,
        content: [{ kind: "text", text: opts.resultText }],
        inputArtifacts: [],
        metrics: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
        createdAt: new Date().toISOString(),
        correlationId: input.correlationId,
        signature: "openclaw-stub-sig",
        raw: {
          type: "text",
          text: opts.resultText,
          messages: [],
          content: [],
          metrics: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          iterations: 0,
          toolCalls: 0,
          stopReason: "end_turn",
          sandboxPolicy: {
            mode: "read-only",
            approval: "on-request",
            backend: "linux-landlock",
            writableRoots: [],
            networkAccess: false,
            slashTmpWritable: true,
          },
        },
      };
      return signed;
    },
    verify: async () => [{ kind: "pass", score: 0.9, confidence: "high" }],
  };
}

/** A dummy `SignedAgentResult` for the local
 *  verify() call. The factory's stub `buildAgent`
 *  is irrelevant; `verify()` does not call it. */
function makeLocalResult(skillId = "code-review"): SignedAgentResult {
  return {
    version: "0.1",
    runtime: "envoy-harness",
    skillId,
    workerPeerId: "envoy-peer",
    objective: "review this PR",
    content: [{ kind: "text", text: "local result text" }],
    inputArtifacts: [],
    metrics: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    createdAt: new Date().toISOString(),
    correlationId: "corr-1",
    signature: "local-stub-sig",
    raw: {
      type: "text",
      text: "local result text",
      messages: [],
      content: [],
      metrics: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      iterations: 0,
      toolCalls: 0,
      stopReason: "end_turn",
      sandboxPolicy: {
        mode: "read-only",
        approval: "on-request",
        backend: "linux-landlock",
        writableRoots: [],
        networkAccess: false,
        slashTmpWritable: true,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEnvoyHarnessAdapter — cross-verify wiring (Phase 8 Step 6)", () => {
  it("returns an adapter with runtime 'envoy-harness' when no openClawAdapter is provided", () => {
    const config = loadEnvoyHarnessRuntimeConfig();
    const adapter = createEnvoyHarnessAdapter({
      workerPeerId: "envoy-peer",
      config,
    });
    expect(adapter.runtime).toBe("envoy-harness");
  });

  it("returns an adapter with runtime 'envoy-harness' when openClawAdapter is provided", () => {
    const config = loadEnvoyHarnessRuntimeConfig();
    const openClawAdapter = makeOpenClawStub({ resultText: "cross result" });
    const adapter = createEnvoyHarnessAdapter({
      workerPeerId: "envoy-peer",
      config,
      openClawAdapter,
    });
    expect(adapter.runtime).toBe("envoy-harness");
  });

  it("verify() re-runs the same skill on the openClaw adapter (Q4 a: envoy-writes + openclaw-verifies)", async () => {
    let executedSkillId: string | undefined;
    let executedObjective: string | undefined;
    const openClawAdapter = makeOpenClawStub({
      onExecute: ({ skillId, objective }) => {
        executedSkillId = skillId;
        executedObjective = objective;
      },
      resultText: "cross-verifier result",
    });
    const config = loadEnvoyHarnessRuntimeConfig();
    const adapter = createEnvoyHarnessAdapter({
      workerPeerId: "envoy-peer",
      config,
      openClawAdapter,
    });

    const localResult = makeLocalResult("code-review");
    const verdicts = await adapter.verify({
      result: localResult,
      objective: "review this PR",
    });

    // The cross closure was called with the same
    // skill id + objective (F9.5 defaultCrossVerify
    // contract: re-runs the same skill on the
    // other adapter).
    expect(executedSkillId).toBe("code-review");
    expect(executedObjective).toBe("review this PR");
    // The local verifier returns at least one
    // verdict for a non-empty result. The exact
    // kind depends on the F1.4d rules; the test
    // just verifies the cross ran.
    expect(verdicts.length).toBeGreaterThan(0);
  });

  it("verify() without openClawAdapter still works (backward compatible with Step 1-5 callers)", async () => {
    const config = loadEnvoyHarnessRuntimeConfig();
    const adapter = createEnvoyHarnessAdapter({
      workerPeerId: "envoy-peer",
      config,
    });
    const localResult = makeLocalResult("code-review");
    const verdicts = await adapter.verify({
      result: localResult,
      objective: "review this PR",
    });
    // Local-only: no cross was run. The result
    // is the local verifier's verdicts (at least
    // one for a non-empty result).
    expect(verdicts.length).toBeGreaterThan(0);
  });
});
