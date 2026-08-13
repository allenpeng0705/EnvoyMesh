export interface EmbeddingLimitSettings {
    maxInputTokens?: number;
    modelName?: string;
}
/**
 * llama-server `--ctx-size` for the Envoy Local **embed** sidecar.
 * Keep in sync with `apps/node` envoy-local-embed-runtime.
 */
export declare const ENVOY_LOCAL_EMBED_CTX_SIZE: 2048;
/** Provider-documented input limits (tokens). Override via embedding.maxInputTokens in node-config. */
export declare const KNOWN_EMBEDDING_MAX_INPUT_TOKENS: Readonly<Record<string, number>>;
export declare function isEnvoyLocalEmbeddingMode(mode?: string | null): boolean;
export declare function resolveEffectiveEmbeddingMaxInputTokens(embedding?: (EmbeddingLimitSettings & {
    mode?: string | null;
}) | null, resolvedModelName?: string): number | undefined;
export declare function recommendedVaultChunkCharsForEmbedding(embedding?: (EmbeddingLimitSettings & {
    mode?: string | null;
}) | null, resolvedModelName?: string): number | undefined;
export declare function resolveEmbeddingMaxInputTokens(embedding?: EmbeddingLimitSettings | null, resolvedModelName?: string): number | undefined;
/**
 * Conservative token estimate for embedding payload limits.
 * CJK-heavy text is treated as ~1 token per character; mostly-ASCII as ~4 chars/token.
 */
export declare function estimateEmbeddingTokenCount(text: string): number;
export declare function truncateTextForEmbedding(text: string, maxInputTokens: number): string;
/** Max vault chunk size (chars) that fits maxInputTokens under worst-case CJK tokenization. */
export declare function maxVaultChunkCharsForEmbeddingTokens(maxInputTokens: number): number;
//# sourceMappingURL=ai-embedding-limits.d.ts.map
