/**
 * Node-local vector RAG service: embedding index + search for chat history and vault KB.
 */

import type {
  AiKnowledgeBaseScope,
  AiKnowledgeBaseSettings,
  AiVaultQuery,
  ModelProviderConfig,
  RagEmbeddingProbeResult,
  RagIndexProgress,
  RagIndexStatus,
} from "@envoymesh/api";
import { DEFAULT_RAG_INDEX_PROGRESS, DEFAULT_RAG_INDEX_STATUS, resolveAiKnowledgeBaseSettings } from "@envoymesh/api";
import type { LocalChatLogStore } from "@envoymesh/local-store";
import type { VaultDocumentMetadata, VaultIndex, VaultSearchResult } from "@envoymesh/vault";
import { isVaultExtractableExtension, VAULT_TEXT_EXTRACTOR_ID } from "@envoymesh/vault";
import {
  chatCollectionId,
  createEmbeddingProvider,
  createVectorStore,
  formatExternalKnowledgeSection,
  loadRagVaultManifest,
  ragVaultManifestKey,
  resolveEmbeddingConfig,
  saveRagVaultManifest,
  searchExternalMcpKnowledge,
  vaultCollectionId,
  type EmbeddingProvider,
  type RagVaultManifest,
  type VectorStore,
} from "@envoymesh/rag";
import {
  chatLogRowsToViews,
  inferDocumentSensitivity,
  loadKnowledgeSensitivityOverrides,
  normalizeLegacySensitivity,
  resolveDocumentSensitivityById,
  SENSITIVITY_ORDER,
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
    /** Per-item sensitivity overrides (Phase 44A1). */
    sensitivityOverrides?: Map<string, KnowledgeAccessLevel>;
    /**
     * Prefer on-disk Markdown: skip embedding these Office/PDF originals when a
     * `notes/imports` companion already exists (or was just materialized).
     */
    skipDocumentPaths?: ReadonlySet<string> | readonly string[];
  }): Promise<void>;
  /** Emit a progress tick (e.g. materialize phase before vault embed). */
  notifyProgress(partial: Partial<RagIndexProgress> & Pick<RagIndexProgress, "phase">): void;
  getIndexStatus(): RagIndexStatus;
  /**
   * One-shot embed call against the effective provider (no index rebuild).
   * Updates `lastEmbedError` on failure / clears it on success.
   */
  probeEmbedding(): Promise<RagEmbeddingProbeResult>;
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
    /** Per-item sensitivity overrides (Phase 44A1). */
    sensitivityOverrides?: Map<string, KnowledgeAccessLevel>;
  }): Promise<VaultSearchResult[]>;
  getExternalKnowledgeContext(input: {
    query: string;
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    knowledgeScope?: AiKnowledgeBaseScope;
  }): Promise<string>;
  refreshConfig(input: {
    knowledgeBase?: AiKnowledgeBaseSettings | null;
    modelProviders?: ModelProviderConfig;
    envoyLocalEmbed?: {
      endpoint?: string;
      modelName?: string;
      running?: boolean;
    } | null;
  }): Promise<void>;
}

export interface CreateRagServiceInput {
  profileDir: string;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  modelProviders?: ModelProviderConfig;
  envoyLocalEmbed?: {
    endpoint?: string;
    modelName?: string;
    running?: boolean;
  } | null;
  chatLogStore?: LocalChatLogStore | null;
  onProgress?: (progress: RagIndexProgress) => void;
}

export async function createRagService(input: CreateRagServiceInput): Promise<RagService> {
  let knowledgeBase = input.knowledgeBase;
  let modelProviders = input.modelProviders;
  let envoyLocalEmbed = input.envoyLocalEmbed;
  let indexStatus: RagIndexStatus = { ...DEFAULT_RAG_INDEX_STATUS };
  let embedder = createEmbeddingProvider({
    embedding: knowledgeBase?.embedding,
    modelProviders,
    envoyLocalEmbed,
  });
  let store = await createVectorStore({
    profileDir: input.profileDir,
    modelKey: embedder.modelKey,
  });
  indexStatus = {
    ...indexStatus,
    embedderModelKey: embedder.modelKey,
  };

  const clearEmbedError = () => {
    if (!indexStatus.lastEmbedError && !indexStatus.lastEmbedErrorAt) return;
    indexStatus = {
      ...indexStatus,
      lastEmbedError: undefined,
      lastEmbedErrorAt: undefined,
    };
  };

  const recordEmbedError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    indexStatus = {
      ...indexStatus,
      embedderModelKey: embedder.modelKey,
      lastEmbedError: message,
      lastEmbedErrorAt: new Date().toISOString(),
    };
  };

  const clearExternalKbError = () => {
    if (!indexStatus.lastExternalKbError && !indexStatus.lastExternalKbErrorAt) return;
    indexStatus = {
      ...indexStatus,
      lastExternalKbError: undefined,
      lastExternalKbErrorAt: undefined,
    };
  };

  const recordExternalKbError = (message: string) => {
    indexStatus = {
      ...indexStatus,
      lastExternalKbError: message,
      lastExternalKbErrorAt: new Date().toISOString(),
    };
  };

  const reportProgress = (partial: Partial<RagIndexProgress> & Pick<RagIndexProgress, "phase">) => {
    indexStatus = {
      ...indexStatus,
      isIndexing: partial.phase !== "done" && partial.phase !== "idle" && partial.phase !== "error",
      embedderModelKey: embedder.modelKey,
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
      envoyLocalEmbed,
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
    indexStatus = { ...indexStatus, embedderModelKey: embedder.modelKey };
    return { embedder, store };
  }

  const service: RagService = {
    async refreshConfig(next) {
      knowledgeBase = next.knowledgeBase ?? knowledgeBase;
      modelProviders = next.modelProviders ?? modelProviders;
      if (next.envoyLocalEmbed !== undefined) {
        envoyLocalEmbed = next.envoyLocalEmbed;
      }
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
        clearEmbedError();
        void flushSoon();
      } catch (error) {
        recordEmbedError(error);
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("embeddings response missing vector")) {
          console.warn(`[rag] chat index skipped: ${msg}`);
        }
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
          recordEmbedError(error);
          console.warn(
            `[rag] chat backfill batch failed (provider=${activeEmbedder.modelKey}, will retry in ${Math.round(
              BACKFILL_FAILURE_BACKOFF_MS / 1000,
            )}s): ${errMsg}`,
          );
          // Surface a one-time hint to help the user fix misconfigured embeddings.
          if (/missing vector/i.test(errMsg)) {
            // Common causes:
            //   - chat-completions endpoint was wired in as the embeddings endpoint
            //   - upstream returns the OpenAI shape (data[].embedding) and we have
            //     configured a parser that expects MiniMax (or vice versa)
            console.warn(
              "[rag] hint: the embeddings endpoint returned a response that didn't parse as an embeddings payload. " +
                "Causes and fixes:\n" +
                "  * you're pointing at the chat-completions endpoint — pick a real /embeddings URL;\n" +
                "  * the API returns a different envelope than OpenAI (e.g. MiniMax embo-01 returns `{embedding}` or `{vectors}` at the root). " +
                "Set `embedding.responseShape` in AI Settings → Knowledge to `minimax` (or `auto` to try both);\n" +
                "  * your key has no embeddings entitlement — use a different provider;\n" +
                "  * fallback: switch embedding mode to `mock` (or `ollama` for local) in AI Settings → Knowledge.",
            );
          }
          return;
        }
      }

      // Successful run — clear the failure flag.
      lastBackfillFailureAt = 0;
      clearEmbedError();
      void flushSoon();
      console.log(`[rag] chat history backfill complete (${rows.length} message(s) scanned)`);
    },

    getIndexStatus() {
      return indexStatus;
    },

    async probeEmbedding(): Promise<RagEmbeddingProbeResult> {
      const resolved = resolveEmbeddingConfig({
        embedding: knowledgeBase?.embedding,
        modelProviders,
        envoyLocalEmbed,
      });
      const base = {
        modelKey: resolved.modelKey,
        mode: resolved.mode,
        modelName: resolved.modelName,
        endpoint: resolved.endpoint,
        hasApiKey: Boolean(resolved.apiKey?.trim()),
      };
      const started = Date.now();
      try {
        const { embedder: activeEmbedder } = await ensureRuntime();
        const vector = await activeEmbedder.embed("EnvoyMesh embedding probe");
        const latencyMs = Date.now() - started;
        if (!Array.isArray(vector) || vector.length === 0) {
          throw new Error("embedding provider returned an empty vector");
        }
        clearEmbedError();
        indexStatus = { ...indexStatus, embedderModelKey: activeEmbedder.modelKey };
        return {
          ok: true,
          ...base,
          modelKey: activeEmbedder.modelKey,
          dimensions: vector.length,
          latencyMs,
        };
      } catch (error) {
        const latencyMs = Date.now() - started;
        recordEmbedError(error);
        return {
          ok: false,
          ...base,
          error: error instanceof Error ? error.message : String(error),
          latencyMs,
        };
      }
    },

    async reindexVault({ vaultIndex, knowledgeBase: kbOverride, force = false, sensitivityOverrides, skipDocumentPaths }) {
      const kb = resolveAiKnowledgeBaseSettings(kbOverride ?? knowledgeBase);
      if (!kb.enabled || kb.ragMode === "lexical") {
        reportProgress({ phase: "idle", processed: 0, total: 0, indexed: 0, skipped: 0, removed: 0 });
        return;
      }

      const skipOffice =
        skipDocumentPaths instanceof Set
          ? skipDocumentPaths
          : new Set(
              Array.from(skipDocumentPaths ?? []).map((p) =>
                p.replace(/\\/g, "/").replace(/^\//, ""),
              ),
            );

      const { embedder: activeEmbedder, store: activeStore } = await ensureRuntime();
      const manifest = await loadRagVaultManifest(input.profileDir);
      const overrides =
        sensitivityOverrides ?? (await loadKnowledgeSensitivityOverrides(input.profileDir));
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
          sensitivityOverrides: overrides,
          skipOfficeSources: skipOffice,
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
          sensitivityOverrides: overrides,
          skipOfficeSources: skipOffice,
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
        clearEmbedError();
      } catch (error) {
        recordEmbedError(error);
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

    notifyProgress(partial) {
      reportProgress(partial);
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
        const msg = error instanceof Error ? error.message : String(error);
        // Suppress "embeddings response missing vector" — this is expected when
        // the model provider doesn't support embeddings (e.g. MiniMax). The
        // lexical fallback is correct behavior, not an error.
        if (!msg.includes("embeddings response missing vector")) {
          console.warn(`[rag] chat vector search failed, falling back to lexical: ${msg}`);
        }
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
      sensitivityOverrides,
    }) {
      const kb = resolveAiKnowledgeBaseSettings(kbOverride ?? knowledgeBase);

      if (!kb.enabled && !ruleVaultQuery) {
        return [];
      }

      const overrides =
        sensitivityOverrides ?? (await loadKnowledgeSensitivityOverrides(input.profileDir));

      if (kb.ragMode === "lexical") {
        return lexicalVaultKnowledgeBase({
          vaultIndex,
          query,
          knowledgeAccess,
          knowledgeBase: kbOverride ?? knowledgeBase,
          knowledgeScope,
          ruleVaultQuery,
          sensitivityOverrides: overrides,
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

        // Phase 44A1 / 57B: filter with sensitivity overrides when available
        const sensitivityFiltered = overrides
          ? filterVectorResultsWithOverrides(merged, knowledgeAccess, ruleVaultQuery?.maxSensitivity, overrides)
          : filterVectorResultsBySensitivity(merged, knowledgeAccess, ruleVaultQuery?.maxSensitivity);
        if (sensitivityFiltered.length > 0) {
          return sensitivityFiltered.slice(0, kb.vaultSnippetLimit);
        }
        if (kb.ragMode === "vector") {
          return lexicalVaultKnowledgeBase({
            vaultIndex,
            query,
            knowledgeAccess,
            knowledgeBase: kbOverride ?? knowledgeBase,
            knowledgeScope,
            ruleVaultQuery,
            sensitivityOverrides: overrides,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("embeddings response missing vector")) {
          console.warn(`[rag] vault vector search failed, falling back to lexical: ${msg}`);
        }
      }

      return lexicalVaultKnowledgeBase({
        vaultIndex,
        query,
        knowledgeAccess,
        knowledgeBase: kbOverride ?? knowledgeBase,
        knowledgeScope,
        ruleVaultQuery,
        sensitivityOverrides: overrides,
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
      const { snippets, error } = await searchExternalMcpKnowledge({
        query,
        knowledgeBase: kbOverride ?? knowledgeBase,
      });
      if (error) {
        recordExternalKbError(error);
        console.warn(`[rag] external MCP knowledge failed: ${error}`);
        return "";
      }
      clearExternalKbError();
      return formatExternalKnowledgeSection(snippets);
    },
  };

  if (input.chatLogStore) {
    setTimeout(() => {
      void service.backfillChatHistory(input.chatLogStore!).catch((error) =>
        console.warn(`[rag] chat backfill failed: ${error}`),
      );
    }, 120_000);
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
  sensitivityOverrides?: Map<string, KnowledgeAccessLevel>;
  /** Prefer Markdown corpus: do not embed these Office/PDF originals. */
  skipOfficeSources?: ReadonlySet<string>;
  onProgress: (partial: Pick<RagIndexProgress, "processed" | "total">) => void;
}): Promise<{ indexed: number; skipped: number; removed: number }> {
  const {
    embedder,
    store,
    vaultIndex,
    paths,
    tier,
    kb,
    manifest,
    force,
    sensitivityOverrides,
    skipOfficeSources,
    onProgress,
  } = input;
  const collection = vaultCollectionId(tier);
  const documents = vaultDocumentsForPaths(vaultIndex, paths).filter((doc) => {
    if (!skipOfficeSources || skipOfficeSources.size === 0) return true;
    const rel = doc.relativePath.replace(/\\/g, "/");
    if (!skipOfficeSources.has(rel)) return true;
    // Only skip binary/Office extractables — never skip the Markdown companion itself.
    return !isVaultExtractableExtension(doc.extension);
  });
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
      existing.chunkOverlapChars === kb.chunkOverlapChars &&
      existing.extractorId === VAULT_TEXT_EXTRACTOR_ID;

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
            sensitivity: resolveDocumentSensitivityById(
              doc.documentId,
              doc.relativePath,
              sensitivityOverrides,
            ),
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
        extractorId: VAULT_TEXT_EXTRACTOR_ID,
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

/**
 * Filter vault search results by sensitivity ceiling (path-heuristic only, no overrides).
 */
function filterVectorResultsBySensitivity(
  results: VaultSearchResult[],
  knowledgeAccess: KnowledgeAccessLevel,
  maxSensitivity?: string,
): VaultSearchResult[] {
  const accessIdx = SENSITIVITY_ORDER.indexOf(knowledgeAccess);
  const ruleLevel = maxSensitivity ? normalizeLegacySensitivity(maxSensitivity) : knowledgeAccess;
  const ruleIdx = SENSITIVITY_ORDER.indexOf(ruleLevel);
  const ceiling = Math.min(accessIdx, ruleIdx);
  return results.filter((result) => {
    const docIdx = SENSITIVITY_ORDER.indexOf(inferDocumentSensitivity(result.document.relativePath));
    return docIdx <= ceiling;
  });
}

/**
 * Filter vault search results using per-item sensitivity overrides (Phase 44A1).
 * Checks override first, falls back to path heuristic.
 */
function filterVectorResultsWithOverrides(
  results: VaultSearchResult[],
  knowledgeAccess: KnowledgeAccessLevel,
  maxSensitivity: string | undefined,
  overrides: Map<string, KnowledgeAccessLevel>,
): VaultSearchResult[] {
  const accessIdx = SENSITIVITY_ORDER.indexOf(knowledgeAccess);
  const ruleLevel = maxSensitivity ? normalizeLegacySensitivity(maxSensitivity) : knowledgeAccess;
  const ruleIdx = SENSITIVITY_ORDER.indexOf(ruleLevel);
  const ceiling = Math.min(accessIdx, ruleIdx);
  return results.filter((result) => {
    const sensitivity = resolveDocumentSensitivityById(
      result.document.documentId,
      result.document.relativePath,
      overrides,
    );
    const docIdx = SENSITIVITY_ORDER.indexOf(sensitivity);
    return docIdx <= ceiling;
  });
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
