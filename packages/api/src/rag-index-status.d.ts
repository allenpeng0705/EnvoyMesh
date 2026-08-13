/** Live progress for vault/chat vector indexing. */
export interface RagIndexProgress {
    phase: "idle" | "public" | "private" | "chat" | "flush" | "done" | "error";
    processed: number;
    total: number;
    indexed: number;
    skipped: number;
    removed: number;
    message?: string;
    updatedAt: string;
}
export interface RagIndexStatus {
    isIndexing: boolean;
    progress: RagIndexProgress;
    lastCompletedAt?: string;
    trackedDocuments: number;
    /** Effective embedder identity (`mode:model@endpoint`) used by the RAG service. */
    embedderModelKey?: string;
    /** Last embedding failure (chat backfill or vault reindex); cleared after a successful embed run. */
    lastEmbedError?: string;
    lastEmbedErrorAt?: string;
    /** Last external MCP knowledge search failure (owner prompt path); cleared after a successful MCP search. */
    lastExternalKbError?: string;
    lastExternalKbErrorAt?: string;
    /** Count of `.md` files visible via linked Obsidian vault paths (Browse / owner Ask). */
    linkedObsidianNoteCount?: number;
}
/**
 * One-shot embedding health check (Knowledge → Setup → Test embedding).
 * Does not rebuild the index — only confirms the current provider can embed.
 */
export type RagEmbeddingProbeResult = {
    ok: true;
    modelKey: string;
    mode: string;
    modelName: string;
    endpoint: string;
    dimensions: number;
    latencyMs: number;
    hasApiKey: boolean;
} | {
    ok: false;
    modelKey?: string;
    mode?: string;
    modelName?: string;
    endpoint?: string;
    hasApiKey?: boolean;
    error: string;
    latencyMs: number;
};
export declare const DEFAULT_RAG_INDEX_PROGRESS: RagIndexProgress;
export declare const DEFAULT_RAG_INDEX_STATUS: RagIndexStatus;
//# sourceMappingURL=rag-index-status.d.ts.map
