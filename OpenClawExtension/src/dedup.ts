import { createHash } from "node:crypto";

const DEDUP_MAX = 200;
const dedupCache = new Map<string, number>();

export function isDuplicateInbound(ownerId: string, text: string): boolean {
  const key = createHash("sha256").update(`${ownerId}:${text}`).digest("hex");
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
