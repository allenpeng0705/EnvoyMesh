/**
 * Phase 8 — per-node config for the envoy-harness runtime.
 *
 * **b3 scope (this commit):** the config is now the source
 * of truth for the real `isEnvoyHarnessReady()` check. The
 * function returns `ready: true` when:
 * 1. The model string parses as `<provider>:<model>` (or a
 *    single-token provider default).
 * 2. The provider's API key env var is set
 *    (`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`).
 *
 * The check is static (env-var presence, no model call).
 * The host's `askEnvoyHarness` short-circuits on
 * `!config.ready`; on `config.ready === true`, the actual
 * `createProviderAdapter(...)` call happens lazily in
 * `createRealEnvoyHarnessRuntime` (so a transient API error
 * surfaces as a failed `ask` result, not a config error).
 *
 * **Override knobs (b3):**
 *   `ENVOY_HARNESS_API_KEY`  — optional override. When set,
 *                              the runtime uses this key
 *                              regardless of the provider.
 *                              Default: read the provider-
 *                              specific env var
 *                              (`DEEPSEEK_API_KEY` /
 *                              `OPENAI_API_KEY` /
 *                              `ANTHROPIC_API_KEY`).
 *   `ENVOY_HARNESS_MODEL`    — provider:model string (default
 *                              `deepseek:deepseek-chat`).
 *   `ENVOY_HARNESS_CWD`      — cwd for `Agent.run()` (default
 *                              `process.cwd()`).
 *
 * **Backward compatibility:** the old
 * `ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1` env var still works
 * to force `ready: false` (useful for tests that want to
 * verify the stub path). Same semantics as b1: the stub
 * forces `ready: false` regardless of API key presence.
 *
 * **Why env vars (not a config file) for b3:** Tauri user
 * prompts don't yet drive envoy-harness (Q3 D — default is
 * OpenClaw). The env-var surface is the smallest API that
 * satisfies the "the picker accepts the new engine and the
 * factory returns a valid adapter" acceptance test. Real
 * config-file integration lands with the Tauri AI Engine
 * settings UI (Step 5).
 */

export interface EnvoyHarnessRuntimeConfig {
  /** True when the runtime has the minimum config to be considered ready. */
  ready: boolean;
  /** Provider:model string for the LLM adapter. */
  model: string;
  /** Working directory for the agent's tool calls. */
  cwd: string;
  /** The provider id (parsed from `model`). Useful for the
   *  `createRealEnvoyHarnessRuntime`'s `modelFactory` (when
   *  it needs to know which provider to construct). */
  provider: string;
  /** Why `ready` is false — surfaces in `agentNetworkEngineDenyReason`.
   *  `null` when `ready: true`. */
  reason: string | null;
}

/**
 * Map a provider name to the env var that holds the API key.
 * Matches `createProviderAdapter` in
 * `@envoymesh/envoy-harness/llm/index.ts`. `ollama` is
 * keyless (placeholder key).
 */
function apiKeyEnvVarForProvider(provider: string): string | null {
  switch (provider) {
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
    case "claude":
      return "ANTHROPIC_API_KEY";
    case "ollama":
      return null; // keyless
    default:
      return null;
  }
}

/**
 * Load the envoy-harness runtime config from the process environment.
 *
 * **Stub escape hatch:** `ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1`
 * forces `ready: false` regardless of API key presence. The host
 * sets this for tests that want to verify the stub path; the
 * default Step 1 behavior was "always false" — this preserves it.
 */
export function loadEnvoyHarnessRuntimeConfig(): EnvoyHarnessRuntimeConfig {
  // b3 — read the model + cwd from the env, parse the
  // provider from the model string. The provider id is
  // the bit before the first `:` (lower-cased). A
  // missing `:` defaults to `deepseek` (matches the
  // envoy-harness QUICKSTART.md recommendation).
  const model = process.env.ENVOY_HARNESS_MODEL ?? "deepseek:deepseek-chat";
  const cwd = process.env.ENVOY_HARNESS_CWD ?? process.cwd();
  const provider = (model.split(":", 1)[0] ?? "deepseek").toLowerCase();

  // b3 — stub escape hatch (matches Step 1 behavior).
  if (process.env.ENVOY_HARNESS_STUB_PHASE_8_STEP_1 === "1") {
    return {
      ready: false,
      model,
      cwd,
      provider,
      reason: "envoy_harness_stub_phase_8_step_1",
    };
  }

  // b3 — check the API key env var. `ENVOY_HARNESS_API_KEY`
  // overrides the provider-specific key (test escape hatch
  // + single-config convenience for Tauri users).
  const overrideKey = process.env.ENVOY_HARNESS_API_KEY;
  const providerKeyEnv = apiKeyEnvVarForProvider(provider);
  const hasKey =
    (overrideKey !== undefined && overrideKey.length > 0) ||
    (providerKeyEnv !== null &&
      (process.env[providerKeyEnv]?.length ?? 0) > 0);
  if (!hasKey && providerKeyEnv !== null) {
    return {
      ready: false,
      model,
      cwd,
      provider,
      reason: `envoy_harness_api_key_missing: set ${providerKeyEnv} (or ENVOY_HARNESS_API_KEY)`,
    };
  }

  // b3 — ready. The model adapter is built lazily on the
  // first `ask` call (so transient API errors surface as
  // failed `ask` results, not config errors).
  return {
    ready: true,
    model,
    cwd,
    provider,
    reason: null,
  };
}
