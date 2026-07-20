import { buildVaultIndex } from "@envoymesh/vault";
import type { LibraryFileMatch } from "@envoymesh/protocol";
import type { PublishedExternalRecord } from "./published-external-store.js";
import type { WebContentEntry } from "./web-content-store.js";

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

/**
 * Phase 45 — match web-content.json manifest entries for discovery responses.
 *
 * Filters by title / path / urlSlug / kind / tags (substring) and optional
 * contentHash prefixes. Only entries whose visibility is in `allowedVisibility`
 * are returned (callers pass `["public"]` for strangers, or include `bonded`
 * for direct/referred peers).
 */
export function matchWebContentEntries(input: {
  entries: readonly WebContentEntry[];
  fileTitleQuery?: string;
  contentHashPrefixes?: string[];
  maxResults: number;
  /** Visibility values the requester is allowed to see in listings. */
  allowedVisibility: ReadonlyArray<WebContentEntry["visibility"]>;
  /** When set, contacts-visibility entries are only included if this owner is in contactIds. */
  requesterOwnerId?: string;
}): LibraryFileMatch[] {
  const allowed = new Set(input.allowedVisibility);
  let entries = input.entries.filter((e) => {
    if (!allowed.has(e.visibility)) return false;
    if (e.visibility === "contacts") {
      if (!input.requesterOwnerId) return false;
      return Boolean(e.contactIds?.includes(input.requesterOwnerId));
    }
    return true;
  });

  const tq = input.fileTitleQuery?.trim().toLowerCase();
  if (tq) {
    entries = entries.filter((e) => {
      if (e.title.toLowerCase().includes(tq)) return true;
      if (e.path.toLowerCase().includes(tq)) return true;
      if (e.urlSlug?.toLowerCase().includes(tq)) return true;
      if (e.kind.toLowerCase().includes(tq)) return true;
      if (e.tags?.some((tag) => tag.toLowerCase().includes(tq))) return true;
      if (e.summary?.toLowerCase().includes(tq)) return true;
      return false;
    });
  }

  const prefs = input.contentHashPrefixes?.filter(Boolean) ?? [];
  if (prefs.length > 0) {
    entries = entries.filter((e) =>
      prefs.some((p) => e.contentHash.toLowerCase().startsWith(p.toLowerCase())),
    );
  }

  return entries.slice(0, input.maxResults).map((e) => ({
    documentId: `web:${e.path}`,
    title: e.title,
    relativePath: e.path,
    contentHash: e.contentHash,
    byteLength: e.byteLength,
    sensitivity:
      e.visibility === "public"
        ? ("public" as const)
        : e.visibility === "private"
          ? ("private" as const)
          : ("friends" as const),
    kind: e.kind,
    mimeType: e.mimeType,
    summary: e.summary,
    visibility: e.visibility,
    urlSlug: e.urlSlug,
    updatedAt: e.updatedAt,
  }));
}
