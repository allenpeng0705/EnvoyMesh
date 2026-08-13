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

/** Provider-documented input limits (tokens). Override via embedding.maxInputTokens in node-config. */
export const KNOWN_EMBEDDING_MAX_INPUT_TOKENS: Readonly<Record<string, number>> = {
  "embo-01": 4096,
  "text-embedding-3-small": 8191,
  "text-embedding-3-large": 8191,
  "nomic-embed-text": 8192,
  "qwen3-embedding-4b-q4_k_m": 8192,
  "Qwen3-Embedding-4B": 8192,
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
  // Leave a little headroom for special tokens / template wrappers.
  return Math.max(200, Math.floor(maxVaultChunkCharsForEmbeddingTokens(tokens) * 0.9));
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
 * CJK-heavy text is treated as ~1 token per character; mostly-ASCII as ~4 chars/token.
 */
export function estimateEmbeddingTokenCount(text: string): number {
  const chars = [...text].length;
  if (chars === 0) return 0;
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const hanRatio = han / chars;
  if (hanRatio >= 0.15) {
    return Math.ceil(chars * Math.min(1, 0.65 + hanRatio * 0.35));
  }
  return Math.ceil(chars / 4);
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
