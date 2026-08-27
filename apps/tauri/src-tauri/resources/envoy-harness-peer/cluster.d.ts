/**
 * R2 — the peer cluster: static discovery (`connectPeerClients`) + a
 * dynamic `MeshSubmitter` over the cluster (`createPeerClusterSubmitter`).
 */
import type { MeshSubmitter } from "@envoymesh/envoy-harness";
import { connectPeerClient } from "./tcp.js";
import type { PeerEventSink } from "./events.js";
import type { PeerSigner } from "./envelope.js";
import { PeerRegistry } from "./registry.js";
export interface PeerEndpointConfig {
    /** Stable peer id. */
    id: string;
    /** `"host:port"` — the peer server endpoint. */
    endpoint: string;
    /** The peer's model (routing). */
    model?: string;
    /** Capability tags the peer can run. */
    capabilities?: string[];
}
export interface ConnectPeerClientsResult {
    registry: PeerRegistry;
    /** Connected peer ids. */
    connected: string[];
    /**
     * Peers that failed to connect (fail-open — the rest still work).
     * Failed peers have NO closer: they never connected, so `closeAll()`
     * only closes the successful sockets. Entries are in config order.
     */
    failed: Array<{
        id: string;
        error: string;
    }>;
    /** Close every connected socket. */
    closeAll(): void;
}
/** Static discovery: connect every configured peer endpoint (fail-open). */
export declare function connectPeerClients(config: ReadonlyArray<PeerEndpointConfig>, options?: {
    connectTimeoutMs?: number;
    signer?: PeerSigner;
    onEvent?: PeerEventSink;
    /**
     * Injectable connect for tests / custom transports. Defaults to the
     * production TCP connect.
     */
    connect?: typeof connectPeerClient;
    /** Called for each failed connect (e.g. host logging). */
    onFailure?: (id: string, err: Error) => void;
}): Promise<ConnectPeerClientsResult>;
export interface PeerClusterSubmitterOptions {
    /** Default cost ceiling (USD). Default 1. */
    defaultCostCeilingUsd?: number;
    /** Default deadline (ms). Default 60s. */
    defaultDeadlineMs?: number;
}
/**
 * A dynamic `MeshSubmitter` over the cluster: routes each submit by
 * `preferredPeerId`, then model/capability via the registry, then any
 * peer. The execution pool for a mesh node's worker (Pattern A).
 */
export declare function createPeerClusterSubmitter(registry: PeerRegistry, options?: PeerClusterSubmitterOptions): MeshSubmitter;
//# sourceMappingURL=cluster.d.ts.map