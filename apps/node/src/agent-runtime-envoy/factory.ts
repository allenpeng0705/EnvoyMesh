/**
 * Phase 8 — `EnvoyHarnessAdapter` factory for the Agent Network engine picker.
 *
 * **Step 1 scope:** build a valid `AgentAdapter` from the cross-monorepo
 * bridge. The adapter's `execute()` path is **not** wired yet — Step 1
 * returns an adapter that throws `envoy_harness_stub_phase_8_step_1` on
 * `execute()`. Step 2 adds the model adapter + `BuildAgentFn` so the
 * adapter actually runs the LLM.
 *
 * **Why this lives in `apps/node` (not in the bridge):** the bridge
 * (`@envoymesh/envoy-harness-adapter`) is a pure factory — it
 * constructs adapters from `{ buildAgent, signResult, workerPeerId }`.
 * The bridge does NOT know how to:
 *  - read the node's signing key (`agentIdentity.agentPrivateKeyPem`)
 *  - look up the node's `agentPeerId`
 *  - decide which LLM provider to use
 *
 * All three are node-side concerns. Putting the factory here keeps
 * the bridge dep-light (it just needs the type + the `defaultBuildAgentFactory`
 * helper) and the app-level secrets stay in `apps/node`.
 *
 * **Signing:** Step 1 uses a no-op signResult that returns
 * `unsigned.signature: ""` — the bridge's `defaultSignResult` from
 * `@envoymesh/identity` is the right answer in Step 2. We don't wire
 * it in Step 1 because the host's `signCanonicalPayload` (used by
 * `OpenClawAdapter` at `node-service-chain-orchestration.ts:1130`) is
 * not exported from `apps/node`; threading it through here is a
 * Step 2 task that should also fix the `defaultSignResult` signature
 * if needed.
 */

import {
  EnvoyHarnessAdapter,
  buildEnvoyHarnessAdapterWithCrossVerify,
} from "@envoymesh/envoy-harness-adapter";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

import { resolveEnvoyHarnessProvider } from "./model.js";
import type { EnvoyHarnessRuntimeConfig } from "./config.js";

export interface CreateEnvoyHarnessAdapterInput {
  /** The node's agent peerId. Stamped into every adapter result. */
  workerPeerId: string;
  /** Runtime config from `loadEnvoyHarnessRuntimeConfig()`. */
  config: EnvoyHarnessRuntimeConfig;
  /**
   * Phase 8 / Step 6 — optional OpenClaw adapter
   * (or any other `AgentAdapter`) for cross-verify.
   * When provided, the factory uses
   * `buildEnvoyHarnessAdapterWithCrossVerify` so
   * `adapter.verify()` re-runs the same skill on
   * the cross adapter and returns the local
   * verifier's verdicts for the new result. This
   * is the Q4 (a) / (b) cross-verify primitive
   * wired at the adapter level (the
   * orchestrator's chain-verify-loop has the
   * orchestrator-level path; this is the
   * adapter-level path for direct callers like
   * the test seam in `node-service-impl`).
   *
   * v0 production wiring always passes this
   * (OpenClaw is always available as the
   * default AI engine).
   */
  openClawAdapter?: AgentAdapter;
}

/**
 * Build an `EnvoyHarnessAdapter` for the home node.
 *
 * **Step 1 contract:**
 *   - Returns a real `EnvoyHarnessAdapter` (the typecheck test).
 *   - `adapter.runtime === "envoy-harness"` (the seam test).
 *   - `adapter.execute()` throws `envoy_harness_stub_phase_8_step_1` —
 *     Step 2 wires the model adapter + BuildAgentFn.
 *   - `adapter.describeSkills()` returns the bridge's
 *     `ENVOY_HARNESS_SKILLS` (the manifest test).
 *
 * **Why the bridge's `defaultBuildAgentFactory` is NOT called here:**
 * that factory takes a `ModelAdapter` (from envoy-harness's `llm/`
 * package). Step 1 doesn't construct one — `resolveEnvoyHarnessProvider`
 * is a pure helper that returns the provider ID. Step 2 will:
 *   1. Call `createProviderAdapter(provider, apiKey)` from envoy-harness.
 *   2. Pass the model into `defaultBuildAgentFactory({ model })`.
 *   3. Pass the resulting `BuildAgentFn` into `new EnvoyHarnessAdapter(...)`.
 *
 * Until then, `buildAgent` is a no-op that returns a stub Agent so
 * the constructor's required-field check is satisfied.
 *
 * **Phase 8 / Step 6 — cross-verify:** when
 * `input.openClawAdapter` is provided, the factory
 * uses `buildEnvoyHarnessAdapterWithCrossVerify`
 * (the bridge's Q4 factory) to wire
 * `defaultCrossVerify(openClawAdapter)`. The
 * `verify()` method then re-runs the same skill
 * on OpenClaw and returns the local verifier's
 * verdicts for the new result.
 */
export function createEnvoyHarnessAdapter(
  input: CreateEnvoyHarnessAdapterInput,
): AgentAdapter {
  const provider = resolveEnvoyHarnessProvider(input.config.model);
  void provider; // Step 1: unused. Step 2 calls `createProviderAdapter(provider, ...)`.

  // Step 1 stub BuildAgentFn — the adapter is constructible, but
  // `execute()` will throw before invoking it (see the override below).
  const buildAgent = () => {
    throw new Error("envoy_harness_stub_phase_8_step_1");
  };

  // Step 1 stub SignResultFn — returns the unsigned result with an
  // empty signature. Step 2 wires the node's real signer
  // (`signCanonicalPayload(unsigned, agentIdentity.agentPrivateKeyPem)`)
  // through `defaultSignResult` from `@envoymesh/envoy-harness-adapter`.
  const signResult = <T extends { signature?: string }>(unsigned: T): T => ({
    ...unsigned,
    signature: "",
  });

  // Phase 8 / Step 6 — when `openClawAdapter` is
  // provided, use the bridge's cross-verify
  // factory. Otherwise, fall back to the plain
  // `new EnvoyHarnessAdapter(...)` (backward
  // compatible with Step 1-5 callers that don't
  // pass a cross adapter).
  if (input.openClawAdapter) {
    return buildEnvoyHarnessAdapterWithCrossVerify({
      buildAgent,
      signResult: signResult as never,
      workerPeerId: input.workerPeerId,
      openClawAdapter: input.openClawAdapter,
    });
  }

  const adapter = new EnvoyHarnessAdapter({
    buildAgent,
    signResult: signResult as never,
    workerPeerId: input.workerPeerId,
    // The bridge defaults `runtimeVersion` to `ENVOY_HARNESS_VERSION`
    // when omitted; we don't override.
  });

  return adapter;
}
