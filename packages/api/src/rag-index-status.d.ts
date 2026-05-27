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
}
export declare const DEFAULT_RAG_INDEX_PROGRESS: RagIndexProgress;
export declare const DEFAULT_RAG_INDEX_STATUS: RagIndexStatus;
//# sourceMappingURL=rag-index-status.d.ts.map