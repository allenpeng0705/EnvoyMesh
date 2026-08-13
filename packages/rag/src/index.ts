export { cosineSimilarity, topKByCosine } from "./vector-math.js";
export {
  createEmbeddingProvider,
  mockEmbedding,
  resolveEmbeddingConfig,
  type CreateEmbeddingProviderInput,
  type EmbeddingProvider,
  type EmbeddingProviderMode,
  type ResolvedEmbeddingConfig,
} from "./embedding-provider.js";
// Browser-safe resolver subpath — no Node-only deps, safe to import from
// the Social UI for "effective value" hints in Settings. Node-side callers
// can keep using the `@envoymesh/rag` root import above.
export {
  resolveEmbeddingConfig as resolveEmbeddingConfigBrowserSafe,
  inferEmbeddingProviderFromEndpoint,
  isEnvoyLocalChatEndpoint,
  KNOWN_EMBEDDING_PROVIDERS,
  type EmbeddingProviderPreset,
  type EmbeddingProviderRule,
  type ResolveEmbeddingConfigInput,
} from "./embedding-resolver.js";
export {
  formatExternalKnowledgeSection,
  searchExternalMcpKnowledge,
  formatMcpResultsAsNote,
  validateMcpServerUrl,
  DEFAULT_MCP_KNOWLEDGE_TIMEOUT_MS,
  MAX_MCP_KNOWLEDGE_TIMEOUT_MS,
  type ExternalKnowledgeSnippet,
  type ExternalMcpSearchResult,
  type McpQueryAttribution,
  type McpWriteBackOptions,
} from "./mcp-knowledge-client.js";
export {
  chatCollectionId,
  createFileVectorStore,
  createMemoryVectorStore,
  vaultCollectionId,
  type VectorRecord,
  type VectorSearchHit,
  type VectorStore,
} from "./vector-store.js";
export { createSqliteVectorStore, collectionIndexPath } from "./sqlite-vector-store.js";
export {
  loadRagVaultManifest,
  ragVaultManifestKey,
  ragVaultManifestPath,
  saveRagVaultManifest,
  type RagVaultManifest,
  type RagVaultManifestEntry,
} from "./rag-vault-manifest.js";
export { createCollectionAnnIndex } from "./hnsw-collection-index.js";

import type { CreateFileVectorStoreInput, VectorStore } from "./vector-store.js";
import { createSqliteVectorStore } from "./sqlite-vector-store.js";

/** Default durable vector store: SQLite metadata + HNSW ANN index files. */
export async function createVectorStore(input: CreateFileVectorStoreInput): Promise<VectorStore> {
  return createSqliteVectorStore(input);
}
