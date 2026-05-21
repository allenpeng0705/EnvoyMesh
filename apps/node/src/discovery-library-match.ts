import { buildVaultIndex } from "@envoymesh/vault";
import type { LibraryFileMatch } from "@envoymesh/protocol";
import type { PublishedExternalRecord } from "./published-external-store.js";

export async function matchPublishedLibraryDocuments(input: {
  vaultDir: string;
  publishedIds: Set<string>;
  fileTitleQuery?: string;
  contentHashPrefixes?: string[];
  maxResults: number;
  externalExports?: Map<string, PublishedExternalRecord>;
}): Promise<LibraryFileMatch[]> {
  const index = await buildVaultIndex({ rootDir: input.vaultDir });
  let docs = index.documents.filter((d) => input.publishedIds.has(d.documentId));

  const tq = input.fileTitleQuery?.trim().toLowerCase();
  if (tq) {
    docs = docs.filter(
      (d) => d.title.toLowerCase().includes(tq) || d.relativePath.toLowerCase().includes(tq),
    );
  }

  const prefs = input.contentHashPrefixes?.filter(Boolean) ?? [];
  if (prefs.length > 0) {
    docs = docs.filter((d) => prefs.some((p) => d.contentHash.toLowerCase().startsWith(p.toLowerCase())));
  }

  const exports = input.externalExports;

  return docs.slice(0, input.maxResults).map((d) => {
    const exportRecord = exports?.get(d.documentId);
    const cid =
      exportRecord && exportRecord.contentHash === d.contentHash ? exportRecord.cid : undefined;
    return {
      documentId: d.documentId,
      title: d.title,
      relativePath: d.relativePath,
      contentHash: d.contentHash,
      byteLength: d.byteLength,
      sensitivity: "public" as const,
      ...(cid ? { cid } : {}),
    };
  });
}
