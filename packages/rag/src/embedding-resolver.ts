/**
 * Browser-safe embedding resolver — pure logic, no Node-only imports.
 *
 * Split from `embedding-provider.ts` (which owns the HTTP/cache/mock
 * implementation and depends on `node:crypto`) so the Social UI can
 * import `resolveEmbeddingConfig` to surface "effective value" hints in
 * Settings without dragging Node builtins into the browser bundle.
 *
 * `embedding-provider.ts` re-exports everything from here so node-side
 * callers see no API change.
 */
import type {
  AiEmbeddingSettings,
  EmbeddingResponseShape,
  ModelProviderConfig,
} from "@envoymesh/api";
import { resolveEmbeddingMaxInputTokens } from "@envoymesh/api";

export type EmbeddingProviderMode = "mock" | "ollama" | "openai-compatible" | "inherit";

export interface ResolvedEmbeddingConfig {
  mode: EmbeddingProviderMode;
  modelName: string;
  endpoint: string;
  apiKey?: string;
  modelKey: string;
  maxInputTokens?: number;
  /** How to parse the upstream embeddings response. Only meaningful when mode=openai-compatible. */
  responseShape: EmbeddingResponseShape;
}

export interface ResolveEmbeddingConfigInput {
  embedding?: AiEmbeddingSettings | null;
  modelProviders?: ModelProviderConfig;
}

const DEFAULT_MOCK_EMBED_MODEL = "mock-embed";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text";
const DEFAULT_OPENAI_EMBED_MODEL = "text-embedding-3-small";

/**
 * Default embedding model + response shape for a known upstream host.
 *
 * Used by `inferEmbeddingProviderFromEndpoint` so that the embedding
 * resolver inherits sensible defaults from the chat model when the user
 * hasn't set them explicitly. Per-field overrides on the embedding
 * settings still win.
 *
 * Add a rule to surface a new provider's defaults — the order of rules
 * matters: the first matching hostname wins, so list more-specific rules
 * first.
 */
export interface EmbeddingProviderPreset {
  defaultEmbeddingModel: string;
  defaultResponseShape: EmbeddingResponseShape;
}

export interface EmbeddingProviderRule {
  /** Hostname regex. Matched against `URL(...).hostname` (or the host portion if the endpoint is not a full URL). */
  hostname: RegExp;
  preset: EmbeddingProviderPreset;
}

export const KNOWN_EMBEDDING_PROVIDERS: ReadonlyArray<EmbeddingProviderRule> = [
  {
    hostname: /^api\.minimaxi\.com$/i,
    preset: {
      // `auto` defers shape detection to the first call. The
      // sniff-and-cache machinery in `embedOpenAiCompatible` tries the
      // OpenAI envelope first (covers MiniMax's actual international
      // response), falls back to the legacy MiniMax flat shape if needed,
      // and caches the winner per endpoint for the rest of the process.
      // Hardcoding `"minimax"` here broke chat backfill 2026-07-10 because
      // the international endpoint returns the OpenAI-compatible envelope.
      // Explicit per-field overrides on the embedding settings still win.
      defaultEmbeddingModel: "embo-01",
      defaultResponseShape: "auto",
    },
  },
  {
    hostname: /^api\.openai\.com$/i,
    preset: {
      defaultEmbeddingModel: "text-embedding-3-small",
      defaultResponseShape: "openai",
    },
  },
  // Zhipu (Z.AI / 智谱) — OpenAI-compatible envelope. `embedding-2` is the
  // current GA model; `embedding-3` is the newer one with larger dims.
  // Either works on the same endpoint, so defaulting to `embedding-2` keeps
  // existing dims for any pre-existing Zhipu integrations.
  {
    hostname: /^open\.bigmodel\.cn$/i,
    preset: {
      defaultEmbeddingModel: "embedding-2",
      defaultResponseShape: "openai",
    },
  },
  // Alibaba DashScope — `text-embedding-v3` is the default model and the
  // OpenAI-compatible mode at `/compatible-mode/v1` returns the
  // `{ data: [{ embedding }] }` envelope, same as OpenAI proper.
  {
    hostname: /^dashscope\.aliyuncs\.com$/i,
    preset: {
      defaultEmbeddingModel: "text-embedding-v3",
      defaultResponseShape: "openai",
    },
  },
];

/**
 * Resolve the provider preset for a host. Returns `undefined` for
 * unrecognized hosts or non-URL endpoints (e.g. `mock://local`).
 *
 * Tolerant of partial inputs — `api.minimaxi.com/v1`,
 * `https://api.minimaxi.com`, `http://api.minimaxi.com:443/v1`,
 * and `api.minimaxi.com` all resolve to the same preset.
 */
export function inferEmbeddingProviderFromEndpoint(
  endpoint: string,
): EmbeddingProviderPreset | undefined {
  if (!endpoint) return undefined;
  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    // Manual protocol-stripping handles inputs like `api.minimaxi.com/v1`
    // or `mock://local` that `new URL` rejects.
    const stripped = endpoint.replace(/^[a-z]+:\/\//i, "");
    host = stripped.split("/")[0]?.split(":")[0] ?? "";
  }
  if (!host) return undefined;
  const rule = KNOWN_EMBEDDING_PROVIDERS.find((r) => r.hostname.test(host));
  return rule?.preset;
}

export function resolveEmbeddingConfig(input: ResolveEmbeddingConfigInput): ResolvedEmbeddingConfig {
  const embedding = input.embedding ?? {};
  const inherit = embedding.mode === "inherit" || embedding.mode === undefined;
  const mode: EmbeddingProviderMode = inherit
    ? resolveInheritedEmbeddingMode(input.modelProviders?.mode)
    : (embedding.mode ?? "mock");

  // 1. Resolve the effective endpoint first — this decides which preset
  //    (if any) matches. Inheritance + normalization happens here.
  let endpoint = embedding.endpoint?.trim() ?? "";
  if (!endpoint) {
    if (mode === "ollama") {
      endpoint = input.modelProviders?.endpoint?.replace(/\/v1\/?$/, "") ?? DEFAULT_OLLAMA_ENDPOINT;
    } else if (mode === "openai-compatible") {
      endpoint = normalizeOpenAiRoot(input.modelProviders?.endpoint ?? "https://api.openai.com/v1");
    } else {
      endpoint = "mock://local";
    }
  } else if (mode === "openai-compatible") {
    endpoint = normalizeOpenAiRoot(endpoint);
  } else if (mode === "ollama") {
    endpoint = endpoint.replace(/\/v1\/?$/, "");
  }

  // 2. Hostname-driven preset gives provider-aware defaults that follow
  //    the chat model config. Only used when the corresponding field is
  //    unset on the embedding settings.
  const providerPreset = inferEmbeddingProviderFromEndpoint(endpoint);

  // 3. modelName: explicit > preset > mode default.
  const explicitModelName = embedding.modelName?.trim();
  let modelName: string;
  if (explicitModelName) {
    modelName = explicitModelName;
  } else if (providerPreset) {
    modelName = providerPreset.defaultEmbeddingModel;
  } else if (mode === "ollama") {
    modelName = DEFAULT_OLLAMA_EMBED_MODEL;
  } else if (mode === "openai-compatible") {
    modelName = DEFAULT_OPENAI_EMBED_MODEL;
  } else {
    modelName = DEFAULT_MOCK_EMBED_MODEL;
  }

  const apiKey = embedding.apiKey?.trim() || input.modelProviders?.apiKey?.trim() || undefined;
  const modelKey = `${mode}:${modelName}@${endpoint}`;
  const maxInputTokens = resolveEmbeddingMaxInputTokens(embedding, modelName);

  // 4. responseShape: explicit > preset > auto.
  let responseShape: EmbeddingResponseShape;
  if (embedding.responseShape) {
    responseShape = embedding.responseShape;
  } else if (providerPreset) {
    responseShape = providerPreset.defaultResponseShape;
  } else {
    responseShape = "auto";
  }

  return { mode, modelName, endpoint, apiKey, modelKey, maxInputTokens, responseShape };
}

function resolveInheritedEmbeddingMode(
  modelMode: ModelProviderConfig["mode"] | undefined,
): EmbeddingProviderMode {
  switch (modelMode) {
    case "ollama":
    case "litellm":
      return "ollama";
    case "openai-compatible":
    case "anthropic-compatible":
      return "openai-compatible";
    default:
      return "mock";
  }
}

function normalizeOpenAiRoot(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/$/, "");
  // Already a versioned OpenAI-style root? Leave it alone — preserves
  // Zhipu's `/api/paas/v4`, DeepSeek's `/v1` (no change), and any other
  // provider that ships a non-`/v1` API version in the URL.
  if (/\/v\d+$/.test(trimmed)) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}