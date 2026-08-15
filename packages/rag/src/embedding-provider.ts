import type {
  AiEmbeddingSettings,
  EmbeddingResponseShape,
  ModelProviderConfig,
} from "@envoymesh/api";
import { truncateTextForEmbedding } from "@envoymesh/api";
import { createHash } from "node:crypto";
import {
  KNOWN_EMBEDDING_PROVIDERS,
  inferEmbeddingProviderFromEndpoint,
  isEnvoyLocalChatEndpoint,
  isEnvoyLocalEmbedEndpoint,
  resolveEmbeddingConfig as resolveEmbeddingConfigCore,
  type EmbeddingProviderMode,
  type EmbeddingProviderPreset,
  type EmbeddingProviderRule,
  type ResolvedEmbeddingConfig,
  type ResolveEmbeddingConfigInput,
} from "./embedding-resolver.js";

export type { EmbeddingProviderMode, EmbeddingResponseShape };
export type { EmbeddingProviderPreset, EmbeddingProviderRule };
export {
  KNOWN_EMBEDDING_PROVIDERS,
  inferEmbeddingProviderFromEndpoint,
  isEnvoyLocalChatEndpoint,
  isEnvoyLocalEmbedEndpoint,
};

// Re-export so existing `ResolvedEmbeddingConfig` consumers continue to work.
export type { ResolvedEmbeddingConfig } from "./embedding-resolver.js";

export interface EmbeddingProvider {
  readonly modelKey: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface CreateEmbeddingProviderInput extends ResolveEmbeddingConfigInput {
  fetchImplementation?: typeof fetch;
  mockDimensions?: number;
  /**
   * Envoy Local only: after a timed-out /embeddings call, await this (e.g. restart
   * the sidecar) before a single retry. Without it, we still retry once after a short pause.
   */
  onEnvoyLocalEmbedTimeout?: () => void | Promise<void>;
}

const DEFAULT_MOCK_DIMENSIONS = 384;

/** Thin re-export so node-side callers keep their existing call signature. */
export function resolveEmbeddingConfig(input: CreateEmbeddingProviderInput): ResolvedEmbeddingConfig {
  return resolveEmbeddingConfigCore(input);
}

export function createEmbeddingProvider(input: CreateEmbeddingProviderInput = {}): EmbeddingProvider {
  const config = resolveEmbeddingConfig(input);
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const mockDimensions = input.mockDimensions ?? DEFAULT_MOCK_DIMENSIONS;
  const onEnvoyLocalEmbedTimeout = input.onEnvoyLocalEmbedTimeout;

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

  // Envoy Local llama-server counts *all* batch inputs against one n_ctx.
  // Also treat openai-compatible → :18791 as sequential — mis-set mode still
  // hits the same sidecar and must not batch past ctx.
  const sequentialOpenAi =
    config.mode === "envoy-local" || isEnvoyLocalEmbedEndpoint(config.endpoint);

  if (sequentialOpenAi) {
    return {
      modelKey: config.modelKey,
      async embed(text) {
        const vectors = await embedOpenAiCompatible(
          config,
          prepareTexts([text]),
          fetchImplementation,
          onEnvoyLocalEmbedTimeout,
        );
        return vectors[0] ?? [];
      },
      async embedBatch(texts) {
        const prepared = prepareTexts(texts);
        const vectors: number[][] = [];
        for (const text of prepared) {
          const batch = await embedOpenAiCompatible(
            config,
            [text],
            fetchImplementation,
            onEnvoyLocalEmbedTimeout,
          );
          vectors.push(batch[0] ?? []);
        }
        return vectors;
      },
    };
  }

  return {
    modelKey: config.modelKey,
    async embed(text) {
      const vectors = await embedOpenAiCompatible(
        config,
        prepareTexts([text]),
        fetchImplementation,
        onEnvoyLocalEmbedTimeout,
      );
      return vectors[0] ?? [];
    },
    async embedBatch(texts) {
      return embedOpenAiCompatible(
        config,
        prepareTexts(texts),
        fetchImplementation,
        onEnvoyLocalEmbedTimeout,
      );
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

/** Local llama-server can wedge with /models still OK; fail fast for UI.
 *  Large vault rebuilds embed many chunks on CPU — allow 3 minutes per call. */
const ENVOY_LOCAL_EMBED_FETCH_TIMEOUT_MS = 180_000;

function isEmbedTimeoutError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  return name === "TimeoutError" || name === "AbortError" || /aborted|timeout/i.test(msg);
}

async function embedOpenAiCompatible(
  config: ResolvedEmbeddingConfig,
  texts: string[],
  fetchImplementation: typeof fetch,
  onEnvoyLocalEmbedTimeout?: () => void | Promise<void>,
): Promise<number[][]> {
  const localEmbed = isEnvoyLocalEmbedEndpoint(config.endpoint);
  const url = `${config.endpoint.replace(/\/$/, "")}/embeddings`;

  const attempt = async (): Promise<Response> => {
    try {
      return await fetchImplementation(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.modelName,
          input: texts.length === 1 ? texts[0] : texts,
        }),
        ...(localEmbed
          ? { signal: AbortSignal.timeout(ENVOY_LOCAL_EMBED_FETCH_TIMEOUT_MS) }
          : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (localEmbed && isEmbedTimeoutError(err)) {
        throw new Error(
          `Envoy Local embed timed out after ${ENVOY_LOCAL_EMBED_FETCH_TIMEOUT_MS}ms ` +
            `(${config.endpoint}) — llama-server may be wedged; check Knowledge → Setup or restart embed`,
        );
      }
      if (localEmbed && /fetch failed/i.test(msg)) {
        throw new Error(
          `Envoy Local embed unreachable (${config.endpoint}): ${msg} — ` +
            `is the embed sidecar running on :18791?`,
        );
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  };

  let response: Response;
  try {
    response = await attempt();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!localEmbed || !/timed out|wedged/i.test(msg)) throw err;
    // One heal + retry: cold start / transient wedge should not fail the whole reindex.
    try {
      if (onEnvoyLocalEmbedTimeout) {
        await onEnvoyLocalEmbedTimeout();
      } else {
        await new Promise((r) => setTimeout(r, 1_500));
      }
    } catch {
      /* heal best-effort */
    }
    response = await attempt();
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`embeddings failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const payload = (await response.json()) as unknown;

  // `auto` mode: first call to this endpoint pays the try-both cost,
  // subsequent calls skip sniffing entirely by using the cached winner.
  const explicitShape = config.responseShape;
  if (explicitShape === "auto") {
    const cacheKey = parserCacheKey(config.endpoint);
    const cached = embeddingParserCache.get(cacheKey);
    if (cached) {
      return parseEmbeddingsResponse(payload, texts.length, cached);
    }
    // First time touching this endpoint — try the common shape first
    // (covers OpenAI / Zhipu / Qwen / MiniMax international / etc.), fall
    // back to legacy MiniMax flat envelope, cache whichever succeeds.
    // Only throws after both fail (with both error messages attached).
    try {
      const vectors = parseOpenAiEmbeddings(payload, texts.length);
      embeddingParserCache.set(cacheKey, "openai");
      // Surface the binding so operators can see which envelope won when
      // diagnosing embedding failures — silent cache hits are otherwise
      // invisible.
      console.info(`[rag] embeddings parser cached: openai for ${cacheKey}`);
      return vectors;
    } catch (openAiErr) {
      try {
        const vectors = parseMiniMaxEmbeddings(payload, texts.length);
        embeddingParserCache.set(cacheKey, "minimax");
        console.info(`[rag] embeddings parser cached: minimax for ${cacheKey}`);
        return vectors;
      } catch (minimaxErr) {
        const oaMsg = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);
        const mmMsg = minimaxErr instanceof Error ? minimaxErr.message : String(minimaxErr);
        throw new Error(
          `embeddings response unparseable for endpoint ${cacheKey} (auto-detect tried: openai, minimax) — openai: ${oaMsg}; minimax: ${mmMsg}`,
        );
      }
    }
  }

  return parseEmbeddingsResponse(payload, texts.length, explicitShape);
}

/**
 * Per-endpoint cache of the response-envelope shape that worked. Populated
 * on the first successful embed call in `auto` mode; subsequent calls read
 * it and skip the try-both fallback. Process-lifetime only — cold start
 * pays one extra parse per new endpoint, which is fine.
 *
 * The cache is keyed on the endpoint URL (trailing-slash stripped) so
 * multi-host setups work independently. Tests reset it via
 * `resetEmbeddingParserCache()`.
 */
const embeddingParserCache = new Map<string, EmbeddingResponseShape>();

function parserCacheKey(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "").toLowerCase();
}

/** Test helper — drop all cached parser bindings. */
export function resetEmbeddingParserCache(): void {
  embeddingParserCache.clear();
}

/** Test helper — read what a given endpoint has cached, if anything. */
export function getCachedEmbeddingParser(endpoint: string): EmbeddingResponseShape | undefined {
  return embeddingParserCache.get(parserCacheKey(endpoint));
}

/**
 * Parse an embeddings response payload according to the configured shape.
 *
 * The HTTP transport is identical across providers — only the response
 * envelope differs:
 *
 *   * OpenAI  : `{ data: [{ embedding: number[] }, ...] }`
 *               (also Zhipu, Qwen DashScope /compatible-mode, and any
 *               standard OpenAI-compatible host)
 *   * MiniMax : `{ embedding: number[] }` (single-input)
 *              `{ vectors: number[][] }` (batch)
 *
 * `auto` tries OpenAI first; if that fails it falls back to MiniMax. This
 * keeps the surface small while not forcing users to know the shape up
 * front.
 */
export function parseEmbeddingsResponse(
  payload: unknown,
  expectedCount: number,
  shape: EmbeddingResponseShape,
): number[][] {
  const candidates: EmbeddingResponseShape[] =
    shape === "auto" ? ["openai", "minimax"] : [shape];
  let lastError: string | undefined;
  for (const candidate of candidates) {
    try {
      if (candidate === "openai") {
        return parseOpenAiEmbeddings(payload, expectedCount);
      }
      return parseMiniMaxEmbeddings(payload, expectedCount);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (shape !== "auto") throw err;
    }
  }
  throw new Error(
    `embeddings response missing vector (auto-detect tried: ${candidates.join(
      ", ",
    )}): ${lastError ?? "unknown"}`,
  );
}

/** OpenAI shape: `{data: [{embedding, index?}]}` — for OpenAI, Zhipu, Qwen `/compatible-mode`. */
function parseOpenAiEmbeddings(payload: unknown, expectedCount: number): number[][] {
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) {
    throw new Error("openai: missing data[] array");
  }
  if (expectedCount === 1) {
    const vector = (rows[0] as { embedding?: unknown })?.embedding;
    if (!Array.isArray(vector) || !vector.every((v) => typeof v === "number")) {
      throw new Error("openai: rows[0].embedding missing vector");
    }
    return [vector as number[]];
  }
  if (rows.length !== expectedCount) {
    throw new Error(
      `openai: data[] length ${rows.length} != expected ${expectedCount}`,
    );
  }
  const ordered = new Array<number[] | undefined>(expectedCount);
  rows.forEach((row, fallbackIndex) => {
    const entry = row as { embedding?: unknown; index?: unknown };
    if (!Array.isArray(entry.embedding) || !entry.embedding.every((v) => typeof v === "number")) {
      return;
    }
    const slot = typeof entry.index === "number" ? entry.index : fallbackIndex;
    if (slot >= 0 && slot < expectedCount) {
      ordered[slot] = entry.embedding as number[];
    }
  });
  if (ordered.some((row) => !row)) {
    throw new Error("openai: batch response incomplete");
  }
  return ordered as number[][];
}

/**
 * MiniMax (embo-01) shape:
 *   single-input → `{ embedding: number[] }`
 *   batch input  → `{ vectors: number[][] }`
 * Falls back to OpenAI shape if MiniMax ever returns it (cheap defensive).
 */
function parseMiniMaxEmbeddings(payload: unknown, expectedCount: number): number[][] {
  const root = payload as { embedding?: unknown; vectors?: unknown };
  if (expectedCount === 1) {
    if (Array.isArray(root.embedding) && root.embedding.every((v) => typeof v === "number")) {
      return [root.embedding as number[]];
    }
    // Some MiniMax-compatible hosts wrap single-input under data[0] too.
    const fallbackRow = (root as { data?: Array<{ embedding?: unknown }> })?.data?.[0]?.embedding;
    if (Array.isArray(fallbackRow) && fallbackRow.every((v) => typeof v === "number")) {
      return [fallbackRow as number[]];
    }
    throw new Error("minimax: missing embedding at root");
  }
  if (
    Array.isArray(root.vectors) &&
    root.vectors.length === expectedCount &&
    root.vectors.every(
      (vec) => Array.isArray(vec) && vec.every((v) => typeof v === "number"),
    )
  ) {
    return root.vectors as number[][];
  }
  // Fall back to OpenAI batch shape if MiniMax ever returns it that way.
  const data = (root as { data?: Array<{ embedding?: unknown }> })?.data;
  if (
    Array.isArray(data) &&
    data.length === expectedCount &&
    data.every(
      (row) => Array.isArray(row.embedding) && row.embedding.every((v) => typeof v === "number"),
    )
  ) {
    return data.map((row) => row.embedding as number[]);
  }
  throw new Error(
    `minimax: missing vectors[] for batch of ${expectedCount} (or data[] fallback)`,
  );
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
