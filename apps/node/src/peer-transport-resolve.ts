import type { PeerDirectoryRecord } from "@envoymesh/local-store";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

export type PickLibp2pPeerOptions = {
  /** Prefer a libp2p row that is currently connected in the local mesh. */
  isConnected?: (peerId: string) => boolean;
};

/** Prefer a dialable libp2p row over a newer `envoy_*` envelope id for the same owner. */
export function pickBestLibp2pPeerDirectoryRecord(
  records: PeerDirectoryRecord[],
  ownerId: string,
  opts?: PickLibp2pPeerOptions,
): PeerDirectoryRecord | undefined {
  const matches = records.filter((r) => r.ownerId === ownerId && isLibp2pPeerId(r.peerId));
  if (matches.length === 0) {
    return undefined;
  }
  if (opts?.isConnected) {
    const connected = matches.filter((r) => opts.isConnected!(r.peerId));
    if (connected.length > 0) {
      return connected.reduce((a, b) => (a.lastSeenAt >= b.lastSeenAt ? a : b));
    }
  }
  return matches.reduce((a, b) => (a.lastSeenAt >= b.lastSeenAt ? a : b));
}
