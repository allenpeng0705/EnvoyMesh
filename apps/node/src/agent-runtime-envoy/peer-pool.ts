/**
 * R2 — build the envoy-harness execution pool from the persisted static
 * peer config (standalone peer cluster, Pattern A).
 */

import {
  connectPeerClients,
  createPeerClusterSubmitter,
  type ConnectPeerClientsResult,
  type PeerEndpointConfig,
} from "@envoymesh/envoy-harness-peer";
import type { MeshSubmitter } from "@envoymesh/envoy-harness";

export interface EnvoyHarnessPeerPool {
  submitter: MeshSubmitter;
  registry: ConnectPeerClientsResult["registry"];
  connected: string[];
  failed: Array<{ id: string; error: string }>;
  closeAll(): void;
}

/** Build the pool. `connect` is injectable for hermetic tests. */
export async function buildEnvoyHarnessPeerPool(
  peers: ReadonlyArray<PeerEndpointConfig>,
  connect: typeof connectPeerClients = connectPeerClients,
): Promise<EnvoyHarnessPeerPool> {
  const { registry, connected, failed, closeAll } = await connect(peers);
  return {
    submitter: createPeerClusterSubmitter(registry),
    registry,
    connected,
    failed,
    closeAll,
  };
}
