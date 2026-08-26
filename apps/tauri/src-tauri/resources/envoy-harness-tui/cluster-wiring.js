/**
 * Connect peer clusters and merge cluster protocol seams into ACP backends.
 */
import { createFakeSessionBackend, mergeClusterSeams, wirePeerCluster, } from "@envoymesh/envoy-harness";
import { createInProcessTui } from "./in-process.js";
/** Connect peers and merge cluster seams onto an optional base backend. */
export async function wireClusterBackend(options) {
    const base = options.base ?? createFakeSessionBackend();
    const wired = await wirePeerCluster({
        peers: options.peers,
        ...(options.connectTimeoutMs !== undefined
            ? { connectTimeoutMs: options.connectTimeoutMs }
            : {}),
        ...(options.enableRuntimeConnect === true
            ? { enableRuntimeConnect: true }
            : {}),
        ...(options.onFailure !== undefined ? { onFailure: options.onFailure } : {}),
    });
    if (wired === undefined) {
        return {
            backend: base,
            dispose: async () => undefined,
        };
    }
    return {
        backend: mergeClusterSeams(base, wired.seams),
        dispose: wired.dispose,
    };
}
/** In-process TUI with a live peer cluster wired into the ACP backend. */
export async function createClusterTui(options) {
    const wired = await wireClusterBackend(options);
    const tui = createInProcessTui({
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        backend: wired.backend,
    });
    return {
        ...tui,
        disposeCluster: wired.dispose,
        close() {
            tui.close();
            void wired.dispose().catch(() => undefined);
        },
    };
}
//# sourceMappingURL=cluster-wiring.js.map