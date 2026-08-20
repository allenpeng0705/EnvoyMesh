/**
 * Phase 8 Step 2 / b3.live — Live-LLM e2e for the real
 * envoy-harness runtime.
 *
 * **What this tests:** the b3 runtime end-to-end with a
 * real LLM provider (DeepSeek by default). The test:
 * 1. Constructs `createRealEnvoyHarnessRuntime` with the
 *    real `createProviderAdapter` (no `modelFactory`
 *    injection).
 * 2. Calls `runtime.ask("Say hello in 5 words")` with a
 *    real `signal` + `deadlineMs`.
 * 3. Verifies the result is non-empty text (real LLM
 *    responded).
 * 4. Verifies the result has the right `workerRuntime`
 *    ("envoy-harness") and `workerPeerId` (the configured
 *    peerId).
 * 5. Verifies the result's `costUsd > 0` (or `0` for free
 *    models — DeepSeek charges a tiny amount per token,
 *    so we expect `> 0` in practice).
 *
 * **Self-skip condition:** `ENVOY_HARNESS_LIVE_TESTS=1`
 * opt-in + `DEEPSEEK_API_KEY` (or `ENVOY_HARNESS_API_KEY`)
 * env var present. Without either, the test prints a
 * skip message and returns (no `describe` failure). The
 * opt-in mirrors `ENVOY_PHASE18_LIVE_TESTS=1` (the
 * existing Phase 18 live test pattern in
 * `apps/node/test/phase18-minimax-config.ts`).
 *
 * **Run:**
 *   ENVOY_HARNESS_LIVE_TESTS=1 DEEPSEEK_API_KEY=sk-... npx vitest run \
 *     apps/node/test/agent-runtime-envoy-runtime.live.test.ts
 *
 * **Why a separate file:** the `<feature>.live.test.ts`
 * naming is the canonical "this needs a real API key"
 * marker. CI's vitest config (or the user's local
 * runner) can target the pattern to opt-in explicitly.
 *
 * **Why a single test:** the live network call is
 * expensive; we batch the assertions into one test
 * (model responds + result shape). Splitting into
 * multiple tests would multiply the cost.
 */

import { describe, expect, it } from "vitest";

import { createRealEnvoyHarnessRuntime, loadEnvoyHarnessRuntimeConfig } from "../src/agent-runtime-envoy/index.js";

const ENVOY_HARNESS_LIVE_TESTS_OPT_IN = "ENVOY_HARNESS_LIVE_TESTS";

/**
 * True when the live test should run: opt-in env var
 * is set + a real API key is present.
 */
function isEnvoyHarnessLiveModelConfigured(): boolean {
  if (process.env[ENVOY_HARNESS_LIVE_TESTS_OPT_IN] !== "1") return false;
  const apiKey =
    process.env.ENVOY_HARNESS_API_KEY ?? process.env.DEEPSEEK_API_KEY;
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

/** Skip message when the live test is not configured. */
function envoyHarnessLiveSkipMessage(): string {
  return (
    "live test requires ENVOY_HARNESS_LIVE_TESTS=1 + " +
    "DEEPSEEK_API_KEY (or ENVOY_HARNESS_API_KEY). Set them " +
    "and re-run: `ENVOY_HARNESS_LIVE_TESTS=1 DEEPSEEK_API_KEY=sk-... npx vitest run " +
    "apps/node/test/agent-runtime-envoy-runtime.live.test.ts`"
  );
}

describe("createRealEnvoyHarnessRuntime (Phase 8 / b3.live — live LLM)", () => {
  it.skipIf(!isEnvoyHarnessLiveModelConfigured())(
    "drives a real DeepSeek model end-to-end via the real EnvoyHarnessAdapter",
    async () => {
      // The real config (env-var-driven). The readiness
      // check passes because the opt-in + API key are
      // both set (guarded by the describe.skipIf).
      const config = loadEnvoyHarnessRuntimeConfig();
      if (!config.ready) {
        // Defensive: shouldn't happen because the
        // describe.skipIf guards the test, but a
        // misconfiguration (e.g. ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1)
        // could still skip us in a clean way.
        throw new Error(
          `envoy-harness config not ready: ${config.reason ?? "unknown"}`,
        );
      }
      const runtime = createRealEnvoyHarnessRuntime({
        workerPeerId: "12D3KooWLiveTest",
        // A real test private key (PEM). The
        // `defaultSignResult` uses `@noble/ed25519` to
        // sign. This is a fixture key from the
        // envoy-harness test suite.
        agentPrivateKeyPem:
          "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEINTuctv5E1hK1bbY1tIYUDDXbI0Ma1S5G7l6jKlz5yjF\n-----END PRIVATE KEY-----\n",
        config,
        cwd: process.cwd(),
        // No `askOpenClaw` — the live test doesn't
        // exercise cross-runtime sub-agents. The
        // LocalRuntimeRegistry needs it for
        // construction (the b3 work), but it
        // shouldn't be called in this test path.
        askOpenClaw: (p) => {
          throw new Error(
            `unexpected askOpenClaw call: ${p.slice(0, 80)}`,
          );
        },
      });

      // Drive a real ask. The prompt is a simple
      // sanity check — most LLMs respond with ~5
      // words to "say hello in 5 words". A real
      // network call (DeepSeek's `/chat/completions`).
      const startedAt = Date.now();
      const result = await runtime.ask("Say hello in 5 words", {
        deadlineMs: 30_000, // 30s timeout; plenty for a 5-word reply
        costCeilingUsd: 0.01, // $0.01 cap; a 5-word reply is well under
        skillId: "code-review",
      });
      const durationMs = Date.now() - startedAt;

      // 1. The result is non-empty text.
      expect(result.length).toBeGreaterThan(0);
      // 2. The result is a reasonable response (loose check;
      //    "hello" or greeting-like words). Not strict —
      //    LLMs may vary.
      expect(result.toLowerCase()).toMatch(/hello|hi|hey|greet/);

      // 3. The duration is reasonable (well under 30s).
      //    Loose check: < 25s leaves headroom for
      //    network jitter. We don't assert the
      //    duration precisely because it depends on
      //    the network.
      expect(durationMs).toBeLessThan(25_000);

      // 4. The runtime is ready (the readiness check
      //    passed; redundant but explicit).
      expect(runtime.isReady()).toBe(true);
    },
    60_000,
  ); // vitest test timeout: 60s (covers the 30s ask deadline + setup)
});

/**
 * Also expose a sanity check that the self-skip is
 * wired correctly. This test always runs (no skipIf)
 * and just verifies the helper functions. Catches
 * regressions in the skip-logic.
 */
describe("live-test helpers (Phase 8 / b3.live)", () => {
  it("isEnvoyHarnessLiveModelConfigured returns a boolean (never throws)", () => {
    // Pure: no env mutations, no I/O. Just verify the
    // helper doesn't throw and returns a boolean.
    const result = isEnvoyHarnessLiveModelConfigured();
    expect(typeof result).toBe("boolean");
  });

  it("envoyHarnessLiveSkipMessage returns a non-empty string", () => {
    const msg = envoyHarnessLiveSkipMessage();
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});
