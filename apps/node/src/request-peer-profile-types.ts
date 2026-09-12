/** Local type stubs for requestPeerProfile context. */
import type { NodeProfile } from "@envoymesh/api/core";

export interface MeshLike {
  peerId: string;
  getConnectedPeerIds(): string[];
  getPeerConnectionInfo(peerId: string): { connected: boolean; direct?: boolean };
}

export type { NodeProfile };