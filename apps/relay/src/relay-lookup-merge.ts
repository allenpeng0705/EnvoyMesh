/**
 * Prefer dialable relay.lookup candidates when merging local + forwarded hits.
 */
import type { RelayPeerCandidate } from "@envoymesh/protocol";

/** Higher = more useful for circuit dial / auto-bond. */
export function relayPeerHoppabilityScore(peer: RelayPeerCandidate): number {
  let score = 0;
  if (peer.hasHopSlot === true) score += 4;
  else if (peer.hasHopSlot === false) score -= 2;
  if (peer.multiaddrs.length > 0) score += 2;
  return score;
}

export function preferRelayPeerCandidate(
  existing: RelayPeerCandidate,
  incoming: RelayPeerCandidate,
): RelayPeerCandidate {
  return relayPeerHoppabilityScore(incoming) > relayPeerHoppabilityScore(existing)
    ? incoming
    : existing;
}
