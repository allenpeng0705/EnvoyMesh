/** Skip redundant pre-send verify when this peer was reachable recently. */
export const OUTBOUND_PEER_FRESHNESS_MS = 90_000;

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

/** Test helper */
export function resetOutboundPeerFreshnessForTests(): void {
  lastVerifiedAt.clear();
}
