/**
 * U3 — shared cluster-status mapping for hosts that wire a peer cluster
 * into the dedicated UI (standalone `envoy-peer ui` and EnvoyMesh's
 * in-process ACP host use the same mapper).
 */
import type { ProtocolClusterStatus } from "@envoymesh/envoy-harness";
import type { ProtocolPeerInfo } from "@envoymesh/envoy-harness";
import type { PeerRegistry } from "./registry.js";
/** Optional per-peer health snapshot (RTT / last ping). */
export interface PeerHealthInfo {
    ok: boolean;
    rttMs?: number;
    lastPingAt?: string;
    error?: string;
}
export interface ConnectResultLike {
    registry: PeerRegistry;
    connected: string[];
    failed: Array<{
        id: string;
        error: string;
    }>;
}
/**
 * Map a `connectPeerClients` result (+ optional health snapshots) to the
 * `cluster/status` wire shape. Failed peers are appended after connected
 * peers with `health.ok = false` and their connect error.
 */
export declare function clusterStatusFromConnect(result: ConnectResultLike, health?: ReadonlyMap<string, PeerHealthInfo>): ProtocolClusterStatus;
export declare function peerToInfo(entry: {
    id: string;
    model?: string;
    capabilities?: ReadonlyArray<string>;
}): ProtocolPeerInfo;
/**
 * The peer-cluster status surface for hosts that embed the ACP server:
 * `listPeers` / `clusterStatus` / `routePeer` read a connected pool
 * (EnvoyMesh's in-process ACP host spreads this into its backend).
 */
export declare function createPeerPoolStatusBackend(pool: ConnectResultLike): {
    listPeers(): ProtocolPeerInfo[];
    clusterStatus(): ProtocolClusterStatus;
    routePeer(input: {
        capabilityTag: string;
        preferredPeerId?: string;
    }): ProtocolPeerInfo | undefined;
};
//# sourceMappingURL=status.d.ts.map