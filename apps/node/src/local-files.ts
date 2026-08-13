import type { LibraryItem, ListAllLocalFilesResult, LocalFileItem } from "@envoymesh/api";
import type { WorkspaceFileItem } from "./openclaw-workspace-files.js";

export function mapVaultItemToLocalFile(item: LibraryItem): LocalFileItem {
  return {
    source: "vault",
    relativePath: item.relativePath,
    title: item.title,
    extension: item.extension,
    byteLength: item.byteLength,
    updatedAt: item.updatedAt,
    documentId: item.documentId,
    contentHash: item.contentHash,
    published: item.published,
    publishedExternal: item.publishedExternal,
  };
}

export function mapWorkspaceItemToLocalFile(item: WorkspaceFileItem): LocalFileItem {
  return {
    source: "workspace",
    relativePath: item.relativePath,
    title: item.title,
    extension: item.extension,
    byteLength: item.byteLength,
    updatedAt: item.updatedAt,
  };
}

export function buildAllLocalFilesList(params: {
  vaultItems: LibraryItem[];
  workspaceItems: WorkspaceFileItem[];
  linkedObsidianItems?: LocalFileItem[];
}): ListAllLocalFilesResult {
  const linked = params.linkedObsidianItems ?? [];
  const items = [
    ...params.vaultItems.map(mapVaultItemToLocalFile),
    ...params.workspaceItems.map(mapWorkspaceItemToLocalFile),
    ...linked,
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return {
    items,
    vaultCount: params.vaultItems.length,
    workspaceCount: params.workspaceItems.length,
  };
}

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
