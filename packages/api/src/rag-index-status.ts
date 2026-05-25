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

export const DEFAULT_RAG_INDEX_PROGRESS: RagIndexProgress = {
  phase: "idle",
  processed: 0,
  total: 0,
  indexed: 0,
  skipped: 0,
  removed: 0,
  updatedAt: new Date(0).toISOString(),
};

export const DEFAULT_RAG_INDEX_STATUS: RagIndexStatus = {
  isIndexing: false,
  progress: DEFAULT_RAG_INDEX_PROGRESS,
  trackedDocuments: 0,
};
