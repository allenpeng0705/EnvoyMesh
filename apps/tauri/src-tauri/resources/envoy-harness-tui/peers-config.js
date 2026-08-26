/**
 * Parse `--peers` / `ENVOY_PEERS` for the TUI mesh surfaces.
 */
import { parsePeerEndpoint, parsePeerEndpointsFromEnv, } from "@envoymesh/envoy-harness";
function requireFlagValue(argv, index, flag) {
    const value = argv[index];
    if (value === undefined)
        throw new Error(`${flag} requires a value`);
    return value;
}
/** Strip peer-related flags from argv (for mode detection). */
export function parseTuiPeerFlags(argv) {
    const peers = [...parsePeerEndpointsFromEnv()];
    let connectTimeoutMs;
    let clusterOnly = false;
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        switch (flag) {
            case "--cluster-only":
            case "--cluster":
                clusterOnly = true;
                break;
            case "--peers":
            case "--peer": {
                const raw = requireFlagValue(argv, ++i, flag);
                peers.push(parsePeerEndpoint(raw));
                break;
            }
            case "--connect-timeout-ms": {
                const value = Number(requireFlagValue(argv, ++i, flag));
                if (!Number.isInteger(value) || value <= 0) {
                    throw new Error("--connect-timeout-ms must be a positive integer");
                }
                connectTimeoutMs = value;
                break;
            }
            default:
                break;
        }
    }
    return {
        peers,
        ...(connectTimeoutMs !== undefined ? { connectTimeoutMs } : {}),
        clusterOnly,
    };
}
/** Serialize peer specs for `ENVOY_PEERS` when spawning a harness child. */
export function formatPeersForEnv(peers) {
    return peers.map((p) => `${p.id}@${p.endpoint}`).join(",");
}
//# sourceMappingURL=peers-config.js.map