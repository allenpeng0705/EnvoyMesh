/**
 * Browser-safe EHUI types + panel catalog (no Node / envoy-harness imports).
 * EnvoyMesh Social and @envoymesh/envoy-harness-ehui import this entry only.
 */
export interface ClientPeerInfo {
    id: string;
    model?: string;
    capabilities?: readonly string[];
}
export interface ClientClusterStatus {
    peers: Array<{
        id: string;
        model?: string;
        capabilities?: readonly string[];
        health: {
            ok: boolean;
            rttMs?: number;
            lastPingAt?: string;
            error?: string;
        };
    }>;
    connected: number;
    failed: number;
}
export interface ClientTeamJob {
    jobId: string;
    status: "running" | "completed" | "failed";
    createdAt: string;
    costUsd?: number;
    agents: Array<{
        id: string;
        host: string;
        model?: string;
        status: "pending" | "running" | "completed" | "failed";
        costUsd?: number;
        startedAt?: string;
        completedAt?: string;
    }>;
}
export interface ClientScoreboardEntry {
    workerPeerId: string;
    skillId: string;
    score: number;
    passCount: number;
    failCount: number;
    partialCount: number;
}
export interface ClientSessionSummary {
    id: string;
    mtimeMs: number;
    title?: string;
    cwd?: string;
    startedAt?: string;
    messageCount: number;
}
export interface ClientDiscoveryEvent {
    type: "peer.connected" | "peer.disconnected" | "peer.failed" | "peer.health";
    peerId: string;
    model?: string;
    rttMs?: number;
    error?: string;
    at: string;
}
export declare const EHUI_PANELS: readonly [{
    readonly id: "chat";
    readonly label: "Chat";
    readonly kind: "session";
}, {
    readonly id: "plan";
    readonly label: "Plan";
    readonly method: "session/plan";
}, {
    readonly id: "memory";
    readonly label: "Memory";
    readonly method: "session/memory";
}, {
    readonly id: "git-diff";
    readonly label: "Diff";
    readonly method: "git/diff";
}, {
    readonly id: "git-status";
    readonly label: "Status";
    readonly method: "git/status";
}, {
    readonly id: "mesh";
    readonly label: "Mesh";
    readonly method: "cluster/status";
}, {
    readonly id: "peers";
    readonly label: "Peers";
    readonly method: "peers/list";
}, {
    readonly id: "cluster";
    readonly label: "Cluster";
    readonly method: "cluster/status";
}, {
    readonly id: "team";
    readonly label: "Team";
    readonly method: "team/jobs";
}, {
    readonly id: "scoreboard";
    readonly label: "Scoreboard";
    readonly method: "scoreboard/summary";
}, {
    readonly id: "trace";
    readonly label: "Trace";
    readonly notification: "discovery/event";
}, {
    readonly id: "resume";
    readonly label: "Sessions";
    readonly method: "sessions/list";
}];
export type EhuiPanelId = (typeof EHUI_PANELS)[number]["id"];
export interface EhuiDataSource {
    readonly sessionId: string;
    plan(action: string, options?: {
        text?: string;
        reason?: string;
    }): Promise<string>;
    memory(op: "list" | "read" | "add", options?: {
        name?: string;
        body?: string;
    }): Promise<string>;
    gitDiff(options?: {
        staged?: boolean;
        stat?: boolean;
    }): Promise<string>;
    gitStatus(): Promise<string>;
    clusterStatus(): Promise<ClientClusterStatus>;
    listPeers(): Promise<ClientPeerInfo[]>;
    teamJobs(): Promise<ClientTeamJob[]>;
    scoreboardSummary(): Promise<ClientScoreboardEntry[]>;
    listSessions(): Promise<ClientSessionSummary[]>;
    subscribeDiscovery(listener: (event: ClientDiscoveryEvent) => void): Promise<() => void>;
}
//# sourceMappingURL=ehui.d.ts.map