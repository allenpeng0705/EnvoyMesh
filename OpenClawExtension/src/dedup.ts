import { createHash, randomUUID } from "node:crypto";

const DEDUP_MAX = 500;
const dedupCache = new Map<string, number>();

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
 * Build a synthetic envelope id for legacy bridges that don't send one. The
 * result is prefixed so callers can tell synthetic ids apart from real ones
 * if they need to.
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
}
