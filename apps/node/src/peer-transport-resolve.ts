import type { PeerDirectoryRecord } from "@envoymesh/local-store";
import { derivePeerId } from "@envoymesh/identity";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

export type PickLibp2pPeerOptions = {
  /** Prefer a libp2p row that is currently connected in the local mesh. */
  isConnected?: (peerId: string) => boolean;
};

/**
 * Device envelope peer id for chat.message — must match the contact's device key,
 * not whichever libp2p transport row happens to be connected.
 */
export function resolveRecipientEnvelopePeerId(
  records: PeerDirectoryRecord[],
  targetOwnerId: string,
  transportPeerId: string,
): string | undefined {
  const byTransport =
    records.find((r) => r.ownerId === targetOwnerId && r.peerId === transportPeerId) ??
    records.find((r) => r.peerId === transportPeerId);
  if (byTransport?.devicePublicKeyPem?.trim()) {
    return derivePeerId(byTransport.devicePublicKeyPem);
  }
  const byOwner = records.find(
    (r) => r.ownerId === targetOwnerId && r.devicePublicKeyPem?.trim(),
  );
  if (byOwner?.devicePublicKeyPem?.trim()) {
    return derivePeerId(byOwner.devicePublicKeyPem);
  }
  if (targetOwnerId.startsWith("envoy_")) {
    return targetOwnerId;
  }
  return undefined;
}

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
