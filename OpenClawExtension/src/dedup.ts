import { createHash, randomUUID } from "node:crypto";

const DEDUP_MAX = 500;
/** Time window for the legacy-bridge content-hash fallback. Catches retries
 *  of the same payload within a few seconds, but not legitimate user repeats. */
const LEGACY_FALLBACK_WINDOW_MS = 10_000;
const dedupCache = new Map<string, number>();
/** Content-hash fallback for legacy bridges (no messageId from bridge).
 *  Map keyed by sha256(ownerId:from:text), value is the timestamp of the
 *  first delivery. */
const legacyFallbackCache = new Map<string, number>();

/**
 * Mark a messageId as seen. Returns true if it was a fresh entry, false if it
 * was already present (i.e. this is a duplicate delivery from the bridge).
 */
export function isDuplicateInbound(messageId: string): boolean {
  const key = messageId.trim();
  if (!key) {
    return false;
  }
  if (dedupCache.has(key)) {
    return true;
  }
  if (dedupCache.size >= DEDUP_MAX) {
    const oldest = dedupCache.keys().next().value;
    if (oldest) {
      dedupCache.delete(oldest);
    }
  }
  dedupCache.set(key, Date.now());
  return false;
}

/**
 * Pre-mark a messageId as seen without consuming it. Useful when the bridge
 * declares the id up front (e.g. via a `X-EnvoyMesh-Message-Id` header) so
 * that the same delivery can never be processed twice even if the dedup
 * check races the dispatch.
 */
export function rememberInboundMessage(messageId: string): void {
  const key = messageId.trim();
  if (!key) {
    return;
  }
  if (dedupCache.has(key)) {
    return;
  }
  if (dedupCache.size >= DEDUP_MAX) {
    const oldest = dedupCache.keys().next().value;
    if (oldest) {
      dedupCache.delete(oldest);
    }
  }
  dedupCache.set(key, Date.now());
}

/**
 * Build a synthetic envelope id for legacy bridges that don't send one.
 * Each call returns a fresh id, so legacy-bridge retries will NOT be deduped
 * by `isDuplicateInbound` alone — callers should pair this with
 * `isLegacyDuplicateFallback()` to catch the typical 1–10s retry window.
 */
export function syntheticInboundMessageId(params: {
  fromOwnerId: string;
  from: string;
  text: string;
  timestamp: number;
}): string {
  const hash = createHash("sha256")
    .update(`${params.fromOwnerId}:${params.from}:${params.text}:${params.timestamp}`)
    .digest("hex")
    .slice(0, 16);
  return `synthetic-${params.timestamp.toString(36)}-${hash}-${randomUUID().slice(0, 8)}`;
}

function legacyFallbackKey(fromOwnerId: string, from: string, text: string): string {
  return createHash("sha256")
    .update(`${fromOwnerId}:${from}:${text}`)
    .digest("hex");
}

/**
 * Content-hash fallback for legacy bridges (no messageId from bridge).
 * Returns true if a delivery with the same (fromOwnerId, from, text) tuple
 * was seen within the last LEGACY_FALLBACK_WINDOW_MS. Catches retries but
 * does NOT drop legitimate user repeats after the window expires.
 */
export function isLegacyDuplicateFallback(params: {
  fromOwnerId: string;
  from: string;
  text: string;
  nowMs?: number;
}): boolean {
  const key = legacyFallbackKey(params.fromOwnerId, params.from, params.text);
  const now = params.nowMs ?? Date.now();
  const prev = legacyFallbackCache.get(key);
  if (prev !== undefined && now - prev < LEGACY_FALLBACK_WINDOW_MS) {
    return true;
  }
  if (legacyFallbackCache.size >= DEDUP_MAX) {
    const oldest = legacyFallbackCache.keys().next().value;
    if (oldest) {
      legacyFallbackCache.delete(oldest);
    }
  }
  legacyFallbackCache.set(key, now);
  return false;
}

const asyncDedupCache = new Map<string, number>();

export function isDuplicateAsyncInbound(messageId: string): boolean {
  const key = messageId.trim();
  if (!key) {
    return false;
  }
  if (asyncDedupCache.has(key)) {
    return true;
  }
  if (asyncDedupCache.size >= DEDUP_MAX) {
    const oldest = asyncDedupCache.keys().next().value;
    if (oldest) {
      asyncDedupCache.delete(oldest);
    }
  }
  asyncDedupCache.set(key, Date.now());
  return false;
}

export function resetInboundDedupForTests(): void {
  dedupCache.clear();
  asyncDedupCache.clear();
  legacyFallbackCache.clear();
}
