import type { PeerDirectoryRecord } from "@envoymesh/local-store";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

/** Prefer a dialable libp2p row over a newer `envoy_*` envelope id for the same owner. */
export function pickBestLibp2pPeerDirectoryRecord(
  records: PeerDirectoryRecord[],
  ownerId: string,
): PeerDirectoryRecord | undefined {
  const matches = records.filter((r) => r.ownerId === ownerId && isLibp2pPeerId(r.peerId));
  if (matches.length === 0) {
    return undefined;
  }
  return matches.reduce((a, b) => (a.lastSeenAt >= b.lastSeenAt ? a : b));
}
