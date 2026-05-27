/**
 * Owner knowledge base settings for AI chat assist and knowledge.query.
 * Layer 1: local vault files (vector + lexical RAG in SQLite/HNSW). Layer 2: external MCP adapters.
 */
export type KnowledgeBaseExternalProvider = "none" | "mcp";
export type AiRagMode = "vector" | "lexical" | "hybrid";
/** Which vault KB partitions to search. */
export type AiKnowledgeBaseScope = "public" | "owner";
export interface AiEmbeddingSettings {
    /** mock | ollama | openai-compatible | inherit (from modelProviders). Default: inherit */
    mode?: "mock" | "ollama" | "openai-compatible" | "inherit";
    /** Embedding model name (e.g. nomic-embed-text, text-embedding-3-small). */
    modelName?: string;
    /** API root. OpenAI-compatible uses `/v1/embeddings`; Ollama uses `/api/embeddings`. */
    endpoint?: string;
    apiKey?: string;
    /** Max tokens per embed API call (e.g. MiniMax embo-01 = 4096). Caps vault chunk size and truncates at embed time. */
    maxInputTokens?: number;
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
    /** Reserved: plug in external KB via MCP or similar. Default: none */
    externalProvider?: KnowledgeBaseExternalProvider;
    /** MCP server id when externalProvider is "mcp" (future). */
    externalMcpServer?: string;
    /** MCP HTTP endpoint for tools/call (e.g. memex bridge). */
    mcpServerUrl?: string;
    /** MCP tool name used for knowledge search. Default: memex_search */
    mcpSearchTool?: string;
    /** Optional bearer token for MCP HTTP bridge. */
    mcpApiKey?: string;
    /** Max vault file size indexed for RAG (bytes). Default: 25 MiB. */
    maxFileBytes?: number;
    /** Target chunk size for vault RAG (characters). Default: 800. */
    chunkSizeChars?: number;
    /** Overlap between consecutive chunks (characters). Default: 120. */
    chunkOverlapChars?: number;
    /**
     * When deleting or clearing chat history, also remove matching chat vectors from RAG.
     * Default: false — deleted messages stay in the vector index for AI context (hidden from chat UI only).
     */
    purgeChatRagOnDelete?: boolean;
}
export declare const DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES: number;
export declare const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS = 800;
export declare const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS = 120;
export declare const DEFAULT_AI_KNOWLEDGE_BASE: Required<Pick<AiKnowledgeBaseSettings, "enabled" | "recentMessageLimit" | "ragMessageLimit" | "vaultSnippetLimit" | "externalProvider" | "ragMode" | "maxFileBytes" | "chunkSizeChars" | "chunkOverlapChars" | "purgeChatRagOnDelete">> & {
    publicVaultPaths: string[];
    privateVaultPaths: string[];
    externalMcpServer?: string;
    embedding?: AiEmbeddingSettings;
};
export declare function resolveAiKnowledgeBaseSettings(input?: AiKnowledgeBaseSettings | null): Required<Pick<AiKnowledgeBaseSettings, "enabled" | "recentMessageLimit" | "ragMessageLimit" | "vaultSnippetLimit" | "externalProvider" | "ragMode" | "maxFileBytes" | "chunkSizeChars" | "chunkOverlapChars" | "purgeChatRagOnDelete">> & {
    publicVaultPaths: string[];
    privateVaultPaths: string[];
    externalMcpServer?: string;
    mcpServerUrl?: string;
    mcpSearchTool?: string;
    mcpApiKey?: string;
    embedding?: AiEmbeddingSettings;
};
/** Resolve vault path prefixes for a given retrieval scope. */
export declare function resolveKnowledgeBaseVaultPaths(kb: ReturnType<typeof resolveAiKnowledgeBaseSettings>, scope: AiKnowledgeBaseScope): string[];
export declare function buildVaultIndexOptionsFromKnowledgeBase(rootDir: string, knowledgeBase?: AiKnowledgeBaseSettings | null): {
    rootDir: string;
    maxChunkChars: number;
    chunkOverlapChars: number;
    maxFileBytes: number;
};
//# sourceMappingURL=ai-knowledge-base.d.ts.map