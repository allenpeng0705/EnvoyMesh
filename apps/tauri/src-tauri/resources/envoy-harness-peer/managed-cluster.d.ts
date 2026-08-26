/**
 * Mutable peer cluster — connect peers at startup or at runtime (`cluster/connect`).
 */
import type { ProtocolClusterStatus } from "@envoymesh/envoy-harness";
import type { PeerEndpointConfig } from "./cluster.js";
import { type PeerUiBackend } from "./cli/ui.js";
import type { PeerEventSink } from "./events.js";
import type { PeerSigner } from "./envelope.js";
import { PeerRegistry } from "./registry.js";
import { type ConnectResultLike, type PeerHealthInfo } from "./status.js";
import { connectPeerClient } from "./tcp.js";
export interface ManagedPeerClusterOptions {
    connectTimeoutMs?: number;
    signer?: PeerSigner;
    onEvent?: PeerEventSink;
    onFailure?: (id: string, err: Error) => void;
    connect?: typeof connectPeerClient;
}
export interface ConnectPeerResult {
    ok: boolean;
    error?: string;
}
/** Live peer pool with runtime `connectPeer` support. */
export declare class ManagedPeerCluster implements ConnectResultLike {
    #private;
    readonly registry: PeerRegistry;
    readonly connected: string[];
    readonly failed: Array<{
        id: string;
        error: string;
    }>;
    constructor(options?: ManagedPeerClusterOptions);
    /** Connect every configured peer (fail-open per peer). */
    connectPeers(peers: ReadonlyArray<PeerEndpointConfig>): Promise<void>;
    /** Connect one peer endpoint and register it in the pool. */
    connectPeer(peer: PeerEndpointConfig): Promise<ConnectPeerResult>;
    /** Build the cluster-console ACP backend over this live pool. */
    createUiBackend(healthProvider?: () => Promise<ReadonlyMap<string, PeerHealthInfo>>): PeerUiBackend;
    clusterStatus(health?: ReadonlyMap<string, PeerHealthInfo>): ProtocolClusterStatus;
    closeAll(): void;
}
//# sourceMappingURL=managed-cluster.d.ts.map