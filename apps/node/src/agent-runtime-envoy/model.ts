/**
 * Phase 8 — model adapter selection for the envoy-harness runtime.
 *
 * **Step 1 scope:** a placeholder that returns a deepseek provider ID.
 * The actual `createProviderAdapter(...)` call (from envoy-harness's
 * `llm/index.ts`) lives in Step 2 once we wire the model end-to-end.
 * Until then, this module exports just the provider-id string the
 * factory passes to the bridge.
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
