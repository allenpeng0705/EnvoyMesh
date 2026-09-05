/**
 * Pure builder for the thin-client `getHomeModelStatus` RPC (EM-4;
 * docs/envoy-home-side-plan.md §1.3 + docs/thin-client-protocol-v0.3-draft.md §2.2).
 *
 * Kept outside node-service-impl so the mode/capability resolution stays
 * deterministic and unit-testable without constructing a NodeServiceImpl or
 * probing any sidecar. The handler gathers the live facts (effective provider
 * config + Envoy Local / embed status + knowledge-base embedding config) and
 * passes them in via {@link HomeModelStatusInput}.
 */
import { hasUsableModelProvider } from "@envoymesh/api";
import type {
  GetHomeModelStatusResult,
  HomeModelProviderMode,
  HomeModelStatusCapabilities,
  ModelProviderConfig,
} from "@envoymesh/api";

/**
 * Live facts `getHomeModelStatus` needs, gathered by the node-service handler.
 * Kept deliberately small and primitive so the builder stays pure.
 */
export interface HomeModelStatusInput {
  /**
   * Effective provider config — the `getEffectiveModelProviders()` result
   * (cloud/Ollama from Settings, else Envoy Local when opted-in + running,
   * else the persisted config which may be mock/disabled).
   */
  config: ModelProviderConfig | null | undefined;
  /** Live Envoy Local chat sidecar (:18790) facts; null/omitted when not opted in. */
  envoyLocal?: {
    /** llama-server child is up and `/v1/models` answers. */
    running: boolean;
  } | null;
  /** Embedding facts — Envoy Local embed sidecar (:18791) + Knowledge config. */
  embedding?: {
    /** Embed llama-server is up and answers. */
    sidecarRunning: boolean;
    /**
     * A real (non-mock) embedding provider is configured: Envoy Local embed
     * with an installed active model, or an Ollama/OpenAI-compatible embed
     * mode with a model/endpoint in Knowledge settings.
     */
    providerConfigured: boolean;
  } | null;
  /**
   * Model name override — the handler prefers this (it merges the effective
   * config's `modelName`, which `resolveEffectiveModelProviders` sets to the
   * Envoy Local `activeModelId` when local is selected).
   */
  modelName?: string | null;
  /**
   * Deterministic vision signal. Only true when the node can prove the active
   * model takes images (Envoy Local mmproj loaded, Ollama `/api/tags`
   * capabilities, provider config declaring vision). Absent ⇒ `"unknown"`.
   */
  vision?: boolean | "unknown";
  /**
   * Deterministic effective context size when the node config actually
   * provides one (Envoy Local llama-server `-c` ctx size). Omitted from the
   * result when not provided.
   */
  contextWindow?: number;
  /**
   * Deterministic per-request output cap when the node config actually
   * declares one. Omitted from the result when not provided.
   */
  maxTokens?: number;
}

/**
 * Map an effective {@link ModelProviderConfig} onto the canonical status mode.
 *
 * Mirrors the answering-mode labels EM-3 derives from a routed providerId
 * (`ask-home-model.ts`), plus `"disabled"` for the not-configured state:
 *   - `presetId: "envoy-local"` (mode openai-compatible) → "envoy-local"
 *   - mode "ollama" → "ollama"
 *   - mode "openai-compatible" (non-local) → "openai-compatible"
 *   - litellm / anthropic-compatible → "cloud"
 *   - mock / disabled / absent config → their own labels
 */
export function homeModelProviderModeFromConfig(
  config: ModelProviderConfig | null | undefined,
): HomeModelProviderMode {
  if (!config) return "disabled";
  if (config.mode === "disabled") return "disabled";
  if (config.mode === "mock") return "mock";
  if (config.presetId === "envoy-local") return "envoy-local";
  if (config.mode === "ollama") return "ollama";
  if (config.mode === "openai-compatible") return "openai-compatible";
  // litellm / anthropic-compatible (and any future non-mock cloud mode).
  return "cloud";
}

/**
 * Build the `getHomeModelStatus` result deterministically from live input
 * facts. Never throws.
 */
export function buildHomeModelStatus(
  input: HomeModelStatusInput,
): GetHomeModelStatusResult {
  const mode = homeModelProviderModeFromConfig(input.config);
  // "Configured" = a real provider (mock/disabled excluded) the router can
  // actually use — same usable test the OpenClaw/model seams apply.
  const configured =
    mode !== "mock" && mode !== "disabled" && hasUsableModelProvider(input.config);

  // Envoy Local is the only mode with an observable up/down state here
  // (probed /v1/models). Cloud/Ollama are treated as reachable when a usable
  // config exists — no network probe from a status RPC.
  const localRunning = input.envoyLocal?.running === true;
  const reachable = configured && (mode !== "envoy-local" || localRunning);

  const rawModel =
    input.modelName?.trim() || input.config?.modelName?.trim() || undefined;
  const model = configured && rawModel ? rawModel : null;

  const capabilities: HomeModelStatusCapabilities = {
    text: configured,
    // mock/disabled never claim vision; a real provider without a
    // deterministic signal reports "unknown" (contract: unknown ⇒ no-vision).
    vision: configured ? (input.vision ?? "unknown") : "unknown",
    embedding: resolveEmbeddingCapability(input.embedding),
    streaming: false, // router is non-streaming (contract §1.3)
  };

  const contextWindow = positiveInt(input.contextWindow);
  const maxTokens = positiveInt(input.maxTokens);

  return {
    reachable,
    configured,
    mode,
    model,
    capabilities,
    ...(configured && contextWindow !== undefined ? { contextWindow } : {}),
    ...(configured && maxTokens !== undefined ? { maxTokens } : {}),
  };
}

/**
 * Embedding capability comes from the node's *embedding* path (Envoy Local
 * embed sidecar :18791 / Knowledge embedding config), which is independent of
 * the chat provider mode. True when the sidecar is running or a real embed
 * provider is configured; otherwise `"unknown"` (never a hard false — absence
 * of a probe is not proof of inability).
 */
function resolveEmbeddingCapability(
  embedding: HomeModelStatusInput["embedding"],
): boolean | "unknown" {
  if (!embedding) return "unknown";
  if (embedding.sidecarRunning === true || embedding.providerConfigured === true) {
    return true;
  }
  return "unknown";
}

/** Positive finite integer, else undefined (so we never emit 0/NaN). */
function positiveInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}
