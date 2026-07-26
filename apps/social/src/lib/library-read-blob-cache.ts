/**
 * Session-scoped library.read cache for images/files.
 * Avoids re-downloading the same envoy:// path while scrolling Feed / PhotoWall.
 *
 * Keyed by ownerId + path; validated with etag/contentHash via If-None-Match.
 *
 * LRU drops cached *bodies* after MAX_ENTRIES, but never revokes blob URLs still
 * held by the UI — revoke only when the same key is replaced with new bytes,
 * or on explicit clear.
 */

import {
  fetchLibraryContent,
  type BrowserFetchCacheEntry,
  type BrowserFetchResult,
  type LibraryReadFn,
} from "./library-read-fetch.js";

const MAX_ENTRIES = 64;
/** Skip network revalidate if the same path was confirmed this recently. */
const FRESH_TTL_MS = 60_000;

export interface LibraryReadBlobCacheEntry extends BrowserFetchCacheEntry {
  blobUrl?: string;
  cachedAt: number;
}

type CacheRow = {
  entry: LibraryReadBlobCacheEntry;
  /** LRU order — higher = more recently used. */
  touch: number;
};

type DetachedBlob = {
  blobUrl: string;
  contentHash: string;
};

const store = new Map<string, CacheRow>();
/**
 * Blob URLs detached from the LRU map so eviction cannot blank tiles still
 * rendered with that object URL. Cleared on explicit cache clear or when the
 * same key is replaced with different content.
 */
const detachedBlobs = new Map<string, DetachedBlob>();
let touchSeq = 0;

export function libraryReadCacheKey(ownerId: string, path: string): string {
  return `${ownerId.trim()}\0${path.replace(/^\/+/, "").trim()}`;
}

function base64ToBlobUrl(body: string, mimeType: string): string {
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  const ab = new ArrayBuffer(out.byteLength);
  new Uint8Array(ab).set(out);
  return URL.createObjectURL(new Blob([ab], { type: mimeType }));
}

function revokeQuiet(url: string | undefined): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

function touchRow(key: string, row: CacheRow): void {
  row.touch = ++touchSeq;
  store.set(key, row);
}

function evictIfNeeded(): void {
  while (store.size > MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestTouch = Infinity;
    for (const [k, row] of store) {
      if (row.touch < oldestTouch) {
        oldestTouch = row.touch;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    const doomed = store.get(oldestKey);
    if (doomed?.entry.blobUrl) {
      detachedBlobs.set(oldestKey, {
        blobUrl: doomed.entry.blobUrl,
        contentHash: doomed.entry.contentHash,
      });
    }
    store.delete(oldestKey);
  }
}

function putEntry(key: string, result: BrowserFetchResult): LibraryReadBlobCacheEntry | undefined {
  if (result.status !== "ok" || !result.body || !result.contentType) return undefined;
  const prev = store.get(key)?.entry;
  const detached = detachedBlobs.get(key);
  const newHash = result.contentHash ?? "";
  const wantMedia =
    result.contentType.startsWith("image/") || result.contentType.startsWith("audio/");

  let blobUrl: string | undefined;
  if (wantMedia) {
    if (prev?.blobUrl && prev.contentHash && prev.contentHash === newHash) {
      blobUrl = prev.blobUrl;
    } else if (detached && detached.contentHash === newHash) {
      blobUrl = detached.blobUrl;
      detachedBlobs.delete(key);
    } else {
      blobUrl = base64ToBlobUrl(result.body, result.contentType);
      if (prev?.blobUrl && prev.blobUrl !== blobUrl) revokeQuiet(prev.blobUrl);
      if (detached && detached.blobUrl !== blobUrl) {
        revokeQuiet(detached.blobUrl);
        detachedBlobs.delete(key);
      }
    }
  } else {
    if (prev?.blobUrl) revokeQuiet(prev.blobUrl);
    if (detached) {
      revokeQuiet(detached.blobUrl);
      detachedBlobs.delete(key);
    }
  }

  const entry: LibraryReadBlobCacheEntry = {
    body: result.body,
    contentType: result.contentType,
    contentHash: newHash,
    etag: result.etag ?? newHash.slice(0, 16),
    byteLength: result.byteLength ?? result.body.length,
    isText: Boolean(result.isText),
    blobUrl,
    cachedAt: Date.now(),
  };
  touchRow(key, { entry, touch: 0 });
  evictIfNeeded();
  return entry;
}

/** Peek without network. Returns blob URL when present (including detached after LRU). */
export function peekLibraryReadBlobUrl(ownerId: string, path: string): string | undefined {
  const key = libraryReadCacheKey(ownerId, path);
  const row = store.get(key);
  if (row?.entry.blobUrl) {
    touchRow(key, row);
    return row.entry.blobUrl;
  }
  return detachedBlobs.get(key)?.blobUrl;
}

/**
 * Fetch with shared cache. Fresh hits skip the network for FRESH_TTL_MS.
 * Otherwise revalidates with If-None-Match when an etag is known.
 */
export async function fetchLibraryContentCached(
  libraryRead: LibraryReadFn,
  input: {
    targetOwnerId: string;
    path: string;
    /** Force If-None-Match even within TTL (e.g. explicit reload). */
    revalidate?: boolean;
  },
): Promise<BrowserFetchResult & { blobUrl?: string; fromCache?: boolean }> {
  const key = libraryReadCacheKey(input.targetOwnerId, input.path);
  const cached = store.get(key)?.entry;
  const fresh =
    cached &&
    !input.revalidate &&
    Date.now() - cached.cachedAt < FRESH_TTL_MS;

  if (fresh && cached) {
    touchRow(key, store.get(key)!);
    return {
      status: "ok",
      body: cached.body,
      contentType: cached.contentType,
      contentHash: cached.contentHash,
      etag: cached.etag,
      byteLength: cached.byteLength,
      isText: cached.isText,
      blobUrl: cached.blobUrl,
      fromCache: true,
    };
  }

  const result = await fetchLibraryContent(libraryRead, {
    targetOwnerId: input.targetOwnerId,
    path: input.path,
    cache: cached ?? null,
    revalidate: Boolean(cached?.etag),
  });

  if (result.status === "ok" && result.fromCache && cached) {
    const entry: LibraryReadBlobCacheEntry = {
      ...cached,
      cachedAt: Date.now(),
    };
    touchRow(key, { entry, touch: 0 });
    return { ...result, blobUrl: entry.blobUrl, fromCache: true };
  }

  if (result.status === "ok") {
    const entry = putEntry(key, result);
    return { ...result, blobUrl: entry?.blobUrl, fromCache: false };
  }

  return result;
}

/** Test helper — clear all cached entries (revokes blob URLs). */
export function clearLibraryReadBlobCache(): void {
  for (const row of store.values()) {
    revokeQuiet(row.entry.blobUrl);
  }
  for (const row of detachedBlobs.values()) {
    revokeQuiet(row.blobUrl);
  }
  store.clear();
  detachedBlobs.clear();
  touchSeq = 0;
}

/** Test helper. */
export function libraryReadBlobCacheSize(): number {
  return store.size;
}

/** Test helper — detached blob URLs surviving LRU eviction. */
export function libraryReadDetachedBlobCount(): number {
  return detachedBlobs.size;
}
