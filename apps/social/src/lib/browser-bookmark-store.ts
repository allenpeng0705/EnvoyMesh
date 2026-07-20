/**
 * Phase 45B — bookmark persistence for the Browser view.
 *
 * Stored in localStorage keyed by owner so multi-profile Social sessions
 * stay isolated. See docs/web-content-browsing-design.md §7.2.
 */

import { loadFromStorage, saveToStorage } from "./storage.js";

const STORAGE_PREFIX = "envoymesh.browser.bookmarks:";

export interface BrowserBookmark {
  url: string;
  title: string;
  createdAt: string;
}

interface BrowserBookmarkFile {
  version: "0.1";
  entries: BrowserBookmark[];
}

function storageKey(ownerId: string): string {
  return STORAGE_PREFIX + ownerId.trim();
}

export function loadBrowserBookmarks(ownerId: string): BrowserBookmark[] {
  const id = ownerId.trim();
  if (!id) return [];
  const file = loadFromStorage<BrowserBookmarkFile>(storageKey(id), {
    version: "0.1",
    entries: [],
  });
  if (file.version !== "0.1" || !Array.isArray(file.entries)) return [];
  return file.entries;
}

function persist(ownerId: string, entries: BrowserBookmark[]): void {
  const id = ownerId.trim();
  if (!id) return;
  saveToStorage(storageKey(id), { version: "0.1", entries } satisfies BrowserBookmarkFile);
}

export function isBookmarked(ownerId: string, url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return loadBrowserBookmarks(ownerId).some((b) => b.url === trimmed);
}

/** Add or update a bookmark. Returns the new list. */
export function addBrowserBookmark(
  ownerId: string,
  url: string,
  title?: string,
): BrowserBookmark[] {
  const trimmed = url.trim();
  if (!trimmed || !ownerId.trim()) return loadBrowserBookmarks(ownerId);
  const prev = loadBrowserBookmarks(ownerId).filter((b) => b.url !== trimmed);
  const entry: BrowserBookmark = {
    url: trimmed,
    title: title?.trim() || trimmed,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...prev];
  persist(ownerId, next);
  return next;
}

/** Remove a bookmark by URL. Returns the new list. */
export function removeBrowserBookmark(ownerId: string, url: string): BrowserBookmark[] {
  const trimmed = url.trim();
  const next = loadBrowserBookmarks(ownerId).filter((b) => b.url !== trimmed);
  persist(ownerId, next);
  return next;
}

/** Toggle bookmark; returns `{ bookmarked, entries }`. */
export function toggleBrowserBookmark(
  ownerId: string,
  url: string,
  title?: string,
): { bookmarked: boolean; entries: BrowserBookmark[] } {
  if (isBookmarked(ownerId, url)) {
    return { bookmarked: false, entries: removeBrowserBookmark(ownerId, url) };
  }
  return { bookmarked: true, entries: addBrowserBookmark(ownerId, url, title) };
}

/** Autocomplete from bookmarks matching a typed prefix. */
export function suggestBrowserBookmarks(
  ownerId: string,
  query: string,
  limit = 8,
): BrowserBookmark[] {
  const q = query.trim().toLowerCase();
  const all = loadBrowserBookmarks(ownerId);
  if (!q) return all.slice(0, limit);
  return all
    .filter((b) => b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q))
    .slice(0, limit);
}
