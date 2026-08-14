/**
 * Browser-safe embedding resolver — pure logic, no Node-only imports.
 *
 * Embeddings are independent of chat `modelProviders`. Changing the chat
 * model must not retarget the embedder. Legacy `inherit` is mapped once by
 * `migrateEmbeddingSettings` (node config load) and treated as `envoy-local`
 * here if still present.
 *
 * Split from `embedding-provider.ts` so Social can show effective hints
 * without dragging Node builtins into the browser bundle.
 */
import type {
  AiEmbeddingSettings,
  EmbeddingResponseShape,
  ModelProviderConfig,
} from "@envoymesh/api";
import {
  DEFAULT_AI_EMBEDDING,
  DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
  defaultEnvoyLocalEmbedEndpoint,
  envoyLocalChatPort,
  envoyLocalEmbedPort,
  ENVOY_LOCAL_CHAT_PORT_BASE,
  ENVOY_LOCAL_EMBED_PORT_BASE,
  parseLoopbackServicePort,
  resolveEffectiveEmbeddingMaxInputTokens,
} from "@envoymesh/api";

export type EmbeddingProviderMode =
  | "mock"
  | "ollama"
  | "openai-compatible"
  | "envoy-local"
  | "inherit";

export interface ResolvedEmbeddingConfig {
  mode: EmbeddingProviderMode;
  modelName: string;
  endpoint: string;
  apiKey?: string;
  modelKey: string;
  maxInputTokens?: number;
  /** How to parse the upstream embeddings response. Meaningful for openai-compatible / envoy-local. */
  responseShape: EmbeddingResponseShape;
}

export interface ResolveEmbeddingConfigInput {
  embedding?: AiEmbeddingSettings | null;
  /**
   * @deprecated Unused for resolution. Kept so older call sites compile;
   * migration may still read chat providers separately.
   */
  modelProviders?: ModelProviderConfig | null;
  /** Live embed sidecar endpoint/model when mode is envoy-local. */
  envoyLocalEmbed?: {
    endpoint?: string;
    modelName?: string;
    running?: boolean;
  } | null;
}

const DEFAULT_MOCK_EMBED_MODEL = "mock-embed";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text";
const DEFAULT_OPENAI_EMBED_MODEL = "text-embedding-3-small";

/**
 * Default embedding model + response shape for a known upstream host.
 * Used when the user picks a cloud OpenAI-compatible endpoint — not from chat.
 */
export interface EmbeddingProviderPreset {
  defaultEmbeddingModel: string;
  defaultResponseShape: EmbeddingResponseShape;
}

export interface EmbeddingProviderRule {
  hostname: RegExp;
  preset: EmbeddingProviderPreset;
}

export const KNOWN_EMBEDDING_PROVIDERS: ReadonlyArray<EmbeddingProviderRule> = [
  {
    hostname: /^api\.minimaxi\.com$/i,
    preset: {
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
  {
    hostname: /^open\.bigmodel\.cn$/i,
    preset: {
      defaultEmbeddingModel: "embedding-2",
      defaultResponseShape: "openai",
    },
  },
  {
    hostname: /^dashscope\.aliyuncs\.com$/i,
    preset: {
      defaultEmbeddingModel: "text-embedding-v3",
      defaultResponseShape: "openai",
    },
  },
];

export function inferEmbeddingProviderFromEndpoint(
  endpoint: string,
): EmbeddingProviderPreset | undefined {
  if (!endpoint) return undefined;
  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    const stripped = endpoint.replace(/^[a-z]+:\/\//i, "");
    host = stripped.split("/")[0]?.split(":")[0] ?? "";
  }
  if (!host) return undefined;
  const rule = KNOWN_EMBEDDING_PROVIDERS.find((r) => r.hostname.test(host));
  return rule?.preset;
}

/**
 * True when the chat endpoint is Envoy Local llama-server (chat GGUF only).
 * Kept for UI banners / migration helpers — embeddings no longer inherit this.
 */
export function isEnvoyLocalChatEndpoint(
  endpoint: string | undefined,
  modelProviders?: ModelProviderConfig | null,
): boolean {
  if (modelProviders?.presetId === "envoy-local") return true;
  const port = parseLoopbackServicePort(endpoint);
  if (port == null) return false;
  return port === envoyLocalChatPort() || port === ENVOY_LOCAL_CHAT_PORT_BASE;
}

export function isEnvoyLocalEmbedEndpoint(endpoint: string | undefined): boolean {
  const port = parseLoopbackServicePort(endpoint);
  if (port == null) return false;
  return port === envoyLocalEmbedPort() || port === ENVOY_LOCAL_EMBED_PORT_BASE;
}

export function resolveEmbeddingConfig(input: ResolveEmbeddingConfigInput): ResolvedEmbeddingConfig {
  const embedding = input.embedding ?? {};
  let mode: EmbeddingProviderMode =
    embedding.mode === undefined || (embedding.mode as string) === "inherit"
      ? "envoy-local"
      : embedding.mode;

  // Legacy inherit string without migration → Envoy Local embed (product default).
  if ((mode as string) === "inherit") mode = "envoy-local";

  let endpoint = embedding.endpoint?.trim() ?? "";
  if (!endpoint) {
    if (mode === "ollama") {
      endpoint = DEFAULT_OLLAMA_ENDPOINT;
    } else if (mode === "openai-compatible") {
      endpoint = normalizeOpenAiRoot("https://api.openai.com/v1");
    } else if (mode === "envoy-local") {
      endpoint =
        input.envoyLocalEmbed?.endpoint?.trim() ||
        defaultEnvoyLocalEmbedEndpoint();
    } else {
      endpoint = "mock://local";
    }
  } else if (mode === "openai-compatible" || mode === "envoy-local") {
    endpoint = normalizeOpenAiRoot(endpoint);
  } else if (mode === "ollama") {
    endpoint = endpoint.replace(/\/v1\/?$/, "");
  }

  if (mode === "envoy-local") {
    const live = input.envoyLocalEmbed?.endpoint?.trim();
    if (live) endpoint = normalizeOpenAiRoot(live);
  }

  // Misconfigured "openai-compatible" pointing at the embed sidecar still has
  // only ENVOY_LOCAL_EMBED_CTX_SIZE — force local mode so budgets/batching match.
  if (mode === "openai-compatible" && isEnvoyLocalEmbedEndpoint(endpoint)) {
    mode = "envoy-local";
  }

  const providerPreset = inferEmbeddingProviderFromEndpoint(endpoint);

  const explicitModelName = embedding.modelName?.trim();
  let modelName: string;
  if (explicitModelName) {
    modelName = explicitModelName;
  } else if (mode === "envoy-local") {
    modelName =
      input.envoyLocalEmbed?.modelName?.trim() ||
      DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID;
  } else if (providerPreset) {
    modelName = providerPreset.defaultEmbeddingModel;
  } else if (mode === "ollama") {
    modelName = DEFAULT_OLLAMA_EMBED_MODEL;
  } else if (mode === "openai-compatible") {
    modelName = DEFAULT_OPENAI_EMBED_MODEL;
  } else {
    modelName = DEFAULT_MOCK_EMBED_MODEL;
  }

  const apiKey = embedding.apiKey?.trim() || undefined;
  const modelKey = `${mode}:${modelName}@${endpoint}`;
  let maxInputTokens = resolveEffectiveEmbeddingMaxInputTokens(
    { ...embedding, mode },
    modelName,
  );
  // llama.cpp token counts can exceed our soft estimate — keep headroom so
  // a "2048-token" payload does not still trip exceed_context_size_error.
  if (mode === "envoy-local" && maxInputTokens != null) {
    maxInputTokens = Math.max(256, Math.floor(maxInputTokens * 0.8));
  }

  let responseShape: EmbeddingResponseShape;
  if (embedding.responseShape) {
    responseShape = embedding.responseShape;
  } else if (mode === "envoy-local") {
    responseShape = DEFAULT_AI_EMBEDDING.responseShape ?? "openai";
  } else if (providerPreset) {
    responseShape = providerPreset.defaultResponseShape;
  } else {
    responseShape = "auto";
  }

  return { mode, modelName, endpoint, apiKey, modelKey, maxInputTokens, responseShape };
}

/**
 * One-time materialization of legacy `inherit` (or missing mode) into an
 * explicit embedding block. Preserves custom cloud/Ollama fields that were
 * stored under inherit; otherwise defaults to Envoy Local embed.
 */
export function migrateEmbeddingSettings(
  embedding: AiEmbeddingSettings | null | undefined,
  _modelProviders?: ModelProviderConfig | null,
): AiEmbeddingSettings {
  const mode = embedding?.mode;
  if (mode && mode !== "inherit") {
    if (mode === "envoy-local") {
      return {
        ...DEFAULT_AI_EMBEDDING,
        ...embedding,
        mode: "envoy-local",
        maxInputTokens: DEFAULT_AI_EMBEDDING.maxInputTokens,
        endpoint: embedding.endpoint?.trim() || defaultEnvoyLocalEmbedEndpoint(),
        modelName: embedding.modelName?.trim() || DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
      };
    }
    return {
      ...embedding,
      mode,
      presetId: embedding?.presetId,
    };
  }

  const endpoint = embedding?.endpoint?.trim();
  const modelName = embedding?.modelName?.trim();
  const apiKey = embedding?.apiKey?.trim();
  const responseShape = embedding?.responseShape;

  // inherit/missing with no custom targeting → product default.
  if (!endpoint && !modelName && !apiKey) {
    return {
      ...DEFAULT_AI_EMBEDDING,
      endpoint: defaultEnvoyLocalEmbedEndpoint(),
      maxInputTokens: DEFAULT_AI_EMBEDDING.maxInputTokens,
    };
  }

  // Local Envoy endpoints under inherit → dedicated embed sidecar.
  if (
    endpoint &&
    (isEnvoyLocalEmbedEndpoint(endpoint) || isEnvoyLocalChatEndpoint(endpoint))
  ) {
    return {
      ...DEFAULT_AI_EMBEDDING,
      endpoint: defaultEnvoyLocalEmbedEndpoint(),
      maxInputTokens: DEFAULT_AI_EMBEDDING.maxInputTokens,
    };
  }

  // Ollama-shaped endpoint.
  if (endpoint && (/11434/i.test(endpoint) || /ollama/i.test(endpoint))) {
    return {
      mode: "ollama",
      presetId: "ollama",
      endpoint: endpoint.replace(/\/v1\/?$/, ""),
      modelName: modelName || DEFAULT_OLLAMA_EMBED_MODEL,
      ...(apiKey ? { apiKey } : {}),
      ...(typeof maxInputTokens === "number" ? { maxInputTokens } : {}),
      ...(responseShape ? { responseShape } : {}),
    };
  }

  // Custom / cloud OpenAI-compatible fields under inherit — keep them.
  const normalized = normalizeOpenAiRoot(endpoint || "https://api.openai.com/v1");
  const hostPreset = inferEmbeddingProviderFromEndpoint(normalized);
  return {
    mode: "openai-compatible",
    presetId: "custom",
    endpoint: normalized,
    modelName:
      modelName ||
      hostPreset?.defaultEmbeddingModel ||
      DEFAULT_OPENAI_EMBED_MODEL,
    ...(apiKey ? { apiKey } : {}),
    ...(typeof maxInputTokens === "number" ? { maxInputTokens } : {}),
    responseShape:
      responseShape || hostPreset?.defaultResponseShape || "auto",
  };
}

function normalizeOpenAiRoot(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/$/, "");
  if (/\/v\d+$/.test(trimmed)) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}
