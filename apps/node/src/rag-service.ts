/**
 * Node-local vector RAG service: embedding index + search for chat history and vault KB.
 */

import type {
  AiKnowledgeBaseScope,
  AiKnowledgeBaseSettings,
  AiVaultQuery,
  ModelProviderConfig,
  RagIndexProgress,
  RagIndexStatus,
} from "@envoymesh/api";
import { DEFAULT_RAG_INDEX_PROGRESS, DEFAULT_RAG_INDEX_STATUS, resolveAiKnowledgeBaseSettings } from "@envoymesh/api";
import type { LocalChatLogStore } from "@envoymesh/local-store";
import type { VaultDocumentMetadata, VaultIndex, VaultSearchResult } from "@envoymesh/vault";
import {
  chatCollectionId,
  createEmbeddingProvider,
  createVectorStore,
  formatExternalKnowledgeSection,
  loadRagVaultManifest,
  ragVaultManifestKey,
  saveRagVaultManifest,
  searchExternalMcpKnowledge,
  vaultCollectionId,
  type EmbeddingProvider,
  type RagVaultManifest,
  type VectorStore,
} from "@envoymesh/rag";
import {
  chatLogRowsToViews,
  filterVaultResultsBySensitivity,
  inferDocumentSensitivity,
  searchChatHistoryRag as lexicalChatHistoryRag,
  searchVaultKnowledgeBase as lexicalVaultKnowledgeBase,
  type KnowledgeAccessLevel,
  type ThreadMessageView,
} from "./ai-context.js";

export interface RagService {
  indexChatMessage(threadOwnerId: string, message: ThreadMessageView): Promise<void>;
  removeChatMessage(threadOwnerId: string, messageId: string): Promise<void>;
  clearChatThread(threadOwnerId: string): Promise<void>;
  backfillChatHistory(chatLogStore: LocalChatLogStore | null): Promise<void>;
  reindexVault(input: {
    vaultIndex: VaultIndex;
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    force?: boolean;
  }): Promise<void>;
  getIndexStatus(): RagIndexStatus;
  searchChatHistoryRag(input: {
    threadOwnerId: string;
    query: string;
    messages: ThreadMessageView[];
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    recentLimit: number;
    ragLimit: number;
  }): Promise<ThreadMessageView[]>;
  searchVaultKnowledgeBase(input: {
    vaultIndex: VaultIndex;
    query: string;
    knowledgeAccess: KnowledgeAccessLevel;
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    knowledgeScope?: AiKnowledgeBaseScope;
    ruleVaultQuery?: AiVaultQuery;
  }): Promise<VaultSearchResult[]>;
  getExternalKnowledgeContext(input: {
    query: string;
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    knowledgeScope?: AiKnowledgeBaseScope;
  }): Promise<string>;
  refreshConfig(input: {
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    modelProviders?: ModelProviderConfig;
  }): Promise<void>;
}

export interface CreateRagServiceInput {
  profileDir: string;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  modelProviders?: ModelProviderConfig;
  chatLogStore?: LocalChatLogStore | null;
  onProgress?: (progress: RagIndexProgress) => void;
}

export async function createRagService(input: CreateRagServiceInput): Promise<RagService> {
  let knowledgeBase = input.knowledgeBase;
  let modelProviders = input.modelProviders;
  let indexStatus: RagIndexStatus = { ...DEFAULT_RAG_INDEX_STATUS };
  let embedder = createEmbeddingProvider({
    embedding: knowledgeBase?.embedding,
    modelProviders,
  });
  let store = await createVectorStore({
    profileDir: input.profileDir,
    modelKey: embedder.modelKey,
  });

  const reportProgress = (partial: Partial<RagIndexProgress> & Pick<RagIndexProgress, "phase">) => {
    indexStatus = {
      ...indexStatus,
      isIndexing: partial.phase !== "done" && partial.phase !== "idle" && partial.phase !== "error",
      progress: {
        ...indexStatus.progress,
        ...partial,
        updatedAt: new Date().toISOString(),
      },
    };
    if (partial.phase === "done") {
      indexStatus.lastCompletedAt = indexStatus.progress.updatedAt;
      indexStatus.isIndexing = false;
    }
    input.onProgress?.(indexStatus.progress);
  };

  const syncTrackedDocuments = async () => {
    const manifest = await loadRagVaultManifest(input.profileDir);
    indexStatus = {
      ...indexStatus,
      trackedDocuments: Object.keys(manifest.documents).length,
    };
  };

  await syncTrackedDocuments();

  const flushSoon = debounce(async () => {
    try {
      await store.flush();
    } catch (error) {
      console.warn(`[rag] failed to persist vector index: ${error}`);
    }
  }, 500);

  // When the embeddings provider is misconfigured, every backfill batch throws
  // the same error. Track the last failure and skip re-running until enough
  // time has passed so the user isn't spammed with identical warnings.
  let lastBackfillFailureAt = 0;
  const BACKFILL_FAILURE_BACKOFF_MS = 5 * 60_000;

  async function ensureRuntime(): Promise<{ embedder: EmbeddingProvider; store: VectorStore }> {
    const nextEmbedder = createEmbeddingProvider({
      embedding: knowledgeBase?.embedding,
      modelProviders,
    });
    if (nextEmbedder.modelKey !== embedder.modelKey) {
      embedder = nextEmbedder;
      store = await createVectorStore({
        profileDir: input.profileDir,
        modelKey: embedder.modelKey,
      });
      await saveRagVaultManifest(input.profileDir, { version: "0.1", documents: {} });
      await syncTrackedDocuments();
    }
    return { embedder, store };
  }

  const service: RagService = {
    async refreshConfig(next) {
      knowledgeBase = next.knowledgeBase ?? knowledgeBase;
      modelProviders = next.modelProviders ?? modelProviders;
      await ensureRuntime();
    },

    async indexChatMessage(threadOwnerId, message) {
      const text = message.text.trim();
      if (!text) return;
      const kb = resolveAiKnowledgeBaseSettings(knowledgeBase);
      if (kb.ragMode === "lexical") return;

      const { embedder: activeEmbedder, store: activeStore } = await ensureRuntime();
      try {
        const vector = await activeEmbedder.embed(text);
        await activeStore.upsert([
          {
            id: `${chatCollectionId(threadOwnerId)}:${message.messageId}`,
            collection: chatCollectionId(threadOwnerId),
            sourceKey: message.messageId,
            textPreview: text.slice(0, 500),
            vector,
            metadata: {
              sender: message.sender,
              timestamp: message.timestamp,
            },
          },
        ]);
        void flushSoon();
      } catch (error) {
        console.warn(`[rag] chat index skipped: ${error}`);
      }
    },

    async removeChatMessage(threadOwnerId, messageId) {
      const kb = resolveAiKnowledgeBaseSettings(knowledgeBase);
      if (kb.ragMode === "lexical") return;
      const { store: activeStore } = await ensureRuntime();
      await activeStore.deleteBySourceKey(chatCollectionId(threadOwnerId), messageId);
      void flushSoon();
    },

    async clearChatThread(threadOwnerId) {
      const kb = resolveAiKnowledgeBaseSettings(knowledgeBase);
      if (kb.ragMode === "lexical") return;
      const { store: activeStore } = await ensureRuntime();
      await activeStore.deleteCollection(chatCollectionId(threadOwnerId));
      void flushSoon();
    },

    async backfillChatHistory(chatLogStore) {
      if (!chatLogStore?.listAllMessages) return;
      const kb = resolveAiKnowledgeBaseSettings(knowledgeBase);
      if (kb.ragMode === "lexical") return;

      const nowMs = Date.now();
      if (nowMs - lastBackfillFailureAt < BACKFILL_FAILURE_BACKOFF_MS) {
        // Skip — the previous run hit a configuration error and we don't want
        // to log the same warning every 90s. Will retry on the next config
        // change or after the backoff expires.
        return;
      }

      const rows = await chatLogStore.listAllMessages(20_000);
      if (rows.length === 0) return;

      const { embedder: activeEmbedder, store: activeStore } = await ensureRuntime();
      const existingByCollection = new Map<string, Set<string>>();
      const batchSize = 32;

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const pending: Array<{
          threadOwnerId: string;
          message: ThreadMessageView;
          text: string;
        }> = [];

        for (const row of batch) {
          const text = row.content?.text?.trim() ?? "";
          if (!text) continue;
          const collection = chatCollectionId(row.threadPeerOwnerId);
          const seen = existingByCollection.get(collection) ?? activeStore.listCollection(collection).map((r) => r.sourceKey);
          existingByCollection.set(collection, new Set(seen));
          if (existingByCollection.get(collection)!.has(row.messageId)) continue;

          pending.push({
            threadOwnerId: row.threadPeerOwnerId,
            message: chatLogRowsToViews([row])[0]!,
            text,
          });
        }

        if (pending.length === 0) continue;

        try {
          const vectors = await activeEmbedder.embedBatch(pending.map((item) => item.text));
          const records = pending.map((item, index) => ({
            id: `${chatCollectionId(item.threadOwnerId)}:${item.message.messageId}`,
            collection: chatCollectionId(item.threadOwnerId),
            sourceKey: item.message.messageId,
            textPreview: item.text.slice(0, 500),
            vector: vectors[index] ?? [],
            metadata: {
              sender: item.message.sender,
              timestamp: item.message.timestamp,
            },
          }));
          await activeStore.upsert(records);
          for (const record of records) {
            existingByCollection.get(record.collection)?.add(record.sourceKey);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          lastBackfillFailureAt = nowMs;
          console.warn(
            `[rag] chat backfill batch failed (provider=${activeEmbedder.modelKey}, will retry in ${Math.round(
              BACKFILL_FAILURE_BACKOFF_MS / 1000,
            )}s): ${errMsg}`,
          );
          // Surface a one-time hint to help the user fix misconfigured embeddings.
          if (/missing vector/i.test(errMsg)) {
            console.warn(
              "[rag] hint: the embeddings endpoint returned a response without a vector field. " +
                "If you are using an OpenAI-compatible chat-completions provider as the embeddings endpoint, " +
                "switch the embedding mode to 'mock' (or 'ollama' for a local model) in AI Settings → Knowledge.",
            );
          }
          return;
        }
      }

      // Successful run — clear the failure flag.
      lastBackfillFailureAt = 0;
      void flushSoon();
      console.log(`[rag] chat history backfill complete (${rows.length} message(s) scanned)`);
    },

    getIndexStatus() {
      return indexStatus;
    },

    async reindexVault({ vaultIndex, knowledgeBase: kbOverride, force = false }) {
      const kb = resolveAiKnowledgeBaseSettings(kbOverride ?? knowledgeBase);
      if (!kb.enabled || kb.ragMode === "lexical") {
        reportProgress({ phase: "idle", processed: 0, total: 0, indexed: 0, skipped: 0, removed: 0 });
        return;
      }

      const { embedder: activeEmbedder, store: activeStore } = await ensureRuntime();
      const manifest = await loadRagVaultManifest(input.profileDir);
      let indexed = 0;
      let skipped = 0;
      let removed = 0;

      try {
        const publicStats = await indexVaultTier({
          embedder: activeEmbedder,
          store: activeStore,
          vaultIndex,
          paths: kb.publicVaultPaths,
          tier: "public",
          kb,
          manifest,
          force,
          onProgress: (partial) => {
            reportProgress({ phase: "public", indexed, skipped, removed, ...partial });
          },
        });
        indexed += publicStats.indexed;
        skipped += publicStats.skipped;
        removed += publicStats.removed;

        const privateStats = await indexVaultTier({
          embedder: activeEmbedder,
          store: activeStore,
          vaultIndex,
          paths: kb.privateVaultPaths,
          tier: "private",
          kb,
          manifest,
          force,
          onProgress: (partial) => {
            reportProgress({ phase: "private", indexed, skipped, removed, ...partial });
          },
        });
        indexed += privateStats.indexed;
        skipped += privateStats.skipped;
        removed += privateStats.removed;

        reportProgress({ phase: "flush", processed: 0, total: 0, indexed, skipped, removed });
        void flushSoon();
        await activeStore.flush();
        await saveRagVaultManifest(input.profileDir, manifest);
        await syncTrackedDocuments();
        reportProgress({
          phase: "done",
          processed: indexed + skipped,
          total: indexed + skipped,
          indexed,
          skipped,
          removed,
          message: `Indexed ${indexed}, skipped ${skipped}, removed ${removed}`,
        });
      } catch (error) {
        reportProgress({
          phase: "error",
          processed: 0,
          total: 0,
          indexed,
          skipped,
          removed,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async searchChatHistoryRag({ threadOwnerId, query, messages, knowledgeBase: kbOverride, recentLimit, ragLimit }) {
      const kb = resolveAiKnowledgeBaseSettings(kbOverride ?? knowledgeBase);
      if (ragLimit <= 0) return [];

      const recentIds = new Set(
        messages.length > recentLimit
          ? messages.slice(messages.length - recentLimit).map((m) => m.messageId)
          : messages.map((m) => m.messageId),
      );
      const byId = new Map(messages.map((m) => [m.messageId, m]));

      const runLexical = () =>
        lexicalChatHistoryRag(messages, query, { recentLimit, ragLimit });

      if (kb.ragMode === "lexical") {
        return runLexical();
      }

      const { embedder: activeEmbedder, store: activeStore } = await ensureRuntime();
      try {
        const queryVector = await activeEmbedder.embed(query);
        const hits = activeStore.search(chatCollectionId(threadOwnerId), queryVector, ragLimit * 3);
        const vectorHits = hits
          .filter((hit) => !recentIds.has(hit.sourceKey))
          .slice(0, ragLimit)
          .map((hit) => {
            const fromThread = byId.get(hit.sourceKey);
            if (fromThread) return fromThread;
            return {
              messageId: hit.sourceKey,
              sender: hit.metadata?.sender ?? "unknown",
              text: hit.textPreview,
              timestamp: hit.metadata?.timestamp ?? new Date().toISOString(),
            };
          });

        if (vectorHits.length > 0) {
          return vectorHits;
        }
        if (kb.ragMode === "vector") {
          return runLexical();
        }
      } catch (error) {
        console.warn(`[rag] chat vector search failed, falling back to lexical: ${error}`);
      }

      return runLexical();
    },

    async searchVaultKnowledgeBase({
      vaultIndex,
      query,
      knowledgeAccess,
      knowledgeBase: kbOverride,
      knowledgeScope = "public",
      ruleVaultQuery,
    }) {
      const kb = resolveAiKnowledgeBaseSettings(kbOverride ?? knowledgeBase);

      if (!kb.enabled && !ruleVaultQuery) {
        return [];
      }
      if (kb.ragMode === "lexical") {
        return lexicalVaultKnowledgeBase({
          vaultIndex,
          query,
          knowledgeAccess,
          knowledgeBase: kbOverride ?? knowledgeBase,
          knowledgeScope,
          ruleVaultQuery,
        });
      }

      const tiers: Array<"public" | "private"> =
        knowledgeScope === "owner" ? ["public", "private"] : ["public"];

      const { embedder: activeEmbedder, store: activeStore } = await ensureRuntime();
      try {
        const queryVector = await activeEmbedder.embed(query.trim() || ruleVaultQuery?.path?.trim() || "");
        const documentsById = new Map(vaultIndex.documents.map((doc) => [doc.documentId, doc]));
        const merged: VaultSearchResult[] = [];

        for (const tier of tiers) {
          const hits = activeStore.search(vaultCollectionId(tier), queryVector, kb.vaultSnippetLimit * 4);
          for (const hit of hits) {
            const [documentId, chunkIndexRaw] = hit.sourceKey.split(":");
            const chunkIndex = Number.parseInt(chunkIndexRaw ?? "", 10);
            const doc = documentsById.get(documentId ?? "");
            const chunk = vaultIndex.chunks.find(
              (row) => row.documentId === documentId && row.index === chunkIndex,
            );
            if (!doc || !chunk) continue;
            merged.push({
              chunk,
              document: doc,
              score: hit.score * 10,
              matches: [],
            });
          }
        }

        const filtered = filterVaultResultsBySensitivity(merged, knowledgeAccess, ruleVaultQuery?.maxSensitivity);
        if (filtered.length > 0) {
          return filtered.slice(0, kb.vaultSnippetLimit);
        }
        if (kb.ragMode === "vector") {
          return lexicalVaultKnowledgeBase({
            vaultIndex,
            query,
            knowledgeAccess,
            knowledgeBase: kbOverride ?? knowledgeBase,
            knowledgeScope,
            ruleVaultQuery,
          });
        }
      } catch (error) {
        console.warn(`[rag] vault vector search failed, falling back to lexical: ${error}`);
      }

      return lexicalVaultKnowledgeBase({
        vaultIndex,
        query,
        knowledgeAccess,
        knowledgeBase: kbOverride ?? knowledgeBase,
        knowledgeScope,
        ruleVaultQuery,
      });
    },

    async getExternalKnowledgeContext({ query, knowledgeBase: kbOverride, knowledgeScope = "public" }) {
      if (knowledgeScope !== "owner") {
        return "";
      }
      const kb = resolveAiKnowledgeBaseSettings(kbOverride ?? knowledgeBase);
      if (kb.externalProvider !== "mcp") {
        return "";
      }
      try {
        const snippets = await searchExternalMcpKnowledge({
          query,
          knowledgeBase: kbOverride ?? knowledgeBase,
        });
        return formatExternalKnowledgeSection(snippets);
      } catch (error) {
        console.warn(`[rag] external MCP knowledge failed: ${error}`);
        return "";
      }
    },
  };

  if (input.chatLogStore) {
    void service.backfillChatHistory(input.chatLogStore).catch((error) =>
      console.warn(`[rag] chat backfill failed: ${error}`),
    );
  }

  return service;
}

async function indexVaultTier(input: {
  embedder: EmbeddingProvider;
  store: VectorStore;
  vaultIndex: VaultIndex;
  paths: string[];
  tier: "public" | "private";
  kb: ReturnType<typeof resolveAiKnowledgeBaseSettings>;
  manifest: RagVaultManifest;
  force: boolean;
  onProgress: (partial: Pick<RagIndexProgress, "processed" | "total">) => void;
}): Promise<{ indexed: number; skipped: number; removed: number }> {
  const { embedder, store, vaultIndex, paths, tier, kb, manifest, force, onProgress } = input;
  const collection = vaultCollectionId(tier);
  const documents = vaultDocumentsForPaths(vaultIndex, paths);
  const chunksByDocument = groupChunksByDocument(vaultIndex, documents);
  const activeKeys = new Set(documents.map((doc) => ragVaultManifestKey(tier, doc.relativePath)));

  let removed = 0;
  for (const [key, entry] of Object.entries(manifest.documents)) {
    if (entry.tier !== tier) continue;
    if (activeKeys.has(key)) continue;
    await store.deleteByDocumentId(collection, entry.documentId);
    delete manifest.documents[key];
    removed += 1;
  }

  let indexed = 0;
  let skipped = 0;
  const total = documents.length;
  const batchSize = 16;

  for (let docIndex = 0; docIndex < documents.length; docIndex += 1) {
    const doc = documents[docIndex]!;
    const manifestKey = ragVaultManifestKey(tier, doc.relativePath);
    const chunks = chunksByDocument.get(doc.documentId) ?? [];
    const existing = manifest.documents[manifestKey];
    const unchanged =
      !force &&
      existing &&
      existing.contentHash === doc.contentHash &&
      existing.documentId === doc.documentId &&
      existing.chunkCount === chunks.length &&
      existing.modelKey === embedder.modelKey &&
      existing.chunkSizeChars === kb.chunkSizeChars &&
      existing.chunkOverlapChars === kb.chunkOverlapChars;

    onProgress({ processed: docIndex + 1, total });

    if (unchanged) {
      skipped += 1;
      continue;
    }

    if (existing && existing.documentId !== doc.documentId) {
      await store.deleteByDocumentId(collection, existing.documentId);
    } else if (existing) {
      await store.deleteByDocumentId(collection, doc.documentId);
    }

    if (chunks.length > 0) {
      for (let offset = 0; offset < chunks.length; offset += batchSize) {
        const batch = chunks.slice(offset, offset + batchSize);
        const texts = batch.map((chunk) => chunk.text);
        const vectors = await embedder.embedBatch(texts);
        const records = batch.map((chunk, index) => ({
          id: `${collection}:${doc.documentId}:${chunk.index}`,
          collection,
          sourceKey: `${doc.documentId}:${chunk.index}`,
          textPreview: chunk.text.slice(0, 500),
          vector: vectors[index] ?? [],
          metadata: {
            relativePath: doc.relativePath,
            title: doc.title,
            tier,
            sensitivity: inferDocumentSensitivity(doc.relativePath),
          },
        }));
        await store.upsert(records);
      }
    }

    if (chunks.length === 0) {
      delete manifest.documents[manifestKey];
    } else {
      manifest.documents[manifestKey] = {
        relativePath: doc.relativePath,
        documentId: doc.documentId,
        contentHash: doc.contentHash,
        chunkCount: chunks.length,
        tier,
        modelKey: embedder.modelKey,
        chunkSizeChars: kb.chunkSizeChars,
        chunkOverlapChars: kb.chunkOverlapChars,
        indexedAt: new Date().toISOString(),
      };
    }
    indexed += 1;
  }

  return { indexed, skipped, removed };
}

function vaultDocumentsForPaths(vaultIndex: VaultIndex, paths: string[]): VaultDocumentMetadata[] {
  if (paths.length === 0) return [];
  return vaultIndex.documents.filter((doc) => {
    if (doc.indexSkippedReason) return false;
    const rel = doc.relativePath.replace(/\\/g, "/");
    return paths.some((prefix) => {
      const p = prefix.replace(/\\/g, "/").replace(/\/$/, "");
      return rel === p || rel.startsWith(`${p}/`);
    });
  });
}

function groupChunksByDocument(
  vaultIndex: VaultIndex,
  documents: VaultDocumentMetadata[],
): Map<string, VaultIndex["chunks"]> {
  const allowed = new Set(documents.map((doc) => doc.documentId));
  const grouped = new Map<string, VaultIndex["chunks"]>();
  for (const chunk of vaultIndex.chunks) {
    if (!allowed.has(chunk.documentId)) continue;
    const list = grouped.get(chunk.documentId) ?? [];
    list.push(chunk);
    grouped.set(chunk.documentId, list);
  }
  return grouped;
}

function debounce(fn: () => Promise<void>, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void fn();
    }, ms);
  };
}
