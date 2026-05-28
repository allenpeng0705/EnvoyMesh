import { isLibp2pPeerId } from "./profile-sync-outbound.js";

export type PeerDirectoryRow = {
  ownerId: string;
  peerId: string;
  lastSeenAt: string;
  listenAddrs?: string[];
  devicePublicKeyPem?: string;
};

/** Prefer a dialable libp2p row over a newer `envoy_*` envelope id for the same owner. */
export function pickBestLibp2pPeerDirectoryRecord(
  records: PeerDirectoryRow[],
  ownerId: string,
): PeerDirectoryRow | undefined {
  const matches = records.filter((r) => r.ownerId === ownerId && isLibp2pPeerId(r.peerId));
  if (matches.length === 0) {
    return undefined;
  }
  return matches.reduce((a, b) => (a.lastSeenAt >= b.lastSeenAt ? a : b));
}
