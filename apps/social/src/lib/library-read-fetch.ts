/**
 * Phase 45B — Browser fetch helper for `library.read`.
 *
 * Handles:
 *   - Normal single-shot reads
 *   - Auto range assembly when the server returns `too_large`
 *   - If-None-Match revalidation (returns cached body on `not_modified`)
 */

import type { LibraryReadParams, LibraryReadResult } from "@envoymesh/api";

/**
 * Chunk size for range requests. Must stay under the server binary body cap
 * (`MAX_LIBRARY_READ_BINARY_BYTES` = 40 KiB in `library-read-inbound.ts`)
 * so base64 framing still fits the 64 KiB envelope guard.
 */
export const LIBRARY_READ_CHUNK_BYTES = 40 * 1024;

export type LibraryReadFn = (params: LibraryReadParams) => Promise<LibraryReadResult>;

export interface BrowserFetchCacheEntry {
  body: string;
  contentType: string;
  contentHash: string;
  etag: string;
  byteLength: number;
  isText: boolean;
}

export interface BrowserFetchResult {
  status: "ok" | "not_found" | "forbidden" | "not_modified" | "error";
  body?: string;
  contentType?: string;
  contentHash?: string;
  etag?: string;
  byteLength?: number;
  isText?: boolean;
  error?: string;
  /** True when the body was kept from cache after not_modified. */
  fromCache?: boolean;
}

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json";
}

function concatBase64Chunks(chunks: string[]): string {
  const parts = chunks.map((c) => {
    const bin = atob(c);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  });
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.byteLength;
  }
  let s = "";
  for (let i = 0; i < merged.length; i++) s += String.fromCharCode(merged[i]!);
  return btoa(s);
}

/**
 * Fetch a library path, automatically chunking when the server reports too_large.
 * Pass `cache` + set `revalidate: true` on Reload to send If-None-Match.
 */
export async function fetchLibraryContent(
  libraryRead: LibraryReadFn,
  input: {
    targetOwnerId: string;
    path: string;
    cache?: BrowserFetchCacheEntry | null;
    revalidate?: boolean;
  },
): Promise<BrowserFetchResult> {
  const ifNoneMatch =
    input.revalidate && input.cache?.etag ? input.cache.etag : undefined;

  const first = await libraryRead({
    targetOwnerId: input.targetOwnerId,
    path: input.path,
    ifNoneMatch,
  });

  if (first.status === "not_modified" && input.cache) {
    return {
      status: "ok",
      body: input.cache.body,
      contentType: input.cache.contentType,
      contentHash: input.cache.contentHash,
      etag: input.cache.etag,
      byteLength: input.cache.byteLength,
      isText: input.cache.isText,
      fromCache: true,
    };
  }

  if (first.status === "not_found" || first.status === "forbidden") {
    return { status: first.status, error: first.error };
  }

  if (first.status === "ok" && first.body !== undefined && first.contentType) {
    return {
      status: "ok",
      body: first.body,
      contentType: first.contentType,
      contentHash: first.contentHash,
      etag: first.etag,
      byteLength: first.byteLength ?? first.body.length,
      isText: isTextMime(first.contentType),
    };
  }

  if (first.status === "too_large") {
    const total = first.byteLength;
    if (!total || total <= 0) {
      return { status: "error", error: "too_large without byteLength" };
    }
    const contentType = first.contentType ?? "application/octet-stream";
    const text = isTextMime(contentType);
    // Range responses are always base64 (server-side) to avoid mid-UTF-8 splits.
    const chunks: string[] = [];
    let start = 0;
    while (start < total) {
      const end = Math.min(start + LIBRARY_READ_CHUNK_BYTES - 1, total - 1);
      const part = await libraryRead({
        targetOwnerId: input.targetOwnerId,
        path: input.path,
        range: { start, end },
      });
      if (part.status !== "ok" || part.body === undefined) {
        return {
          status: "error",
          error: part.error ?? `range fetch failed at ${start}-${end} (${part.status})`,
        };
      }
      chunks.push(part.body);
      start = end + 1;
    }
    const mergedB64 = concatBase64Chunks(chunks);
    const body = text
      ? new TextDecoder().decode(
          Uint8Array.from(atob(mergedB64), (c) => c.charCodeAt(0)),
        )
      : mergedB64;
    return {
      status: "ok",
      body,
      contentType,
      contentHash: first.contentHash,
      etag: first.etag,
      byteLength: total,
      isText: text,
    };
  }

  return {
    status: "error",
    error: first.error ?? `unexpected status ${first.status}`,
  };
}
