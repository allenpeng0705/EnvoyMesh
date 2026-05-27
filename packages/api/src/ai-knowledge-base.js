/**
 * Owner knowledge base settings for AI chat assist and knowledge.query.
 * Layer 1: local vault files (vector + lexical RAG in SQLite/HNSW). Layer 2: external MCP adapters.
 */
import { maxVaultChunkCharsForEmbeddingTokens, resolveEmbeddingMaxInputTokens, } from "./ai-embedding-limits.js";
export const DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS = 800;
export const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS = 120;
export const DEFAULT_AI_KNOWLEDGE_BASE = {
    enabled: true,
    ragMode: "vector",
    recentMessageLimit: 20,
    ragMessageLimit: 5,
    vaultSnippetLimit: 5,
    publicVaultPaths: ["knowledge/public/"],
    privateVaultPaths: ["knowledge/private/"],
    externalProvider: "none",
    maxFileBytes: DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES,
    chunkSizeChars: DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS,
    chunkOverlapChars: DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS,
    purgeChatRagOnDelete: false,
};
export function resolveAiKnowledgeBaseSettings(input) {
    const ragMode = input?.ragMode ?? DEFAULT_AI_KNOWLEDGE_BASE.ragMode;
    const validRagMode = ragMode === "lexical" || ragMode === "hybrid" || ragMode === "vector" ? ragMode : "vector";
    const legacyPublic = (input?.vaultPaths ?? []).map((p) => p.trim()).filter(Boolean);
    const publicVaultPaths = (input?.publicVaultPaths ?? (legacyPublic.length > 0 ? legacyPublic : undefined) ??
        DEFAULT_AI_KNOWLEDGE_BASE.publicVaultPaths)
        .map((p) => p.trim())
        .filter(Boolean);
    const privateVaultPaths = (input?.privateVaultPaths ?? DEFAULT_AI_KNOWLEDGE_BASE.privateVaultPaths)
        .map((p) => p.trim())
        .filter(Boolean);
    return {
        enabled: input?.enabled ?? DEFAULT_AI_KNOWLEDGE_BASE.enabled,
        ragMode: validRagMode,
        recentMessageLimit: clampInt(input?.recentMessageLimit, 1, 50, DEFAULT_AI_KNOWLEDGE_BASE.recentMessageLimit),
        ragMessageLimit: clampInt(input?.ragMessageLimit, 0, 20, DEFAULT_AI_KNOWLEDGE_BASE.ragMessageLimit),
        vaultSnippetLimit: clampInt(input?.vaultSnippetLimit, 0, 20, DEFAULT_AI_KNOWLEDGE_BASE.vaultSnippetLimit),
        publicVaultPaths,
        privateVaultPaths,
        externalProvider: input?.externalProvider ?? DEFAULT_AI_KNOWLEDGE_BASE.externalProvider,
        maxFileBytes: clampInt(input?.maxFileBytes, 1024, 512 * 1024 * 1024, DEFAULT_AI_KNOWLEDGE_BASE.maxFileBytes),
        chunkSizeChars: clampInt(input?.chunkSizeChars, 200, 4000, DEFAULT_AI_KNOWLEDGE_BASE.chunkSizeChars),
        chunkOverlapChars: clampInt(input?.chunkOverlapChars, 0, 1000, DEFAULT_AI_KNOWLEDGE_BASE.chunkOverlapChars),
        purgeChatRagOnDelete: input?.purgeChatRagOnDelete ?? DEFAULT_AI_KNOWLEDGE_BASE.purgeChatRagOnDelete,
        externalMcpServer: input?.externalMcpServer?.trim() || undefined,
        mcpServerUrl: input?.mcpServerUrl?.trim() || undefined,
        mcpSearchTool: input?.mcpSearchTool?.trim() || undefined,
        mcpApiKey: input?.mcpApiKey?.trim() || undefined,
        embedding: input?.embedding,
    };
}
/** Resolve vault path prefixes for a given retrieval scope. */
export function resolveKnowledgeBaseVaultPaths(kb, scope) {
    if (scope === "public") {
        return kb.publicVaultPaths;
    }
    return [...kb.publicVaultPaths, ...kb.privateVaultPaths];
}
export function buildVaultIndexOptionsFromKnowledgeBase(rootDir, knowledgeBase) {
    const kb = resolveAiKnowledgeBaseSettings(knowledgeBase);
    const maxInputTokens = resolveEmbeddingMaxInputTokens(kb.embedding);
    const tokenChunkCap = maxInputTokens != null ? maxVaultChunkCharsForEmbeddingTokens(maxInputTokens) : kb.chunkSizeChars;
    return {
        rootDir,
        maxChunkChars: Math.min(kb.chunkSizeChars, tokenChunkCap),
        chunkOverlapChars: kb.chunkOverlapChars,
        maxFileBytes: kb.maxFileBytes,
    };
}
function clampInt(value, min, max, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.floor(value)));
}
//# sourceMappingURL=ai-knowledge-base.js.map