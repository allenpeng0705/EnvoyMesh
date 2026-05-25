import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { topKByCosine } from "./vector-math.js";

export interface VectorRecord {
  id: string;
  collection: string;
  sourceKey: string;
  textPreview: string;
  vector: number[];
  metadata?: Record<string, string>;
}

export interface VectorSearchHit extends VectorRecord {
  score: number;
}

export interface VectorStoreSnapshot {
  version: "0.1";
  modelKey: string;
  records: VectorRecord[];
  updatedAt: string;
}

export interface VectorStore {
  readonly modelKey: string;
  upsert(records: VectorRecord[]): Promise<void>;
  deleteCollection(collection: string): Promise<void>;
  deleteBySourceKey(collection: string, sourceKey: string): Promise<void>;
  deleteByDocumentId(collection: string, documentId: string): Promise<void>;
  search(collection: string, queryVector: readonly number[], limit: number): VectorSearchHit[];
  listCollection(collection: string): VectorRecord[];
  flush(): Promise<void>;
}

export interface CreateFileVectorStoreInput {
  profileDir: string;
  modelKey: string;
}

const INDEX_FILE = "rag-vectors.json";

export async function createFileVectorStore(input: CreateFileVectorStoreInput): Promise<VectorStore> {
  const path = join(input.profileDir, INDEX_FILE);
  let records: VectorRecord[] = [];
  let modelKey = input.modelKey;

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as VectorStoreSnapshot;
    if (parsed.version === "0.1" && Array.isArray(parsed.records)) {
      records = parsed.records;
      if (parsed.modelKey === input.modelKey) {
        modelKey = parsed.modelKey;
      } else {
        records = [];
        modelKey = input.modelKey;
      }
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      console.warn(`[rag] failed to load vector index: ${error}`);
    }
  }

  const store: VectorStore = {
    modelKey,
    async upsert(batch) {
      const byId = new Map(records.map((record) => [record.id, record]));
      for (const record of batch) {
        byId.set(record.id, record);
      }
      records = [...byId.values()];
    },
    async deleteCollection(collection) {
      records = records.filter((record) => record.collection !== collection);
    },
    async deleteBySourceKey(collection, sourceKey) {
      records = records.filter(
        (record) => !(record.collection === collection && record.sourceKey === sourceKey),
      );
    },
    async deleteByDocumentId(collection, documentId) {
      const prefix = `${documentId}:`;
      records = records.filter(
        (record) => !(record.collection === collection && record.sourceKey.startsWith(prefix)),
      );
    },
    search(collection, queryVector, limit) {
      const pool = records.filter((record) => record.collection === collection);
      return topKByCosine(queryVector, pool, limit);
    },
    listCollection(collection) {
      return records.filter((record) => record.collection === collection);
    },
    async flush() {
      const snapshot: VectorStoreSnapshot = {
        version: "0.1",
        modelKey,
        records,
        updatedAt: new Date().toISOString(),
      };
      await writeJsonAtomic(path, snapshot);
    },
  };

  return store;
}

export function createMemoryVectorStore(modelKey: string, seed: VectorRecord[] = []): VectorStore {
  let records = [...seed];
  return {
    modelKey,
    async upsert(batch) {
      const byId = new Map(records.map((record) => [record.id, record]));
      for (const record of batch) {
        byId.set(record.id, record);
      }
      records = [...byId.values()];
    },
    async deleteCollection(collection) {
      records = records.filter((record) => record.collection !== collection);
    },
    async deleteBySourceKey(collection, sourceKey) {
      records = records.filter(
        (record) => !(record.collection === collection && record.sourceKey === sourceKey),
      );
    },
    async deleteByDocumentId(collection, documentId) {
      const prefix = `${documentId}:`;
      records = records.filter(
        (record) => !(record.collection === collection && record.sourceKey.startsWith(prefix)),
      );
    },
    search(collection, queryVector, limit) {
      const pool = records.filter((record) => record.collection === collection);
      return topKByCosine(queryVector, pool, limit);
    },
    listCollection(collection) {
      return records.filter((record) => record.collection === collection);
    },
    async flush() {
      // no-op
    },
  };
}

export function chatCollectionId(threadOwnerId: string): string {
  return `chat:${threadOwnerId}`;
}

export function vaultCollectionId(tier: "public" | "private" = "public"): string {
  return tier === "private" ? "vault:kb:private" : "vault:kb:public";
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = JSON.stringify(value, null, 2) + "\n";
  const tmp = join(dirname(path), `.rag-vectors.${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, payload, { mode: 0o600 });
    if (process.platform === "win32") {
      try {
        await unlink(path);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }
    }
    await rename(tmp, path);
  } catch (error) {
    try {
      await unlink(tmp);
    } catch {
      // best effort
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTFOUND";
  }
  return false;
}
