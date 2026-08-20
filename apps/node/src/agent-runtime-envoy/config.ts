/**
 * Phase 8 — per-node config for the envoy-harness runtime.
 *
 * **Step 1 scope:** a thin env-var reader. Returns a "not configured"
 * stub by default so the engine picker can be plumbed end-to-end
 * (Step 1.1) without forcing every operator to set up model credentials
 * before the first merge. Step 2+ replaces the stub with real model
 * adapter wiring (see `agent-harness-integration.md` Step 1 §5.1
 * the model adapter selection).
 *
 * **Why env vars (not a config file) for Step 1:** Tauri user prompts
 * don't yet drive envoy-harness (Q3 D — default is OpenClaw). Operators
 * who DO set the engine to `envoy-harness` are early adopters; the
 * env-var surface is the smallest API that satisfies the "the picker
 * accepts the new engine and the factory returns a valid adapter"
 * acceptance test. Real config-file integration lands with the
 * Tauri AI Engine settings UI (Step 5).
 *
 * **Override knobs (Step 1):**
 *   `ENVOY_HARNESS_API_KEY`  — required for live model calls. Stub
 *                              mode (the Step 1 default) does not
 *                              need it.
 *   `ENVOY_HARNESS_MODEL`    — provider:model string (default
 *                              `deepseek:deepseek-chat`). Passed to
 *                              `createProviderAdapter` in Step 2.
 *   `ENVOY_HARNESS_CWD`      — cwd for `Agent.run()` (default
 *                              `process.cwd()`).
 */

export interface EnvoyHarnessRuntimeConfig {
  /** True when the runtime has the minimum config to be considered ready. */
  ready: boolean;
  /** Provider:model string for the LLM adapter (Step 2 reads this). */
  model: string;
  /** Working directory for the agent's tool calls. */
  cwd: string;
  /** Why `ready` is false — surfaces in `agentNetworkEngineDenyReason`. */
  reason: string | null;
}

/**
 * Load the envoy-harness runtime config from the process environment.
 * Step 1 stub: always returns `{ ready: false, ... }` so the picker
 * accepts the literal but `isEnvoyHarnessReady()` is false (matching
 * the design doc's "no real model wiring until Step 2").
 *
 * Step 2 will flip `ready` based on `ENVOY_HARNESS_API_KEY` presence +
 * a successful `createProviderAdapter(model).ping()` round-trip.
 */
export function loadEnvoyHarnessRuntimeConfig(): EnvoyHarnessRuntimeConfig {
  const model = process.env.ENVOY_HARNESS_MODEL ?? "deepseek:deepseek-chat";
  const cwd = process.env.ENVOY_HARNESS_CWD ?? process.cwd();

  // Step 1: stub. The factory + tests pass; the dispatch path
  // (node-service-impl) returns `envoy_harness_unavailable` for
  // any real call until Step 2 wires the model adapter.
  return {
    ready: false,
    model,
    cwd,
    reason: "envoy_harness_stub_phase_8_step_1",
  };
}
