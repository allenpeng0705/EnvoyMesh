/**
 * U3/U5 — view-body resolution for the screen mode: which content the
 * active view shows, fetched from the session's protocol methods, plus
 * the cached cluster routing previews. Kept out of `ui.ts` so the run
 * loop stays under the module-size target.
 */
import type { ClientClusterStatus, ClientPeerInfo } from "@envoymesh/envoy-harness-client";
import type { TuiSession } from "./session.js";
export type UiView = "chat" | "mesh" | "peers" | "cluster" | "team" | "scoreboard" | "route" | "search" | "trace" | "plan" | "memory" | "git-diff" | "resume";
/** Resolve the screen's content area for the active view. */
export declare function resolveViewBody(view: UiView, routeTag: string | undefined, session: TuiSession, cluster: ClientClusterStatus | undefined, clusterRoutePreviews?: ReadonlyArray<{
    tag: string;
    peer: ClientPeerInfo | undefined;
}> | undefined, searchTerm?: string, meshOptions?: {
    configuredPeers?: ReadonlyArray<{
        id: string;
        endpoint: string;
    }>;
}, renderOptions?: {
    color?: boolean;
}): Promise<string[]>;
export interface ClusterRoutePreviews {
    at: number;
    previews: Array<{
        tag: string;
        peer: ClientPeerInfo | undefined;
    }>;
}
/**
 * U3 follow-up — routing previews for the cluster view: derive candidate
 * tags from the peers' capabilities and ask the host which peer would
 * run each. Cached (10s TTL) so typing in the view doesn't re-route
 * every keystroke.
 */
export declare function resolveClusterRoutePreviews(session: TuiSession, cluster: ClientClusterStatus | undefined, cached: ClusterRoutePreviews | undefined): Promise<ClusterRoutePreviews>;
//# sourceMappingURL=view-resolver.d.ts.map