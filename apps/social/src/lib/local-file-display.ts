import type { LibraryItem, LocalFileItem, LocalFileSource, NodeService } from "@envoymesh/api";

export function localFileRowKey(item: LocalFileItem): string {
  return `${item.source}:${item.relativePath}`;
}

export function vaultLibraryItemFromLocalFile(item: LocalFileItem): LibraryItem | null {
  if (item.source !== "vault" || !item.documentId || !item.contentHash) {
    return null;
  }
  return {
    documentId: item.documentId,
    relativePath: item.relativePath,
    title: item.title,
    extension: item.extension,
    byteLength: item.byteLength,
    contentHash: item.contentHash,
    updatedAt: item.updatedAt,
    published: item.published ?? false,
    publishedExternal: item.publishedExternal,
  };
}

export type LocalFileOpenNodeService = Pick<
  NodeService,
  "readLocalFileContent" | "openLocalFile" | "openLibraryItem" | "readLibraryItemContent"
>;
