import type { LibraryItem, LocalFileItem, LocalFileSource, NodeService } from "@envoymesh/api";

function normalizeVaultRelativePath(relativePath: string): string {
  return relativePath.trim().replace(/^\/+/, "");
}

/** Chat attachments (`chat/out/…`, `chat/in/…`) — belong in chat only, not My Files. */
export function isChatAttachmentFile(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return p === "chat" || p.startsWith("chat/");
}

/**
 * Profile avatar / gallery blobs (`profile/thumbnail.*`, `profile/gallery/…`).
 * Managed from Profile UI — not document library entries.
 */
export function isProfileMediaFile(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return p === "profile" || p.startsWith("profile/");
}

/** Paths that should not appear in My Files / Library lists. */
export function isHiddenFromLibraryList(relativePath: string): boolean {
  return isChatAttachmentFile(relativePath) || isProfileMediaFile(relativePath);
}

/** @deprecated Prefer {@link isChatAttachmentFile} — voice notes are a subset of chat attachments. */
export function isChatVoiceNoteFile(relativePath: string): boolean {
  return isChatAttachmentFile(relativePath) && /(^|\/)voice-note\.(webm|m4a|wav)$/i.test(relativePath.trim());
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

export type LocalFileOpenNodeService = Pick<
  NodeService,
  "readLocalFileContent" | "openLocalFile" | "openLibraryItem" | "readLibraryItemContent"
>;
