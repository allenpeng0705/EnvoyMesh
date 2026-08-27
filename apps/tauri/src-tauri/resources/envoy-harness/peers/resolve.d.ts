/**
 * Merge peer endpoints from config, env, and CLI (later sources override id).
 */
import type { ConfigLayer } from "../config/schema.js";
import type { PeerEndpointSpec } from "./endpoints.js";
export interface ResolvedPeerEndpoint extends PeerEndpointSpec {
    model?: string;
    capabilities?: string[];
}
/** Read `[[peers]]` entries from a loaded config layer. */
export declare function peersFromConfigLayer(layer: ConfigLayer): ResolvedPeerEndpoint[];
export interface ResolvePeerEndpointsOptions {
    configLayer?: ConfigLayer;
    cliPeers?: ReadonlyArray<PeerEndpointSpec>;
    env?: NodeJS.ProcessEnv;
}
/** Union config + env + CLI peer endpoints (CLI wins on duplicate ids). */
export declare function resolvePeerEndpoints(options?: ResolvePeerEndpointsOptions): ResolvedPeerEndpoint[];
//# sourceMappingURL=resolve.d.ts.map