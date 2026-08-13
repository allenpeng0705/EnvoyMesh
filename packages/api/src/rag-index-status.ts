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
