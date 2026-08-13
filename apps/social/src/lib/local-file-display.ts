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

/** Browse filter for Knowledge → Browse. */
export type KnowledgeBrowseFilter =
  | "all"
  | "notes"
  | "documents"
  | "published"
  | "obsidian"
  | "notion"
  | "blog";

export function isKnowledgeNotesPath(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath).toLowerCase();
  return p === "notes" || p.startsWith("notes/");
}

/** Saved Notion/MCP write-back notes (`notes/mcp/…`). */
export function isKnowledgeNotionPath(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath).toLowerCase();
  return p === "notes/mcp" || p.startsWith("notes/mcp/");
}

/** Blog mirrors materialized under `notes/imports/blog/`. */
export function isKnowledgeBlogPath(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath).toLowerCase();
  return p === "notes/imports/blog" || p.startsWith("notes/imports/blog/");
}

/**
 * Obsidian-managed vault notes: under `notes/` but not MCP write-back or blog mirrors.
 * Also includes read-only linked Obsidian vault overlays (`linked-obsidian/…`).
 */
export function isKnowledgeObsidianPath(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath).toLowerCase();
  if (p === "linked-obsidian" || p.startsWith("linked-obsidian/")) return true;
  return (
    isKnowledgeNotesPath(relativePath) &&
    !isKnowledgeNotionPath(relativePath) &&
    !isKnowledgeBlogPath(relativePath)
  );
}

/** Non-notes vault files (originals under documents/, inbox, etc.). */
export function isKnowledgeDocumentsPath(relativePath: string): boolean {
  return !isKnowledgeNotesPath(relativePath);
}

export type KnowledgeBrowseSource = "notion" | "obsidian" | "blog" | "document";

export function knowledgeBrowseSource(
  relativePath: string,
): KnowledgeBrowseSource {
  if (isKnowledgeNotionPath(relativePath)) return "notion";
  if (isKnowledgeBlogPath(relativePath)) return "blog";
  if (isKnowledgeNotesPath(relativePath)) return "obsidian";
  return "document";
}

export function matchesKnowledgeBrowseFilter(
  item: { relativePath: string; published?: boolean },
  filter: KnowledgeBrowseFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "notes") return isKnowledgeNotesPath(item.relativePath);
  if (filter === "documents") return isKnowledgeDocumentsPath(item.relativePath);
  if (filter === "published") return item.published === true;
  if (filter === "obsidian") return isKnowledgeObsidianPath(item.relativePath);
  if (filter === "notion") return isKnowledgeNotionPath(item.relativePath);
  if (filter === "blog") return isKnowledgeBlogPath(item.relativePath);
  return true;
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
