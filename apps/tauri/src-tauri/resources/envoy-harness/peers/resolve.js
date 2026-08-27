/**
 * Merge peer endpoints from config, env, and CLI (later sources override id).
 */
import { parsePeerEndpointsFromEnv } from "./endpoints.js";
/** Read `[[peers]]` entries from a loaded config layer. */
export function peersFromConfigLayer(layer) {
    if (layer.peers === undefined)
        return [];
    return layer.peers.map((peer) => ({
        id: peer.id,
        endpoint: peer.endpoint,
        ...(peer.model !== undefined ? { model: peer.model } : {}),
        ...(peer.capabilities !== undefined ? { capabilities: peer.capabilities } : {}),
    }));
}
/** Union config + env + CLI peer endpoints (CLI wins on duplicate ids). */
export function resolvePeerEndpoints(options = {}) {
    const byId = new Map();
    for (const peer of peersFromConfigLayer(options.configLayer ?? {})) {
        byId.set(peer.id, peer);
    }
    for (const peer of parsePeerEndpointsFromEnv(options.env)) {
        byId.set(peer.id, peer);
    }
    for (const peer of options.cliPeers ?? []) {
        byId.set(peer.id, { id: peer.id, endpoint: peer.endpoint });
    }
    return [...byId.values()];
}
//# sourceMappingURL=resolve.js.map