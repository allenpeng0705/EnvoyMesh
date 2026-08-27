/**
 * Optional peer-cluster wiring for ACP/SDK hosts via dynamic import of
 * `@envoymesh/envoy-harness-peer` (keeps the core package free of a hard
 * dependency cycle with the peer package).
 */
import type { ProtocolSessionBackend } from "../protocol/session-backend.js";
import type { ResolvedPeerEndpoint } from "./resolve.js";
export type ClusterSeams = Pick<ProtocolSessionBackend, "listPeers" | "clusterStatus" | "routePeer" | "scoreboardSummary" | "teamJobs" | "subscribeDiscovery" | "connectPeer">;
export interface WirePeerClusterOptions {
    peers: ReadonlyArray<ResolvedPeerEndpoint>;
    connectTimeoutMs?: number;
    /** When true, wire an empty pool that still supports `cluster/connect`. */
    enableRuntimeConnect?: boolean;
    onFailure?: (id: string, err: Error) => void;
}
export interface WirePeerClusterResult {
    seams: ClusterSeams;
    dispose: () => Promise<void>;
}
/** Merge cluster protocol methods onto a base session backend. */
export declare function mergeClusterSeams(base: ProtocolSessionBackend, seams: ClusterSeams): ProtocolSessionBackend;
/**
 * Connect configured peers and return protocol seams for the cluster rail,
 * slash commands, and runtime `cluster/connect`. Returns undefined when
 * `peers` is empty.
 */
export declare function wirePeerCluster(options: WirePeerClusterOptions): Promise<WirePeerClusterResult | undefined>;
//# sourceMappingURL=wire-cluster.d.ts.map