import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PublishedLibraryStore {
  loadDocumentIds(): Promise<Set<string>>;
  setPublished(documentId: string, published: boolean): Promise<void>;
}

export function createPublishedLibraryStore(profileDir: string): PublishedLibraryStore {
  const path = join(profileDir, "published-library.json");

  return {
    async loadDocumentIds(): Promise<Set<string>> {
      try {
        const raw = await readFile(path, "utf8");
        const j = JSON.parse(raw) as { documentIds?: string[] };
        return new Set(j.documentIds ?? []);
      } catch {
        return new Set();
      }
    },

    async setPublished(documentId: string, published: boolean): Promise<void> {
      const cur = await this.loadDocumentIds();
      if (published) {
        cur.add(documentId);
      } else {
        cur.delete(documentId);
      }
      await writeFile(
        path,
        `${JSON.stringify({ documentIds: [...cur].sort() }, null, 2)}\n`,
        { mode: 0o600 },
      );
    },
  };
}
