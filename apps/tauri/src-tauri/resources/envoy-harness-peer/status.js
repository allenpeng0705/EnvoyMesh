/**
 * U3 — shared cluster-status mapping for hosts that wire a peer cluster
 * into the dedicated UI (standalone `envoy-peer ui` and EnvoyMesh's
 * in-process ACP host use the same mapper).
 */
/**
 * Map a `connectPeerClients` result (+ optional health snapshots) to the
 * `cluster/status` wire shape. Failed peers are appended after connected
 * peers with `health.ok = false` and their connect error.
 */
export function clusterStatusFromConnect(result, health) {
    const connectedPeers = result.registry.list().map((entry) => ({
        id: entry.id,
        ...(entry.model !== undefined ? { model: entry.model } : {}),
        ...(entry.capabilities !== undefined
            ? { capabilities: entry.capabilities }
            : {}),
        health: health?.get(entry.id) ?? { ok: true },
    }));
    const failedPeers = result.failed.map((f) => ({
        id: f.id,
        health: { ok: false, error: f.error },
    }));
    return {
        peers: [...connectedPeers, ...failedPeers],
        connected: connectedPeers.length,
        failed: failedPeers.length,
    };
}
export function peerToInfo(entry) {
    return {
        id: entry.id,
        ...(entry.model !== undefined ? { model: entry.model } : {}),
        ...(entry.capabilities !== undefined
            ? { capabilities: entry.capabilities }
            : {}),
    };
}
/**
 * The peer-cluster status surface for hosts that embed the ACP server:
 * `listPeers` / `clusterStatus` / `routePeer` read a connected pool
 * (EnvoyMesh's in-process ACP host spreads this into its backend).
 */
export function createPeerPoolStatusBackend(pool) {
    return {
        listPeers: () => pool.registry.list().map(peerToInfo),
        clusterStatus: () => clusterStatusFromConnect(pool),
        routePeer: (input) => {
            const entry = pool.registry.route({
                objective: "",
                capabilityTag: input.capabilityTag,
                costCeilingUsd: 1,
                deadlineMs: 60_000,
                ...(input.preferredPeerId !== undefined
                    ? { preferredPeerId: input.preferredPeerId }
                    : {}),
            });
            return entry === undefined ? undefined : peerToInfo(entry);
        },
    };
}
//# sourceMappingURL=status.js.map