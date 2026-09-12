/**
 * Per-chat monotonic revision for `eh:timeline` updates and history resume.
 * In-memory only — process restart resets counters (clients re-fetch full history).
 */

const revisions = new Map<string, number>()

/** Allocate and return the next revision for `chatId` (starts at 1). */
export function nextEhTimelineRevision(chatId: string): number {
  const key = chatId.trim() || "__envoy_harness__"
  const next = (revisions.get(key) ?? 0) + 1
  revisions.set(key, next)
  return next
}

/** Current revision for `chatId` (0 if none emitted yet). */
export function currentEhTimelineRevision(chatId: string): number {
  const key = chatId.trim() || "__envoy_harness__"
  return revisions.get(key) ?? 0
}

/** Test helper — clear one chat or all counters. */
export function resetEhTimelineRevision(chatId?: string): void {
  if (chatId === undefined) {
    revisions.clear()
    return
  }
  revisions.delete(chatId.trim() || "__envoy_harness__")
}
