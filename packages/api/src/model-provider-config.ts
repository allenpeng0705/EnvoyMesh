/**
 * Model provider configuration — the reusable half of the model-router contract.
 *
 * ## Why these two declarations live here
 *
 * They were declared in `ws-protocol.ts`, which is `product-bound`: it carries
 * the JSON-RPC method union, so importing *any* symbol from it classifies the
 * importer `product-bound` too (E9's third condition, applied at module scope).
 * `harness/pi-runtime.ts` needs `ModelProviderConfig` to build a spawn config,
 * and that one import was the last thing keeping a reusable module out of
 * `@envoymesh/api/core` — this file is the whole fix.
 *
 * Nothing about either type is product-specific: a mode enum and a provider
 * config (endpoint, model name, key, approval flag).
 *
 * `ws-protocol.ts` re-exports both, so every existing importer — including
 * `@envoymesh/api` itself — is unchanged.
 */

/** Model provider mode: mock (no external calls), ollama (local), litellm (local/cloud), openai-compatible (OpenAI Chat Completions API format), anthropic-compatible (Anthropic Messages API format), or disabled. */
export type ModelProviderMode = "mock" | "ollama" | "litellm" | "openai-compatible" | "anthropic-compatible" | "disabled";

export interface ModelProviderConfig {
  /** Provider mode. When "disabled", no model calls are made. Default: "mock". */
  mode: ModelProviderMode;
  /**
   * Optional curated preset id (e.g. "minimax-cn", "anthropic").
   * UI/OpenClaw metadata — transport still uses {@link mode}.
   */
  presetId?: string;
  /** Base URL for OpenAI-compatible `/chat/completions` (include `/v1`): Ollama `http://127.0.0.1:11434/v1`, LiteLLM `http://127.0.0.1:4000/v1`. Bare host roots are normalized at runtime. Anthropic mode uses API host without `/v1` (e.g. `https://api.anthropic.com`). */
  endpoint?: string;
  /** Model name for ollama (e.g. "llama3.1") or litellm (e.g. "gpt-4o-mini"). */
  modelName?: string;
  /** Optional API key for litellm, openai, and anthropic providers. */
  apiKey?: string;
  /** If true, cloud providers require explicit owner approval per request. Default: true. */
  requireApprovalForCloud?: boolean;
  /**
   * Mock-mode only: fixed completion text, or `__plan_assign_from_roster__` to
   * synthesize a Team-jobs plan+assign JSON from the Assigner prompt roster.
   */
  mockResponseText?: string;
}
