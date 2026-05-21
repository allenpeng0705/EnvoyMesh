import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PublishedExternalRecord {
  exportRevision: number;
  exportedAt: string;
  cid: string;
  ipfsInteropRecipe: string;
  kuboVersion: string;
  /** Vault content hash at export time (staleness detection). */
  contentHash: string;
}

interface PublishedExternalFile {
  version: "0.1";
  exports: Record<string, PublishedExternalRecord>;
}

export interface PublishedExternalStore {
  loadAll(): Promise<Map<string, PublishedExternalRecord>>;
  get(documentId: string): Promise<PublishedExternalRecord | undefined>;
  recordExport(
    documentId: string,
    fields: Pick<PublishedExternalRecord, "cid" | "ipfsInteropRecipe" | "kuboVersion" | "contentHash">,
  ): Promise<PublishedExternalRecord>;
}

export function createPublishedExternalStore(profileDir: string): PublishedExternalStore {
  const path = join(profileDir, "published-external.json");

  async function readFileState(): Promise<PublishedExternalFile> {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Partial<PublishedExternalFile>;
      if (parsed.version !== "0.1" || typeof parsed.exports !== "object" || parsed.exports === null) {
        return { version: "0.1", exports: {} };
      }
      return { version: "0.1", exports: parsed.exports };
    } catch {
      return { version: "0.1", exports: {} };
    }
  }

  async function writeFileState(state: PublishedExternalFile): Promise<void> {
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }

  return {
    async loadAll() {
      const state = await readFileState();
      return new Map(Object.entries(state.exports));
    },

    async get(documentId) {
      const state = await readFileState();
      return state.exports[documentId];
    },

    async recordExport(documentId, fields) {
      const state = await readFileState();
      const prev = state.exports[documentId];
      const record: PublishedExternalRecord = {
        exportRevision: (prev?.exportRevision ?? 0) + 1,
        exportedAt: new Date().toISOString(),
        ...fields,
      };
      state.exports[documentId] = record;
      await writeFileState(state);
      return record;
    },
  };
}
