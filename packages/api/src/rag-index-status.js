export const DEFAULT_RAG_INDEX_PROGRESS = {
    phase: "idle",
    processed: 0,
    total: 0,
    indexed: 0,
    skipped: 0,
    removed: 0,
    updatedAt: new Date(0).toISOString(),
};
export const DEFAULT_RAG_INDEX_STATUS = {
    isIndexing: false,
    progress: DEFAULT_RAG_INDEX_PROGRESS,
    trackedDocuments: 0,
};
//# sourceMappingURL=rag-index-status.js.map