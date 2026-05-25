/**
 * Owner knowledge base settings for AI chat assist and knowledge.query.
 * Layer 1: local vault files (vector + lexical RAG in SQLite/HNSW). Layer 2: external MCP adapters.
 */

import {
  maxVaultChunkCharsForEmbeddingTokens,
  resolveEmbeddingMaxInputTokens,
} from "./ai-embedding-limits.js";

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
}

export const DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS = 800;
export const DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS = 120;

export const DEFAULT_AI_KNOWLEDGE_BASE: Required<
  Pick<
    AiKnowledgeBaseSettings,
    | "enabled"
    | "recentMessageLimit"
    | "ragMessageLimit"
    | "vaultSnippetLimit"
    | "externalProvider"
    | "ragMode"
    | "maxFileBytes"
    | "chunkSizeChars"
    | "chunkOverlapChars"
  >
> & {
  publicVaultPaths: string[];
  privateVaultPaths: string[];
  externalMcpServer?: string;
  embedding?: AiEmbeddingSettings;
} = {
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
};

export function resolveAiKnowledgeBaseSettings(
  input?: AiKnowledgeBaseSettings | null,
): Required<
  Pick<
    AiKnowledgeBaseSettings,
    | "enabled"
    | "recentMessageLimit"
    | "ragMessageLimit"
    | "vaultSnippetLimit"
    | "externalProvider"
    | "ragMode"
    | "maxFileBytes"
    | "chunkSizeChars"
    | "chunkOverlapChars"
  >
> & {
  publicVaultPaths: string[];
  privateVaultPaths: string[];
  externalMcpServer?: string;
  mcpServerUrl?: string;
  mcpSearchTool?: string;
  mcpApiKey?: string;
  embedding?: AiEmbeddingSettings;
} {
  const ragMode = input?.ragMode ?? DEFAULT_AI_KNOWLEDGE_BASE.ragMode;
  const validRagMode: AiRagMode =
    ragMode === "lexical" || ragMode === "hybrid" || ragMode === "vector" ? ragMode : "vector";

  const legacyPublic = (input?.vaultPaths ?? []).map((p) => p.trim()).filter(Boolean);
  const publicVaultPaths =
    (input?.publicVaultPaths ?? (legacyPublic.length > 0 ? legacyPublic : undefined) ??
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
    maxFileBytes: clampInt(
      input?.maxFileBytes,
      1024,
      512 * 1024 * 1024,
      DEFAULT_AI_KNOWLEDGE_BASE.maxFileBytes,
    ),
    chunkSizeChars: clampInt(
      input?.chunkSizeChars,
      200,
      4000,
      DEFAULT_AI_KNOWLEDGE_BASE.chunkSizeChars,
    ),
    chunkOverlapChars: clampInt(
      input?.chunkOverlapChars,
      0,
      1000,
      DEFAULT_AI_KNOWLEDGE_BASE.chunkOverlapChars,
    ),
    externalMcpServer: input?.externalMcpServer?.trim() || undefined,
    mcpServerUrl: input?.mcpServerUrl?.trim() || undefined,
    mcpSearchTool: input?.mcpSearchTool?.trim() || undefined,
    mcpApiKey: input?.mcpApiKey?.trim() || undefined,
    embedding: input?.embedding,
  };
}

/** Resolve vault path prefixes for a given retrieval scope. */
export function resolveKnowledgeBaseVaultPaths(
  kb: ReturnType<typeof resolveAiKnowledgeBaseSettings>,
  scope: AiKnowledgeBaseScope,
): string[] {
  if (scope === "public") {
    return kb.publicVaultPaths;
  }
  return [...kb.publicVaultPaths, ...kb.privateVaultPaths];
}

export function buildVaultIndexOptionsFromKnowledgeBase(
  rootDir: string,
  knowledgeBase?: AiKnowledgeBaseSettings | null,
): {
  rootDir: string;
  maxChunkChars: number;
  chunkOverlapChars: number;
  maxFileBytes: number;
} {
  const kb = resolveAiKnowledgeBaseSettings(knowledgeBase);
  const maxInputTokens = resolveEmbeddingMaxInputTokens(kb.embedding);
  const tokenChunkCap =
    maxInputTokens != null ? maxVaultChunkCharsForEmbeddingTokens(maxInputTokens) : kb.chunkSizeChars;
  return {
    rootDir,
    maxChunkChars: Math.min(kb.chunkSizeChars, tokenChunkCap),
    chunkOverlapChars: kb.chunkOverlapChars,
    maxFileBytes: kb.maxFileBytes,
  };
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
