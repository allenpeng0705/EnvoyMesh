export interface EmbeddingLimitSettings {
    maxInputTokens?: number;
    modelName?: string;
}
/** Provider-documented input limits (tokens). Override via embedding.maxInputTokens in node-config. */
export declare const KNOWN_EMBEDDING_MAX_INPUT_TOKENS: Readonly<Record<string, number>>;
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