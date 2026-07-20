/**
 * Phase 45B — in-session navigation history for the Browser view.
 *
 * Back/forward stack lives in memory for the current Social session.
 * A separate recent-URL list persists to localStorage for address-bar
 * autocomplete (capped, scoped per owner). Mirrors docs/web-content-browsing-design.md §7.2.
 */

import { loadFromStorage, saveToStorage } from "./storage.js";

const RECENT_STORAGE_PREFIX = "envoymesh.browser.recent:";
const MAX_RECENT = 50;

export interface BrowserRecentEntry {
  url: string;
  /** Optional title captured from the page (markdown h1 / filename). */
  title?: string;
  visitedAt: string;
}

interface BrowserRecentFile {
  version: "0.1";
  entries: BrowserRecentEntry[];
}

/** Mutable in-session back/forward stack. */
export interface BrowserNavStack {
  /** URLs in visit order. */
  entries: string[];
  /** Current position in `entries` (0-based). */
  index: number;
}

function recentKey(ownerId: string): string {
  return RECENT_STORAGE_PREFIX + ownerId.trim();
}

export function createEmptyNavStack(): BrowserNavStack {
  return { entries: [], index: -1 };
}

/**
 * Push a URL onto the stack. Truncates any forward entries (browser semantics).
 * No-ops if the URL equals the current entry (reload / duplicate).
 */
export function pushNav(stack: BrowserNavStack, url: string): BrowserNavStack {
  const trimmed = url.trim();
  if (!trimmed) return stack;
  if (stack.index >= 0 && stack.entries[stack.index] === trimmed) {
    return stack;
  }
  const entries = [...stack.entries.slice(0, stack.index + 1), trimmed];
  return { entries, index: entries.length - 1 };
}

export function canGoBack(stack: BrowserNavStack): boolean {
  return stack.index > 0;
}

export function canGoForward(stack: BrowserNavStack): boolean {
  return stack.index >= 0 && stack.index < stack.entries.length - 1;
}

export function goBack(stack: BrowserNavStack): { stack: BrowserNavStack; url: string } | null {
  if (!canGoBack(stack)) return null;
  const index = stack.index - 1;
  return { stack: { ...stack, index }, url: stack.entries[index]! };
}

export function goForward(stack: BrowserNavStack): { stack: BrowserNavStack; url: string } | null {
  if (!canGoForward(stack)) return null;
  const index = stack.index + 1;
  return { stack: { ...stack, index }, url: stack.entries[index]! };
}

export function currentNavUrl(stack: BrowserNavStack): string | undefined {
  if (stack.index < 0) return undefined;
  return stack.entries[stack.index];
}

/** Load persisted recent URLs (for autocomplete). Scoped per owner. */
export function loadBrowserRecent(ownerId: string): BrowserRecentEntry[] {
  const id = ownerId.trim();
  if (!id) return [];
  const file = loadFromStorage<BrowserRecentFile>(recentKey(id), {
    version: "0.1",
    entries: [],
  });
  if (file.version !== "0.1" || !Array.isArray(file.entries)) return [];
  return file.entries;
}

/** Record a successful visit; newest first; dedupes by URL. */
export function recordBrowserRecent(
  ownerId: string,
  url: string,
  title?: string,
): BrowserRecentEntry[] {
  const id = ownerId.trim();
  const trimmed = url.trim();
  if (!id || !trimmed) return loadBrowserRecent(ownerId);
  const now = new Date().toISOString();
  const prev = loadBrowserRecent(id).filter((e) => e.url !== trimmed);
  const next: BrowserRecentEntry[] = [
    { url: trimmed, title: title?.trim() || undefined, visitedAt: now },
    ...prev,
  ].slice(0, MAX_RECENT);
  saveToStorage(recentKey(id), { version: "0.1", entries: next } satisfies BrowserRecentFile);
  return next;
}

/** Autocomplete suggestions matching a typed prefix (case-insensitive). */
export function suggestBrowserUrls(
  ownerId: string,
  query: string,
  limit = 8,
): BrowserRecentEntry[] {
  const q = query.trim().toLowerCase();
  const recent = loadBrowserRecent(ownerId);
  if (!q) return recent.slice(0, limit);
  return recent
    .filter((e) => e.url.toLowerCase().includes(q) || e.title?.toLowerCase().includes(q))
    .slice(0, limit);
}
