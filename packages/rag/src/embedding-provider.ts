import type { AiEmbeddingSettings, ModelProviderConfig } from "@envoymesh/api";
import {
  resolveEmbeddingMaxInputTokens,
  truncateTextForEmbedding,
} from "@envoymesh/api";
import { createHash } from "node:crypto";

export type EmbeddingProviderMode = "mock" | "ollama" | "openai-compatible" | "inherit";

export interface ResolvedEmbeddingConfig {
  mode: EmbeddingProviderMode;
  modelName: string;
  endpoint: string;
  apiKey?: string;
  modelKey: string;
  maxInputTokens?: number;
}

export interface EmbeddingProvider {
  readonly modelKey: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface CreateEmbeddingProviderInput {
  embedding?: AiEmbeddingSettings | null;
  modelProviders?: ModelProviderConfig;
  fetchImplementation?: typeof fetch;
  mockDimensions?: number;
}

const DEFAULT_MOCK_DIMENSIONS = 384;
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text";
const DEFAULT_OPENAI_EMBED_MODEL = "text-embedding-3-small";

export function resolveEmbeddingConfig(input: CreateEmbeddingProviderInput): ResolvedEmbeddingConfig {
  const embedding = input.embedding ?? {};
  const inherit = embedding.mode === "inherit" || embedding.mode === undefined;
  const mode: EmbeddingProviderMode = inherit
    ? resolveInheritedEmbeddingMode(input.modelProviders?.mode)
    : (embedding.mode ?? "mock");

  const modelName =
    embedding.modelName?.trim() ||
    (mode === "ollama"
      ? DEFAULT_OLLAMA_EMBED_MODEL
      : mode === "openai-compatible"
        ? DEFAULT_OPENAI_EMBED_MODEL
        : "mock-embed");

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

  const apiKey = embedding.apiKey?.trim() || input.modelProviders?.apiKey?.trim() || undefined;
  const modelKey = `${mode}:${modelName}@${endpoint}`;
  const maxInputTokens = resolveEmbeddingMaxInputTokens(embedding, modelName);

  return { mode, modelName, endpoint, apiKey, modelKey, maxInputTokens };
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
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function createEmbeddingProvider(input: CreateEmbeddingProviderInput = {}): EmbeddingProvider {
  const config = resolveEmbeddingConfig(input);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const mockDimensions = input.mockDimensions ?? DEFAULT_MOCK_DIMENSIONS;

  const prepareTexts = (texts: string[]): string[] => {
    if (config.maxInputTokens == null) return texts;
    return texts.map((text) => truncateTextForEmbedding(text, config.maxInputTokens!));
  };

  if (config.mode === "mock") {
    return {
      modelKey: config.modelKey,
      async embed(text) {
        return mockEmbedding(prepareTexts([text])[0] ?? text, mockDimensions);
      },
      async embedBatch(texts) {
        return prepareTexts(texts).map((text) => mockEmbedding(text, mockDimensions));
      },
    };
  }

  if (config.mode === "ollama") {
    return {
      modelKey: config.modelKey,
      async embed(text) {
        const vectors = await embedOllama(config, prepareTexts([text]), fetchImplementation);
        return vectors[0] ?? [];
      },
      async embedBatch(texts) {
        return embedOllama(config, prepareTexts(texts), fetchImplementation);
      },
    };
  }

  return {
    modelKey: config.modelKey,
    async embed(text) {
      const vectors = await embedOpenAiCompatible(config, prepareTexts([text]), fetchImplementation);
      return vectors[0] ?? [];
    },
    async embedBatch(texts) {
      return embedOpenAiCompatible(config, prepareTexts(texts), fetchImplementation);
    },
  };
}

async function embedOllama(
  config: ResolvedEmbeddingConfig,
  texts: string[],
  fetchImplementation: typeof fetch,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    const response = await fetchImplementation(`${config.endpoint.replace(/\/$/, "")}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.modelName, prompt: text }),
    });
    if (!response.ok) {
      throw new Error(`ollama embeddings failed (${response.status})`);
    }
    const payload = (await response.json()) as { embedding?: number[] };
    if (!Array.isArray(payload.embedding)) {
      throw new Error("ollama embeddings response missing embedding vector");
    }
    vectors.push(payload.embedding);
  }
  return vectors;
}

async function embedOpenAiCompatible(
  config: ResolvedEmbeddingConfig,
  texts: string[],
  fetchImplementation: typeof fetch,
): Promise<number[][]> {
  const response = await fetchImplementation(`${config.endpoint.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.modelName,
      input: texts.length === 1 ? texts[0] : texts,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`embeddings failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = payload.data ?? [];
  if (texts.length === 1) {
    const vector = rows[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new Error("embeddings response missing vector");
    }
    return [vector];
  }
  const ordered = new Array<number[]>(texts.length);
  for (const row of rows) {
    if (typeof row.index !== "number" || !Array.isArray(row.embedding)) {
      continue;
    }
    ordered[row.index] = row.embedding;
  }
  if (ordered.some((row) => !row)) {
    throw new Error("embeddings batch response incomplete");
  }
  return ordered;
}

/** Deterministic pseudo-embedding for tests and mock mode. */
export function mockEmbedding(text: string, dimensions = DEFAULT_MOCK_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let i = 0; i < dimensions; i++) {
      const byte = digest[i % digest.length] ?? 0;
      vector[i] = (vector[i] ?? 0) + (byte / 255 - 0.5);
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}
