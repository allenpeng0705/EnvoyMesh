/**
 * Phase 8 — model adapter selection for the envoy-harness runtime.
 *
 * **Step 1 scope:** a placeholder that returns a deepseek provider ID.
 * The actual `createProviderAdapter(...)` call (from envoy-harness's
 * `llm/index.ts`) lives in Step 2 once we wire the model end-to-end.
 * Until then, this module exports just the provider-id string the
 * factory passes to the bridge.
 *
 * **b3.live (model inheritance):** the new
 * `resolveEnvoyHarnessHostModel` helper maps EnvoyMesh's
 * `ModelProviderConfig` to a `<provider>:<model>` string
 * that envoy-harness can consume. The host (NodeServiceImpl)
 * reads its `getNodeConfig().modelProviders` + passes the
 * mapped string as `hostModel` to
 * `loadEnvoyHarnessRuntimeConfig({ hostModel })`. This
 * matches the OpenClaw pattern: the host configures its
 * LLM once; both runtimes use it as the default; each
 * can override with its own env var.
 *
 * **Why this lives in its own file:** Step 2 will add a real picker
 * with provider switch logic (deepseek default, openai + anthropic
 * for ops with non-deepseek keys; matches the multi-provider LLM
 * capability listed in `docs/agent-network-engine.md` §2.2). Keeping
 * the picker in one file makes the Step 2 diff a single-file change
 * instead of a `factory.ts` rewrite.
 *
 * **Cooperation with Q3 D (signal-based opt-in):** the picker is
 * deliberately side-effect-free. The Tauri router (Step 5) decides
 * which engine gets the prompt; this module just resolves the
 * provider for the chosen engine.
 */

import type { ModelProviderConfig } from "@envoymesh/api";

export type EnvoyHarnessProviderId = "deepseek" | "openai" | "anthropic" | "stub";

/**
 * Resolve the LLM provider ID from the runtime config's `model` string.
 * Format: `<provider>:<model-name>`. Defaults to `deepseek` for any
 * unrecognized prefix — matches the openclaw default and the
 * envoy-harness QUICKSTART.md recommendation.
 *
 * Step 1 stub: this function is pure (no I/O) and is what the unit
 * test exercises. Step 2 adds the `createProviderAdapter(provider)`
 * call + readiness probe (one cheap `model.list()` or equivalent).
 */
export function resolveEnvoyHarnessProvider(
  modelSpec: string,
): EnvoyHarnessProviderId {
  const prefix = modelSpec.split(":", 1)[0]?.trim().toLowerCase();
  switch (prefix) {
    case "deepseek":
      return "deepseek";
    case "openai":
      return "openai";
    case "anthropic":
    case "claude":
      return "anthropic";
    case "stub":
      return "stub";
    default:
      return "deepseek";
  }
}

/**
 * Map EnvoyMesh's `ModelProviderConfig` (the host's
 * configured LLM) to a `<provider>:<model>` string
 * that envoy-harness's `createProviderAdapter` can
 * consume. Returns `undefined` for unsupported modes
 * (e.g. `mock`, `disabled`) — the caller should treat
 * `undefined` as "envoy-harness is not ready" (no
 * real model to use).
 *
 * **Provider mapping (host → envoy-harness):**
 *
 * | Host `mode`     | envoy-harness string              | Notes |
 * |-----------------|-----------------------------------|-------|
 * | `"openai"`      | `openai:<modelName>`             | Direct |
 * | `"anthropic"`   | `anthropic:<modelName>`          | Direct |
 * | `"ollama"`      | `ollama:<modelName>`             | Direct (keyless) |
 * | `"litellm"`     | `openai:<modelName>`             | Reuses the `openai` adapter (LiteLLM is OpenAI-compatible); the host's `endpoint` is passed via `OpenAIAdapter.baseUrl` in Step 4+ |
 * | `"mock"`        | `undefined`                       | Not supported (no real model) |
 * | `"disabled"`    | `undefined`                       | Not supported (model calls disabled at the host level) |
 *
 * **Why `litellm` → `openai`:** envoy-harness has
 * `openai` and `anthropic` adapters. `litellm` is
 * OpenAI-compatible; the `openai` adapter accepts a
 * custom `baseUrl`. For v0, the host's `litellm`
 * config is used with the `openai` provider. Future:
 * add a dedicated `litellm` adapter if the LiteLLM
 * streaming format diverges from OpenAI's.
 *
 * **Why no `deepseek` in the host's `mode` enum:**
 * the host's `ModelProviderConfig.mode` is
 * `"openai" | "anthropic" | "ollama" | "litellm" |
 * "mock" | "disabled"`. There's no `"deepseek"`
 * literal — but `resolveEnvoyHarnessProvider` already
 * defaults to `"deepseek"` for any unrecognized
 * prefix. So if the host's `mode` is `"deepseek"`
 * (added in a future Tauri settings UI), the
 * function below maps it directly to
 * `"deepseek:<modelName>"` (the `default` branch).
 *
 * **When the modelName is empty:** the host's
 * `modelName` is optional (e.g. a mock provider may
 * not set it). For the production providers
 * (`openai` / `anthropic` / `ollama` /
 * `litellm`), an empty `modelName` is treated as
 * "not ready" (the user hasn't picked a model
 * yet). We return `undefined` so the readiness
 * check (`loadEnvoyHarnessRuntimeConfig`) reports
 * `ready: false` + a clear reason.
 *
 * **Pure function:** no I/O, no `process.env`, no
 * `getNodeConfig()` call. The caller injects the
 * `ModelProviderConfig` (typically from
 * `getNodeConfig().modelProviders`).
 */
export function resolveEnvoyHarnessHostModel(
  modelProviders: ModelProviderConfig,
): string | undefined {
  const mode = (modelProviders.mode ?? "").toLowerCase();
  const modelName = modelProviders.modelName?.trim() ?? "";

  // Unsupported modes: return undefined → not ready.
  if (mode === "" || mode === "mock" || mode === "disabled") {
    return undefined;
  }

  // No model name: not ready (user hasn't picked
  // a model yet). Same treatment for any mode.
  if (modelName.length === 0) {
    return undefined;
  }

  // Production provider mapping.
  switch (mode) {
    case "openai":
    case "openai-compatible":
      // `openai-compatible` (MiniMax, LiteLLM, Envoy Local's local
      // llama-server, …) is OpenAI-compatible — reuse the `openai`
      // adapter. The host's `endpoint` is passed separately (it cannot
      // live in the model string).
      return `openai:${modelName}`;
    case "anthropic":
    case "anthropic-compatible":
      return `anthropic:${modelName}`;
    case "ollama":
      return `ollama:${modelName}`;
    case "litellm":
      // LiteLLM is OpenAI-compatible. Reuse the
      // `openai` adapter. The `endpoint` is passed
      // via `OpenAIAdapter.baseUrl` in a follow-up
      // (envoy-harness's `createProviderAdapter`
      // doesn't read the endpoint from the model
      // string; the host would pass it via a
      // separate seam when wiring the live
      // runtime in b3.live.2).
      return `openai:${modelName}`;
    case "deepseek":
      return `deepseek:${modelName}`;
    default:
      // Unknown mode: fall back to deepseek
      // (matches the openclaw default and the
      // envoy-harness QUICKSTART.md recommendation).
      return `deepseek:${modelName}`;
  }
}

/**
 * Phase 8 / b3.live — map EnvoyMesh's
 * `ModelProviderConfig` to the host-injected
 * `hostModel` + `hostApiKey` pair consumed by
 * `loadEnvoyHarnessRuntimeConfig`.
 *
 * **What this returns:** `{ model, apiKey }` when
 * the host's config is usable (production provider
 * + non-empty model name). `undefined` when the
 * config is unsupported (`mock` / `disabled` / empty
 * mode / empty modelName) — the caller should treat
 * `undefined` as "not ready" (the host has no real
 * model to use).
 *
 * **Why a separate helper, not inline in the host:**
 * keeps the mapping logic in one place. The host's
 * `NodeServiceImpl` reads `getNodeConfig()` +
 * calls this helper + passes the result to
 * `loadEnvoyHarnessRuntimeConfig({ hostModel,
 * hostApiKey })`. Tests can call this helper
 * directly with a fixture `ModelProviderConfig`
 * (no I/O).
 *
 * **The model string:** uses the same provider
 * mapping as `resolveEnvoyHarnessHostModel` above
 * (openai / anthropic / ollama / litellm / deepseek).
 *
 * **The API key:** trimmed `ModelProviderConfig.apiKey`.
 * The host may not have written it to `process.env`
 * (Tauri users enter it in the settings UI; we don't
 * mirror it). The DI seam flows the key through to
 * the runtime's model adapter.
 *
 * **Pure function:** no I/O, no `process.env`, no
 * `getNodeConfig()`. The caller injects the
 * `ModelProviderConfig`.
 */
export interface EnvoyHarnessHostConfig {
  /** `<provider>:<model>` string for `loadEnvoyHarnessRuntimeConfig`. */
  model: string;
  /** The host's API key (trimmed). May be `undefined` for keyless providers. */
  apiKey: string | undefined;
  /** The host's OpenAI/Anthropic-compatible endpoint (base URL). */
  endpoint: string | undefined;
}

export function resolveEnvoyHarnessHostConfig(
  modelProviders: ModelProviderConfig,
): EnvoyHarnessHostConfig | undefined {
  const model = resolveEnvoyHarnessHostModel(modelProviders);
  if (!model) return undefined;
  // The API key is the user's input from the Tauri
  // settings UI. We trim + check non-empty so the
  // runtime can rely on `apiKey.length > 0` for
  // key-required providers.
  const rawKey = modelProviders.apiKey?.trim() ?? "";
  return {
    model,
    apiKey: rawKey.length > 0 ? rawKey : undefined,
    endpoint: modelProviders.endpoint?.trim() || undefined,
  };
}
