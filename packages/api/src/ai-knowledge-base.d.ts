/**
 * Owner knowledge base settings for AI chat assist and knowledge.query.
 * Layer 1: local vault files (vector + lexical RAG in SQLite/HNSW). Layer 2: external MCP adapters.
 */
export type KnowledgeBaseExternalProvider = "none" | "mcp";
export type AiRagMode = "vector" | "lexical" | "hybrid";
/** Which vault KB partitions to search. */
export type AiKnowledgeBaseScope = "public" | "owner";
export type EmbeddingResponseShape = "openai" | "minimax" | "auto";
export interface AiEmbeddingSettings {
    /**
     * Embedding provider. Independent of chat. Default: envoy-local.
     * Legacy `inherit` accepted only for migration.
     */
    mode?: "mock" | "ollama" | "openai-compatible" | "envoy-local" | "inherit";
    presetId?: string;
    /** Embedding model name (e.g. nomic-embed-text, text-embedding-3-small). */
    modelName?: string;
    /** API root. OpenAI-compatible uses `/v1/embeddings`; Ollama uses `/api/embeddings`. */
    endpoint?: string;
    apiKey?: string;
    /** Max tokens per embed API call (e.g. MiniMax embo-01 = 4096). Caps vault chunk size and truncates at embed time. */
    maxInputTokens?: number;
    responseShape?: EmbeddingResponseShape;
}
export interface AiKnowledgeBaseSettings {
    /** Retrieval strategy. Default: vector (falls back to lexical on embed errors). */
    ragMode?: AiRagMode;
    /** Embedding provider for vector RAG. */
    embedding?: AiEmbeddingSettings;
    /** When false, skip vault retrieval for chat drafts (rules may still add vaultQuery). Default: true */
    enabled?: boolean;
    /** Always include the N most recent thread messages. Default: 20 */
    recentMessageLimit?: number;
    /** Additional messages retrieved by query match from older history. Default: 5 */
    ragMessageLimit?: number;
    /** Max vault snippets injected per prompt. Default: 5 */
    vaultSnippetLimit?: number;
    /**
     * Public knowledge base paths (safe for auto-reply and contact-facing AI).
     * Default: `knowledge/public/`
     */
    publicVaultPaths?: string[];
    /**
     * Private knowledge base paths (owner-only: Envoy AI tab, local knowledge.query).
     * Default: `knowledge/private/`
     */
    privateVaultPaths?: string[];
    /**
     * @deprecated Use `publicVaultPaths`. Kept for backward-compatible configs.
     */
    vaultPaths?: string[];
    /**
     * Optional absolute paths to existing Obsidian vaults (read-only overlay).
     * Shown in Knowledge Browse — never moved or rewritten. Mesh publish stays Envoy vault only.
     */
    linkedObsidianVaultPaths?: string[];
    dismissedObsidianVaultPaths?: string[];
    externalProvider?: KnowledgeBaseExternalProvider;
    externalMcpServer?: string;
    mcpServerUrl?: string;
    mcpSearchTool?: string;
    mcpApiKey?: string;
    mcpTimeoutMs?: number;
    mcpWriteBackEnabled?: boolean;
    maxFileBytes?: number;
    chunkSizeChars?: number;
    chunkOverlapChars?: number;
    purgeChatRagOnDelete?: boolean;
}
export declare const DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES: number;
export declare const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS: number;
export declare const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS: number;
export declare const DEFAULT_AI_KNOWLEDGE_BASE: Required<Pick<AiKnowledgeBaseSettings, "enabled" | "recentMessageLimit" | "ragMessageLimit" | "vaultSnippetLimit" | "externalProvider" | "ragMode" | "maxFileBytes" | "chunkSizeChars" | "chunkOverlapChars" | "purgeChatRagOnDelete">> & {
    publicVaultPaths: string[];
    privateVaultPaths: string[];
    externalMcpServer?: string;
    embedding?: AiEmbeddingSettings;
};
export declare function resolveAiKnowledgeBaseSettings(input?: AiKnowledgeBaseSettings | null): Required<Pick<AiKnowledgeBaseSettings, "enabled" | "recentMessageLimit" | "ragMessageLimit" | "vaultSnippetLimit" | "externalProvider" | "ragMode" | "maxFileBytes" | "chunkSizeChars" | "chunkOverlapChars" | "purgeChatRagOnDelete">> & {
    publicVaultPaths: string[];
    privateVaultPaths: string[];
    linkedObsidianVaultPaths: string[];
    dismissedObsidianVaultPaths: string[];
    externalMcpServer?: string;
    mcpServerUrl?: string;
    mcpSearchTool?: string;
    mcpApiKey?: string;
    mcpTimeoutMs?: number;
    mcpWriteBackEnabled?: boolean;
    embedding?: AiEmbeddingSettings;
};
export declare function resolveKnowledgeBaseVaultPaths(kb: ReturnType<typeof resolveAiKnowledgeBaseSettings>, scope: AiKnowledgeBaseScope): string[];
export declare function buildVaultIndexOptionsFromKnowledgeBase(rootDir: string, knowledgeBase?: AiKnowledgeBaseSettings | null): {
    rootDir: string;
    maxChunkChars: number;
    chunkOverlapChars: number;
    maxFileBytes: number;
};
