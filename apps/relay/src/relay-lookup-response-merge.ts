/**
 * Shared merge for local + forwarded relay.lookup responses (Phase 46B).
 */
import type {
  RelayHint,
  RelayLookupPayload,
  RelayLookupResponsePayload,
  RelayPeerCandidate,
} from "@envoymesh/protocol";
import { preferRelayPeerCandidate } from "./relay-lookup-merge.js";

export function mergeRelayLookupResponses(
  payload: RelayLookupPayload,
  responses: RelayLookupResponsePayload[],
): RelayLookupResponsePayload {
  const peers = new Map<string, RelayPeerCandidate>();
  const hints = new Map<string, RelayHint>();
  let truncated = false;
  for (const response of responses) {
    truncated = truncated || response.truncated;
    for (const peer of response.peers) {
      const key = peer.peerId || peer.multiaddrs.join(",");
      const existing = peers.get(key);
      if (!existing) peers.set(key, peer);
      else peers.set(key, preferRelayPeerCandidate(existing, peer));
    }
    for (const hint of response.relayHints) {
      const key = hint.relayId || hint.multiaddrs.join(",");
      if (key && !hints.has(key)) {
        hints.set(key, {
          ...hint,
          multiaddrs: [...new Set(hint.multiaddrs.map((a) => a.trim()).filter(Boolean))],
        });
      }
    }
  }
  const cappedPeers = [...peers.values()].slice(0, payload.maxResults);
  return {
    queryId: payload.queryId,
    peers: cappedPeers,
    relayHints: [...hints.values()].slice(0, payload.maxResults),
    truncated: truncated || peers.size > cappedPeers.length,
    expiresAt: payload.expiresAt,
  };
}
