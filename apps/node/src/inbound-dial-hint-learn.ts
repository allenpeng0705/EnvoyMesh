import {
  filterUsableOutboundPeerDialHints,
  isLikelyInboundConnSnapshotDialHint,
  isPrivateLanTcpDialHint,
} from "@envoymesh/network";

/** Throttle peer-directory listen-addr merges — each merge rewrites the whole JSON file. */
export const INBOUND_LISTEN_ADDR_MERGE_MIN_MS = 120_000;

/** Strip ephemeral inbound snapshots and relay circuits from a live connection remoteAddr. */
export function dialableInboundRemoteAddrs(
  remoteAddr: string | undefined,
  remotePeerId: string,
): string[] {
  if (!remoteAddr?.trim()) {
    return [];
  }
  return filterUsableOutboundPeerDialHints([remoteAddr.trim()], remotePeerId).filter(
    (addr) => !addr.includes("/p2p-circuit/") && !isLikelyInboundConnSnapshotDialHint(addr),
  );
}

export function shouldMergeInboundListenAddrs(
  remotePeerId: string,
  dialableRemote: string[],
  lastMergeByPeer: Map<string, number>,
  now = Date.now(),
): boolean {
  if (dialableRemote.length === 0) {
    return false;
  }
  const lastMerge = lastMergeByPeer.get(remotePeerId) ?? 0;
  const hasLanListen = dialableRemote.some((a) => isPrivateLanTcpDialHint(a));
  return hasLanListen || now - lastMerge >= INBOUND_LISTEN_ADDR_MERGE_MIN_MS;
}

export type InboundPeerDirectoryLearner = {
  mergeListenAddrsForPeerId(peerId: string, addrs: string[]): Promise<void>;
};

export type InboundPeerStoreLearner = {
  mergePeerStoreDialHints(peerId: string, addrs: string[]): Promise<void>;
  getPeerStoreDialHints?(peerId: string): Promise<string[]>;
};

/** Persist dialable direct addrs learned from an inbound libp2p connection. */
export async function mergeInboundPeerDialHintsIfDue(input: {
  remotePeerId: string;
  remoteAddr?: string;
  lastMergeByPeer: Map<string, number>;
  peerDirectory: InboundPeerDirectoryLearner;
  mesh?: InboundPeerStoreLearner;
}): Promise<string[]> {
  let dialableRemote = dialableInboundRemoteAddrs(input.remoteAddr, input.remotePeerId);
  if (input.mesh && typeof input.mesh.getPeerStoreDialHints === "function") {
    try {
      const fromStore = await input.mesh.getPeerStoreDialHints(input.remotePeerId);
      const stableFromStore = fromStore.filter(
        (addr) =>
          !addr.includes("/p2p-circuit/") && !isLikelyInboundConnSnapshotDialHint(addr),
      );
      dialableRemote = [...new Set([...dialableRemote, ...stableFromStore])];
    } catch {
      /* best-effort */
    }
  }
  if (!shouldMergeInboundListenAddrs(input.remotePeerId, dialableRemote, input.lastMergeByPeer)) {
    return dialableRemote;
  }
  input.lastMergeByPeer.set(input.remotePeerId, Date.now());
  try {
    await input.peerDirectory.mergeListenAddrsForPeerId(input.remotePeerId, dialableRemote);
  } catch (err) {
    console.warn(`[peer-directory] mergeListenAddrsForPeerId failed:`, err);
  }
  if (input.mesh && typeof input.mesh.mergePeerStoreDialHints === "function") {
    try {
      await input.mesh.mergePeerStoreDialHints(input.remotePeerId, dialableRemote);
    } catch (err) {
      console.warn(`[peer-store] mergePeerStoreDialHints failed:`, err);
    }
  }
  return dialableRemote;
}
