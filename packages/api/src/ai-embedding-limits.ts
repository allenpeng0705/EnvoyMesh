export interface EmbeddingLimitSettings {
  maxInputTokens?: number;
  modelName?: string;
}

/**
 * llama-server `--ctx-size` for the Envoy Local **embed** sidecar
 * (`apps/node` envoy-local-embed-runtime). Keep in sync with runtime startup.
 * Qwen3-Embedding supports larger windows, but the sidecar stays lean on CPU.
 */
export const ENVOY_LOCAL_EMBED_CTX_SIZE = 2048;

/**
 * Soft fraction of {@link ENVOY_LOCAL_EMBED_CTX_SIZE} used as the client-side
 * truncate budget before calling llama-server. Must stay well below 1.0 because
 * our char→token estimate is approximate and Qwen BPE often counts higher than
 * the soft model (especially Markdown / code / mixed scripts).
 */
export const ENVOY_LOCAL_EMBED_SOFT_TOKEN_RATIO = 0.5;

/** Provider-documented input limits (tokens). Override via embedding.maxInputTokens in node-config. */
export const KNOWN_EMBEDDING_MAX_INPUT_TOKENS: Readonly<Record<string, number>> = {
  "embo-01": 4096,
  "text-embedding-3-small": 8191,
  "text-embedding-3-large": 8191,
  "nomic-embed-text": 8192,
  "qwen3-embedding-4b-q4_k_m": 8192,
  "Qwen3-Embedding-4B": 8192,
  "qwen3-embedding-0.6b-q8_0": 8192,
  "qwen3-embedding-0.6b-q4_k_m": 8192,
};

export function isEnvoyLocalEmbeddingMode(mode?: string | null): boolean {
  return mode == null || mode === "envoy-local" || mode === "inherit";
}

/**
 * Effective per-call embed token budget. For Envoy Local this is always capped
 * at {@link ENVOY_LOCAL_EMBED_CTX_SIZE} (sidecar `--ctx-size`), even when the
 * model card advertises 8k+.
 */
export function resolveEffectiveEmbeddingMaxInputTokens(
  embedding?: (EmbeddingLimitSettings & { mode?: string | null }) | null,
  resolvedModelName?: string,
): number | undefined {
  const tokens = resolveEmbeddingMaxInputTokens(embedding, resolvedModelName);
  if (isEnvoyLocalEmbeddingMode(embedding?.mode)) {
    return Math.min(tokens ?? ENVOY_LOCAL_EMBED_CTX_SIZE, ENVOY_LOCAL_EMBED_CTX_SIZE);
  }
  return tokens;
}

/**
 * Soft max vault chunk size that fits the effective embed token budget.
 * Used to auto-cap Knowledge `chunkSizeChars` for Envoy Local.
 */
export function recommendedVaultChunkCharsForEmbedding(
  embedding?: (EmbeddingLimitSettings & { mode?: string | null }) | null,
  resolvedModelName?: string,
): number | undefined {
  const tokens = resolveEffectiveEmbeddingMaxInputTokens(embedding, resolvedModelName);
  if (tokens == null) return undefined;
  const budget = isEnvoyLocalEmbeddingMode(embedding?.mode)
    ? Math.max(200, Math.floor(tokens * ENVOY_LOCAL_EMBED_SOFT_TOKEN_RATIO))
    : tokens;
  // Leave a little headroom for special tokens / template wrappers.
  return Math.max(200, Math.floor(maxVaultChunkCharsForEmbeddingTokens(budget) * 0.9));
}

export function resolveEmbeddingMaxInputTokens(
  embedding?: EmbeddingLimitSettings | null,
  resolvedModelName?: string,
): number | undefined {
  if (typeof embedding?.maxInputTokens === "number" && embedding.maxInputTokens > 0) {
    return Math.floor(embedding.maxInputTokens);
  }
  const model = (embedding?.modelName?.trim() || resolvedModelName?.trim() || "").toLowerCase();
  if (!model) return undefined;
  if (KNOWN_EMBEDDING_MAX_INPUT_TOKENS[model] != null) {
    return KNOWN_EMBEDDING_MAX_INPUT_TOKENS[model];
  }
  if (model.includes("embo")) return 4096;
  if (model.includes("text-embedding-3")) return 8191;
  if (model.includes("nomic-embed")) return 8192;
  if (model.includes("qwen3-embedding") || model.includes("qwen3_embedding")) return 8192;
  return undefined;
}

/**
 * Conservative token estimate for embedding payload limits.
 *
 * Tuned against llama.cpp / Qwen BPE failures where soft estimates under-counted
 * English Markdown (~2–3 chars/token) and mixed CJK/ASCII notes. Prefer
 * over-estimating — truncate early rather than trip exceed_context_size_error.
 */
export function estimateEmbeddingTokenCount(text: string): number {
  const chars = [...text].length;
  if (chars === 0) return 0;
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const hanRatio = han / chars;
  if (hanRatio >= 0.15) {
    // CJK-heavy: treat as nearly 1 token/char (slightly under for pure Han runs).
    return Math.ceil(chars * Math.min(1, 0.75 + hanRatio * 0.25));
  }
  // Latin / code / Markdown: ~2 chars/token (was /4 — chronically too optimistic).
  return Math.ceil(chars / 2);
}

export function truncateTextForEmbedding(text: string, maxInputTokens: number): string {
  if (maxInputTokens <= 0 || estimateEmbeddingTokenCount(text) <= maxInputTokens) {
    return text;
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateEmbeddingTokenCount(text.slice(0, mid)) <= maxInputTokens) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo).trimEnd();
}

/** Max vault chunk size (chars) that fits maxInputTokens under worst-case CJK tokenization. */
export function maxVaultChunkCharsForEmbeddingTokens(maxInputTokens: number): number {
  if (maxInputTokens <= 0) return 200;
  let lo = 200;
  let hi = Math.max(200, maxInputTokens * 2);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const sample = "文".repeat(mid);
    if (estimateEmbeddingTokenCount(sample) <= maxInputTokens) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Detect llama.cpp / OpenAI-style context overflow from embed error text. */
export function isEmbeddingContextOverflowError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("exceed_context_size") ||
    m.includes("exceeds the available context size") ||
    m.includes("n_ctx") && m.includes("n_prompt_tokens") ||
    (m.includes("context size") && m.includes("token"))
  );
}

/**
 * Parse `n_prompt_tokens` / `n_ctx` from a llama.cpp exceed_context_size body when present.
 */
export function parseEmbeddingContextOverflowSizes(message: string): {
  promptTokens?: number;
  ctxTokens?: number;
} {
  const prompt = message.match(/n_prompt_tokens["\s:]+(\d+)/i);
  const ctx = message.match(/n_ctx["\s:]+(\d+)/i);
  const promptAlt = message.match(/\((\d+)\s*tokens?\)\s*exceeds/i);
  return {
    promptTokens: prompt
      ? Number(prompt[1])
      : promptAlt
        ? Number(promptAlt[1])
        : undefined,
    ctxTokens: ctx ? Number(ctx[1]) : undefined,
  };
}
