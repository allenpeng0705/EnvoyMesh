/**
 * Parse `--peers` / `ENVOY_PEERS` for the TUI mesh surfaces.
 */
import { type PeerEndpointSpec } from "@envoymesh/envoy-harness";
export type { PeerEndpointSpec };
export interface ParsedTuiPeers {
    peers: PeerEndpointSpec[];
    connectTimeoutMs?: number;
    clusterOnly: boolean;
}
/** Strip peer-related flags from argv (for mode detection). */
export declare function parseTuiPeerFlags(argv: readonly string[]): ParsedTuiPeers;
/** Serialize peer specs for `ENVOY_PEERS` when spawning a harness child. */
export declare function formatPeersForEnv(peers: ReadonlyArray<PeerEndpointSpec>): string;
//# sourceMappingURL=peers-config.d.ts.map