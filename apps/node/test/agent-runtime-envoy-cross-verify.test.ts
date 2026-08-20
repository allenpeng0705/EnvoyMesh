/**
 * Phase 8 / Step 6 — `createEnvoyHarnessAdapter` (stub
 * factory) + `createRealEnvoyHarnessRuntime` (real
 * `ask` runtime) cross-verify wiring e2e.
 *
 * **What this covers:**
 * 1. The host-side factory
 *    `createEnvoyHarnessAdapter` uses
 *    `buildEnvoyHarnessAdapterWithCrossVerify` when
 *    `openClawAdapter` is provided. The resulting
 *    adapter's `verify()` re-runs the same skill
 *    on the cross adapter and returns the local
 *    verifier's verdicts for the new result.
 * 2. The real `ask` runtime
 *    `createRealEnvoyHarnessRuntime` also wires
 *    the cross-verify when `openClawAdapter` is
 *    provided (parallel of the factory path; for
 *    the direct `ask` path).
 *
 * **Hermetic:** the factory's stub `buildAgent`
 * (throws `envoy_harness_stub_phase_8_step_1`)
 * is irrelevant for `verify()` because
 * `verify()` does not call `buildAgent`. The
 * real runtime uses a stubbed `ModelAdapter` (via
 * `scriptedModel`) so no real LLM call. The
 * OpenClaw adapter stub returns a canned
 * `SignedAgentResult` with minimal required fields
 * (the bridge's `runLocalVerifier` reads only
 * `content` + `metrics` from the cross result; the
 * `raw` field is ignored and should NOT be
 * hardcoded — that would be misleading because
 * the bridge's `wireToLocalAgentResult` synthesizes
 * a fresh local result from the wire).
 *
 * **Why this test lives in `apps/node/test/` (not
 * in the bridge's tests):** the factory + runtime
 * are host-side; the bridge's cross-verify is
 * tested in `packages/envoy-harness-adapter/test/cross-verify-adapter.test.ts`.
 * This file tests the host-side composition.
 */

import { describe, expect, it } from "vitest";

import type {
  CompleteInput,
  ContentBlock,
  ModelAdapter,
  ModelResponse,
} from "@envoymesh/envoy-harness";

import type { AgentAdapter } from "@envoymesh/agent-adapter";
import type { SignedAgentResult } from "@envoymesh/protocol";

import { createEnvoyHarnessAdapter } from "../src/agent-runtime-envoy/factory.js";
import { createRealEnvoyHarnessRuntime } from "../src/agent-runtime-envoy/runtime.js";
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
      // The bridge's `runLocalVerifier` reads only
      // `content` + `metrics` from the cross
      // result. The `raw` field is documented as
      // optional and is NOT consumed by
      // `wireToLocalAgentResult` (the bridge
      // synthesizes a fresh local result from
      // the wire's content + metrics). Keep this
      // stub minimal — including a hardcoded
      // `raw.sandboxPolicy` would be misleading
      // (the bridge ignores it).
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
      };
      return signed;
    },
    verify: async () => [{ kind: "pass", score: 0.9, confidence: "high" }],
  };
}

/** A dummy `SignedAgentResult` for the local
 *  `verify()` call. The bridge's
 *  `runLocalVerifier(input)` reads only
 *  `content` + `metrics` from this result; the
 *  `raw` field is optional and ignored.
 *  Everything else is irrelevant to the
 *  cross-verify. */
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
  };
}

/** A scripted `ModelAdapter` for hermetic tests.
 *  Returns a single canned response (a "warm up"
 *  text) so the runtime's lazy `ask` call
 *  constructs the internals without exhausting
 *  the script. The real `verify()` call we're
 *  testing does NOT use the model — it goes
 *  through the bridge's verifier rules. */
function scriptedModel(
  responses: ReadonlyArray<{
    content: ContentBlock[];
    stopReason?: ModelResponse["stopReason"];
    usage?: ModelResponse["usage"];
  }>,
): ModelAdapter {
  let i = 0;
  return {
    async complete(_input: CompleteInput) {
      const r = responses[i];
      if (!r) {
        throw new Error(
          `scriptedModel: script exhausted (call #${i + 1}, total scripted: ${responses.length})`,
        );
      }
      i++;
      return {
        content: r.content,
        stopReason: r.stopReason ?? "end_turn",
        ...(r.usage ? { usage: r.usage } : {}),
      };
    },
  };
}

/** A real test key (PEM) — `defaultSignResult`
 *  uses `@noble/ed25519` to sign. Any valid
 *  ed25519 key works; this is a fixture key from
 *  the envoy-harness test suite (reused for
 *  cross-verify e2e). */
const AGENT_PRIVATE_KEY_PEM =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEINTuctv5E1hK1bbY1tIYUDDXbI0Ma1S5G7l6jKlz5yjF\n-----END PRIVATE KEY-----\n";

// ---------------------------------------------------------------------------
// Part 1: createEnvoyHarnessAdapter (stub factory)
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

// ---------------------------------------------------------------------------
// Part 2: createRealEnvoyHarnessRuntime (real ask runtime)
// ---------------------------------------------------------------------------

describe("createRealEnvoyHarnessRuntime — cross-verify wiring (Phase 8 Step 6)", () => {
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
    const runtime = createRealEnvoyHarnessRuntime({
      workerPeerId: "envoy-peer",
      agentPrivateKeyPem: AGENT_PRIVATE_KEY_PEM,
      config,
      cwd: process.cwd(),
      askOpenClaw: async () => "openclaw answer",
      modelFactory: () => scriptedModel({ responses: [] }),
      openClawAdapter,
    });

    // Warm up the runtime so the adapter is
    // constructed (lazy init).
    await runtime.ask("warm up", { skillId: "code-review" });
    // Then call `verify` directly on the
    // constructed adapter.
    const localResult = makeLocalResult("code-review");
    const verdicts = await runtime.adapter.verify({
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
    const runtime = createRealEnvoyHarnessRuntime({
      workerPeerId: "envoy-peer",
      agentPrivateKeyPem: AGENT_PRIVATE_KEY_PEM,
      config,
      cwd: process.cwd(),
      askOpenClaw: async () => "openclaw answer",
      modelFactory: () => scriptedModel({ responses: [] }),
      // No openClawAdapter — backward compat.
    });

    await runtime.ask("warm up", { skillId: "code-review" });
    const localResult = makeLocalResult("code-review");
    const verdicts = await runtime.adapter.verify({
      result: localResult,
      objective: "review this PR",
    });
    // Local-only: no cross was run. The result
    // is the local verifier's verdicts (at least
    // one for a non-empty result).
    expect(verdicts.length).toBeGreaterThan(0);
  });
});
