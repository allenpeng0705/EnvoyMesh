/**
 * U3 — detail-view renderers for the dedicated TUI. Pure functions:
 * each takes the protocol snapshot and returns lines for the screen's
 * content area. Hermetic-tested without a TTY.
 */
import type { ClientClusterStatus, ClientDiscoveryEvent, ClientPeerInfo, ClientScoreboardEntry, ClientTeamJob } from "@envoymesh/envoy-harness-client";
/** `/mesh` — mesh onboarding: discover peers, configure, and collaborate. */
export declare function renderMeshView(options?: {
    configuredPeers?: ReadonlyArray<{
        id: string;
        endpoint: string;
    }>;
    connected?: number;
    failed?: number;
}): string[];
/** `/cluster` — per-peer health + totals + routing previews. */
export declare function renderClusterView(cluster: ClientClusterStatus, routePreviews?: ReadonlyArray<{
    tag: string;
    peer: ClientPeerInfo | undefined;
}>): string[];
/** `/route <tag>` — routing preview for one capability tag. */
export declare function renderRouteView(input: {
    tag: string;
    peer: ClientPeerInfo | undefined;
}): string[];
/** `/peers` — flat peer list (same data as the rail, full detail). */
export declare function renderPeersView(peers: readonly ClientPeerInfo[]): string[];
/** `/team` — live team jobs: agents, hosts, status, cost. */
export declare function renderTeamView(jobs: readonly ClientTeamJob[]): string[];
/** `/scoreboard` — reputation per (peer, skill). */
export declare function renderScoreboardView(entries: readonly ClientScoreboardEntry[]): string[];
/** The discovery ticker (last events, newest first), shown above the input. */
export declare function renderDiscoveryTicker(events: readonly ClientDiscoveryEvent[], max?: number): string[];
/** `/search <term>` — transcript lines containing the term (case-insensitive). */
export declare function renderSearchView(transcript: readonly string[], term: string): string[];
/** `/trace` — the discovery/peer event log (newest first). */
export declare function renderTraceView(events: readonly ClientDiscoveryEvent[]): string[];
/** U6 — optional ANSI coloring for screen mode. */
export interface ViewRenderOptions {
    color?: boolean;
}
/** `/plan` tab — current plan text with section header. */
export declare function renderPlanView(text: string, options?: ViewRenderOptions): string[];
/** `/memory` tab — memory list or body. */
export declare function renderMemoryView(text: string, options?: ViewRenderOptions): string[];
/** `/diff` tab — inline git diff with optional ANSI colors. */
export declare function renderGitDiffView(text: string, options?: ViewRenderOptions): string[];
/** U6a.5 — resume picker from `sessions/list`. */
export declare function renderResumeView(sessions: ReadonlyArray<{
    id: string;
    mtimeMs: number;
    title?: string;
    cwd?: string;
    messageCount: number;
}>, options?: ViewRenderOptions): string[];
//# sourceMappingURL=views.d.ts.map