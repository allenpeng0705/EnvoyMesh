/**
 * Local chat timeline helpers.
 *
 * Inbound chat bubbles are sorted by `metadata.timestamp`. That field used to
 * copy the sender's `envelope.createdAt` verbatim. When the peer clock is
 * ahead of ours, an inbound message can sort *after* our AI/auto reply that
 * was generated in response — so the reply appears above the message it
 * answers. Clamp to local receive time for ordering.
 */

/** ISO timestamp for local display/sort of an inbound chat message. */
export function chatLocalTimelineTimestamp(
  senderCreatedAt: string | undefined,
  receivedAtMs: number = Date.now(),
): string {
  const senderMs = typeof senderCreatedAt === "string" ? Date.parse(senderCreatedAt) : NaN;
  const clamped = Number.isFinite(senderMs) ? Math.min(senderMs, receivedAtMs) : receivedAtMs;
  return new Date(clamped).toISOString();
}
