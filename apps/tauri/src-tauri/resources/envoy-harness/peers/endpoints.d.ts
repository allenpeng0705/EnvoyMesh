/**
 * Parse static peer endpoint specs (`id@host:port`) for mesh wiring.
 */
export interface PeerEndpointSpec {
    id: string;
    endpoint: string;
}
/** Parse one `id@host:port` peer endpoint. */
export declare function parsePeerEndpoint(raw: string): PeerEndpointSpec;
/**
 * Parse a list of peer endpoints from a comma- or whitespace-separated string.
 * Each token must be `id@host:port`.
 */
export declare function parsePeerEndpointsList(raw: string): PeerEndpointSpec[];
/** Read `ENVOY_PEERS` when set (`id@host:port` tokens, comma or space separated). */
export declare function parsePeerEndpointsFromEnv(env?: NodeJS.ProcessEnv): PeerEndpointSpec[];
//# sourceMappingURL=endpoints.d.ts.map