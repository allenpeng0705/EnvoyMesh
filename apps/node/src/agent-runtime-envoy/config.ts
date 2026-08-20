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
  /**
   * Phase 8 / b3.live — the API key to use for the model
   * adapter. Resolved from the precedence below. The
   * runtime (`runtime.ts`) uses this to build the `env`
   * for `createProviderAdapter` (which reads the key
   * from the env, not from `process.env`).
   *
   * **Why an explicit field, not just `process.env`:** the
   * host's `ModelProviderConfig.apiKey` is the source of
   * truth (the user enters it in the Tauri settings UI).
   * EnvoyMesh may not have written it to `process.env`;
   * we need to flow it through DI so the runtime uses
   * the same key the user configured.
   *
   * `undefined` when no key is set (and the provider
   * requires one). The readiness check (below) treats
   * this as `ready: false` for key-required providers
   * (e.g. `deepseek` / `openai` / `anthropic`). Keyless
   * providers (`ollama`) don't need a key.
   */
  apiKey: string | undefined;
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
 * Load the envoy-harness runtime config from the process
 * environment + the host's injected model + API key.
 *
 * **Model precedence (b3.live — model inheritance):**
 * ```
 * ENVOY_HARNESS_MODEL (env var)  >  hostModel (DI from NodeServiceImpl)  >  "deepseek:deepseek-chat" (default)
 * ```
 *
 * **API key precedence (b3.live — API key from host model config):**
 * ```
 * ENVOY_HARNESS_API_KEY (env var)  >  hostApiKey (DI from NodeServiceImpl)  >  provider-specific env var (DEEPSEEK_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)  >  undefined (for keyless providers like ollama)
 * ```
 *
 * The host (EnvoyMesh's `NodeServiceImpl`) reads its
 * `ModelProviderConfig` and passes both the model
 * (`<provider>:<model>`) and the API key as DI
 * parameters. This matches the OpenClaw pattern: the
 * host configures its LLM once (in the Tauri settings
 * UI); both runtimes use it as the default; each can
 * override with its own env var.
 *
 * **Why DI is the right shape:** the host's
 * `ModelProviderConfig` may not be written to
 * `process.env` (the user enters the key in the Tauri
 * settings UI; we don't have to mirror it to the env).
 * The DI seam lets the runtime use the same key the
 * user configured without forcing a `process.env`
 * mirror.
 *
 * **Stub escape hatch:** `ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1`
 * forces `ready: false` regardless of API key presence.
 * The host sets this for tests that want to verify
 * the stub path; the default Step 1 behavior was
 * "always false" — this preserves it.
 */
export function loadEnvoyHarnessRuntimeConfig(opts?: {
  /**
   * The host's configured LLM model (e.g.
   * `"deepseek:deepseek-chat"`, `"openai:gpt-4o-mini"`).
   * Used as the default when `ENVOY_HARNESS_MODEL`
   * is unset. The host injects this from its
   * `ModelProviderConfig` via
   * `resolveEnvoyHarnessHostModel` (see `model.ts`).
   */
  hostModel?: string;
  /**
   * Phase 8 / b3.live — the host's configured API key
   * (from `ModelProviderConfig.apiKey`). The host
   * injects this so the runtime uses the same key
   * the user configured. Used as a fallback when
   * `ENVOY_HARNESS_API_KEY` is unset; the
   * provider-specific env var (`DEEPSEEK_API_KEY` etc.)
   * is the lowest-priority fallback.
   */
  hostApiKey?: string;
}): EnvoyHarnessRuntimeConfig {
  // Read the model + cwd from the env (or host's
  // model). The provider id is the bit before the
  // first `:` (lower-cased). A missing `:` defaults
  // to `deepseek` (matches the envoy-harness
  // QUICKSTART.md recommendation).
  //
  // **Why explicit `length > 0` check:** the env var
  // may be set to an empty string (e.g. `vi.stubEnv`
  // for tests, or a user accidentally setting
  // `ENVOY_HARNESS_MODEL=`). `??` only falls through
  // on `null`/`undefined`, not on empty strings —
  // that would mean an empty `ENVOY_HARNESS_MODEL`
  // overrides the host model. The explicit
  // `length > 0` check correctly falls through on
  // empty strings.
  const envModel = process.env.ENVOY_HARNESS_MODEL;
  const model =
    (envModel && envModel.length > 0 ? envModel : undefined) ??
    (opts?.hostModel && opts.hostModel.length > 0
      ? opts.hostModel
      : undefined) ??
    "deepseek:deepseek-chat";
  const cwd = process.env.ENVOY_HARNESS_CWD ?? process.cwd();
  const provider = (model.split(":", 1)[0] ?? "deepseek").toLowerCase();

  // Stub escape hatch (matches Step 1 behavior).
  if (process.env.ENVOY_HARNESS_STUB_PHASE_8_STEP_1 === "1") {
    return {
      ready: false,
      model,
      cwd,
      provider,
      apiKey: undefined,
      reason: "envoy_harness_stub_phase_8_step_1",
    };
  }

  // Resolve the API key. Precedence:
  // 1. `ENVOY_HARNESS_API_KEY` (env var) — universal override
  //    (the test escape hatch + single-config convenience for
  //    Tauri users who want a uniform key).
  // 2. `hostApiKey` (DI from NodeServiceImpl) — the host's
  //    `ModelProviderConfig.apiKey`. This is the production
  //    path: the user enters the key in the Tauri settings UI.
  // 3. Provider-specific env var (`DEEPSEEK_API_KEY` etc.) —
  //    the lowest-priority fallback. Useful for tests +
  //    legacy setups that put the key in the env directly.
  // 4. `undefined` — no key set. For key-required providers
  //    (deepseek / openai / anthropic), this means
  //    `ready: false`. For keyless providers (ollama),
  //    the runtime uses a placeholder key.
  const envKey = process.env.ENVOY_HARNESS_API_KEY;
  const providerKeyEnv = apiKeyEnvVarForProvider(provider);
  const providerKey = providerKeyEnv
    ? process.env[providerKeyEnv]
    : undefined;
  const apiKey =
    (envKey && envKey.length > 0 ? envKey : undefined) ??
    (opts?.hostApiKey && opts.hostApiKey.length > 0
      ? opts.hostApiKey
      : undefined) ??
    (providerKey && providerKey.length > 0 ? providerKey : undefined);

  if (!apiKey && providerKeyEnv !== null) {
    return {
      ready: false,
      model,
      cwd,
      provider,
      apiKey: undefined,
      reason: `envoy_harness_api_key_missing: set ${providerKeyEnv} (or ENVOY_HARNESS_API_KEY, or pass hostApiKey from ModelProviderConfig)`,
    };
  }

  // Ready. The model adapter is built lazily on the
  // first `ask` call (so transient API errors surface as
  // failed `ask` results, not config errors).
  return {
    ready: true,
    model,
    cwd,
    provider,
    apiKey,
    reason: null,
  };
}
