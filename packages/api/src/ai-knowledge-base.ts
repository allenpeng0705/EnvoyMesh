/**
 * Owner knowledge base settings for AI chat assist and knowledge.query.
 * Layer 1: local vault files (vector + lexical RAG in SQLite/HNSW). Layer 2: external MCP adapters.
 */

import {
  maxVaultChunkCharsForEmbeddingTokens,
  resolveEmbeddingMaxInputTokens,
} from "./ai-embedding-limits.js";
import { DEFAULT_AI_EMBEDDING } from "./embedding-presets.js";

export type KnowledgeBaseExternalProvider = "none" | "mcp";

export type AiRagMode = "vector" | "lexical" | "hybrid";

/** Which vault KB partitions to search. */
export type AiKnowledgeBaseScope = "public" | "owner";

/**
 * Upstream HTTP response envelope shape for embedding APIs. Providers wrap
 * their vectors in different JSON shapes; the parser in
 * `@envoymesh/rag`'s `embedding-provider.ts` dispatches on this hint.
 *
 *   * `openai`  — `{ data: [{ embedding: number[] }, ...] }`
 *                Used by OpenAI, Zhipu, Qwen DashScope `/compatible-mode`,
 *                and any standard OpenAI-compatible host.
 *   * `minimax` — `{ embedding: number[] }` for a single input, and
 *                `{ vectors: number[][] }` for batch input.
 *                Used by MiniMax (embo-01).
 *   * `auto`    — try `openai` first, fall back to `minimax`. Useful when
 *                you don't know which shape a host returns.
 *
 * Default when unset: `openai` (back-compat with existing configs that
 * pre-date this field).
 */
export type EmbeddingResponseShape = "openai" | "minimax" | "auto";

export interface AiEmbeddingSettings {
  /**
   * Embedding provider. Independent of chat `modelProviders`.
   * Default: `envoy-local` (dedicated llama.cpp embed sidecar).
   * Legacy `inherit` is accepted only for one-time migration.
   */
  mode?: "mock" | "ollama" | "openai-compatible" | "envoy-local" | "inherit";
  /**
   * Optional UI preset id (`openai`, `minimax`, `envoy-local`, …).
   * Does not affect resolution by itself — mode/endpoint/model do.
   */
  presetId?: string;
  /** Embedding model name (e.g. nomic-embed-text, text-embedding-3-small, embo-01). */
  modelName?: string;
  /** API root. OpenAI-compatible / Envoy Local use `/v1/embeddings`; Ollama uses `/api/embeddings`. */
  endpoint?: string;
  apiKey?: string;
  /** Max tokens per embed API call (e.g. MiniMax embo-01 = 4096). Caps vault chunk size and truncates at embed time. */
  maxInputTokens?: number;
  /**
   * Parser hint for the HTTP response when `mode` is `openai-compatible` or `envoy-local`.
   * See `EmbeddingResponseShape` for the full list. The HTTP transport
   * (`POST {endpoint}/embeddings` with `{model, input}` body and
   * `Authorization: Bearer …`) is identical across providers — only the
   * response envelope differs.
   *
   * Default: `openai`.
   */
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
   * Shown in Knowledge Browse / used for owner RAG — never moved or rewritten.
   * Mesh publish still uses the Envoy vault only.
   */
  linkedObsidianVaultPaths?: string[];
  /**
   * Vault paths the owner explicitly unlinked. Auto-discover will not re-add these.
   */
  dismissedObsidianVaultPaths?: string[];
  /**
   * External KB via MCP (e.g. Notion search). Default: `mcp`.
   * Soft-fails when URL is missing — no Notion desktop app required.
   */
  externalProvider?: KnowledgeBaseExternalProvider;
  /** MCP server id when externalProvider is "mcp" (future). */
  externalMcpServer?: string;
  /** MCP HTTP endpoint for tools/call (e.g. memex bridge). */
  mcpServerUrl?: string;
  /** MCP tool name used for knowledge search. Default: memex_search */
  mcpSearchTool?: string;
  /** Optional bearer token for MCP HTTP bridge. */
  mcpApiKey?: string;
  /**
   * MCP HTTP tools/call timeout in milliseconds (Phase 57D).
   * Default: 8000; clamped 1000–30000.
   */
  mcpTimeoutMs?: number;
  /**
   * When true, owner may save MCP search hits into `notes/mcp/` via
   * `saveExternalMcpSearchAsNote` (Phase 57D). Default: false — search merges into prompts only.
   */
  mcpWriteBackEnabled?: boolean;
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
    | "purgeChatRagOnDelete"
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
  publicVaultPaths: ["knowledge/public/", "notes/"],
  privateVaultPaths: ["knowledge/private/"],
  /** Prefer MCP when a server URL is configured; soft-fails if URL missing. */
  externalProvider: "mcp",
  maxFileBytes: DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES,
  chunkSizeChars: DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS,
  chunkOverlapChars: DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS,
  purgeChatRagOnDelete: false,
  /** Default: Envoy Local embed sidecar — not inherited from chat. */
  embedding: { ...DEFAULT_AI_EMBEDDING },
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
    | "purgeChatRagOnDelete"
  >
> & {
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
  const linkedObsidianVaultPaths = (input?.linkedObsidianVaultPaths ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  const dismissedObsidianVaultPaths = (input?.dismissedObsidianVaultPaths ?? [])
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
    linkedObsidianVaultPaths,
    dismissedObsidianVaultPaths,
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
    purgeChatRagOnDelete: input?.purgeChatRagOnDelete ?? DEFAULT_AI_KNOWLEDGE_BASE.purgeChatRagOnDelete,
    externalMcpServer: input?.externalMcpServer?.trim() || undefined,
    mcpServerUrl: input?.mcpServerUrl?.trim() || undefined,
    mcpSearchTool: input?.mcpSearchTool?.trim() || undefined,
    mcpApiKey: input?.mcpApiKey?.trim() || undefined,
    mcpTimeoutMs:
      typeof input?.mcpTimeoutMs === "number" && Number.isFinite(input.mcpTimeoutMs)
        ? Math.min(30_000, Math.max(1_000, Math.floor(input.mcpTimeoutMs)))
        : undefined,
    mcpWriteBackEnabled: input?.mcpWriteBackEnabled === true,
    embedding: input?.embedding ?? { ...DEFAULT_AI_KNOWLEDGE_BASE.embedding },
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
