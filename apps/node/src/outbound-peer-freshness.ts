/** Skip redundant pre-send verify when this peer was reachable recently. */
export const OUTBOUND_PEER_FRESHNESS_MS = 45_000;

const lastVerifiedAt = new Map<string, number>();

export function markOutboundPeerVerified(transportPeerId: string, at = Date.now()): void {
  lastVerifiedAt.set(transportPeerId, at);
}

export function clearOutboundPeerFreshness(transportPeerId: string): void {
  lastVerifiedAt.delete(transportPeerId);
}

export function isOutboundPeerRecentlyVerified(
  transportPeerId: string,
  maxAgeMs = OUTBOUND_PEER_FRESHNESS_MS,
  now = Date.now(),
): boolean {
  const at = lastVerifiedAt.get(transportPeerId);
  return at !== undefined && now - at < maxAgeMs;
}

/**
 * Drop freshness entries older than maxAgeMs (default 2× freshness window).
 * Returns number of entries removed.
 */
export function pruneOutboundPeerFreshness(
  maxAgeMs = OUTBOUND_PEER_FRESHNESS_MS * 2,
  now = Date.now(),
): number {
  const cutoff = now - maxAgeMs;
  let pruned = 0;
  for (const [peerId, at] of lastVerifiedAt) {
    if (at < cutoff) {
      lastVerifiedAt.delete(peerId);
      pruned++;
    }
  }
  return pruned;
}

/** Test helper */
export function resetOutboundPeerFreshnessForTests(): void {
  lastVerifiedAt.clear();
}
