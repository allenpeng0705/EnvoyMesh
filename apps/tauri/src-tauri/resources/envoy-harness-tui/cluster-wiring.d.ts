/**
 * Connect peer clusters and merge cluster protocol seams into ACP backends.
 */
import { type ProtocolSessionBackend, type ResolvedPeerEndpoint } from "@envoymesh/envoy-harness";
import { type InProcessTui } from "./in-process.js";
export interface WireClusterBackendOptions {
    peers: ReadonlyArray<ResolvedPeerEndpoint>;
    connectTimeoutMs?: number;
    enableRuntimeConnect?: boolean;
    base?: ProtocolSessionBackend;
    onFailure?: (id: string, err: Error) => void;
}
export interface WiredClusterBackend {
    backend: ProtocolSessionBackend;
    dispose: () => Promise<void>;
}
/** Connect peers and merge cluster seams onto an optional base backend. */
export declare function wireClusterBackend(options: WireClusterBackendOptions): Promise<WiredClusterBackend>;
export interface ClusterTuiOptions {
    peers: ReadonlyArray<ResolvedPeerEndpoint>;
    connectTimeoutMs?: number;
    cwd?: string;
    base?: ProtocolSessionBackend;
    onFailure?: (id: string, err: Error) => void;
}
export interface ClusterTui extends InProcessTui {
    disposeCluster: () => Promise<void>;
}
/** In-process TUI with a live peer cluster wired into the ACP backend. */
export declare function createClusterTui(options: ClusterTuiOptions): Promise<ClusterTui>;
//# sourceMappingURL=cluster-wiring.d.ts.map