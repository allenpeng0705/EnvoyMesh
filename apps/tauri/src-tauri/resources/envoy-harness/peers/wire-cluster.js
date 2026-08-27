/**
 * Optional peer-cluster wiring for ACP/SDK hosts via dynamic import of
 * `@envoymesh/envoy-harness-peer` (keeps the core package free of a hard
 * dependency cycle with the peer package).
 */
/** Merge cluster protocol methods onto a base session backend. */
export function mergeClusterSeams(base, seams) {
    return {
        ...base,
        ...(seams.listPeers !== undefined ? { listPeers: seams.listPeers } : {}),
        ...(seams.clusterStatus !== undefined
            ? { clusterStatus: seams.clusterStatus }
            : {}),
        ...(seams.routePeer !== undefined ? { routePeer: seams.routePeer } : {}),
        ...(seams.scoreboardSummary !== undefined
            ? { scoreboardSummary: seams.scoreboardSummary }
            : {}),
        ...(seams.teamJobs !== undefined ? { teamJobs: seams.teamJobs } : {}),
        ...(seams.subscribeDiscovery !== undefined
            ? { subscribeDiscovery: seams.subscribeDiscovery }
            : {}),
        ...(seams.connectPeer !== undefined ? { connectPeer: seams.connectPeer } : {}),
    };
}
/**
 * Connect configured peers and return protocol seams for the cluster rail,
 * slash commands, and runtime `cluster/connect`. Returns undefined when
 * `peers` is empty.
 */
export async function wirePeerCluster(options) {
    if (options.peers.length === 0 && !options.enableRuntimeConnect) {
        return undefined;
    }
    let peerMod;
    try {
        peerMod = await import("@envoymesh/envoy-harness-peer");
    }
    catch {
        throw new Error("peer cluster requires @envoymesh/envoy-harness-peer (install the peer package)");
    }
    const managed = new peerMod.ManagedPeerCluster({
        ...(options.connectTimeoutMs !== undefined
            ? { connectTimeoutMs: options.connectTimeoutMs }
            : {}),
        ...(options.onFailure !== undefined ? { onFailure: options.onFailure } : {}),
    });
    if (options.peers.length > 0) {
        await managed.connectPeers(options.peers.map((peer) => ({
            id: peer.id,
            endpoint: peer.endpoint,
            ...(peer.model !== undefined ? { model: peer.model } : {}),
            ...(peer.capabilities !== undefined
                ? { capabilities: peer.capabilities }
                : {}),
        })));
    }
    const peerUi = managed.createUiBackend();
    const connectPeer = async (params) => {
        return managed.connectPeer({
            id: params.id,
            endpoint: params.endpoint,
            ...(params.model !== undefined ? { model: params.model } : {}),
            ...(params.capabilities !== undefined
                ? { capabilities: [...params.capabilities] }
                : {}),
        });
    };
    const seams = {
        ...(peerUi.backend.listPeers !== undefined
            ? { listPeers: peerUi.backend.listPeers }
            : {}),
        ...(peerUi.backend.clusterStatus !== undefined
            ? { clusterStatus: peerUi.backend.clusterStatus }
            : {}),
        ...(peerUi.backend.routePeer !== undefined
            ? { routePeer: peerUi.backend.routePeer }
            : {}),
        ...(peerUi.backend.scoreboardSummary !== undefined
            ? { scoreboardSummary: peerUi.backend.scoreboardSummary }
            : {}),
        ...(peerUi.backend.teamJobs !== undefined
            ? { teamJobs: peerUi.backend.teamJobs }
            : {}),
        ...(peerUi.backend.subscribeDiscovery !== undefined
            ? { subscribeDiscovery: peerUi.backend.subscribeDiscovery }
            : {}),
        connectPeer,
    };
    return {
        seams,
        dispose: async () => {
            peerUi.close();
            managed.closeAll();
        },
    };
}
//# sourceMappingURL=wire-cluster.js.map