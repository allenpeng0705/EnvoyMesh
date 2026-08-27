/**
 * Phase E — ProtocolSessionBackend backed by Agent.run().
 */
import type { MemoryStore } from "../memories/store.js";
import type { Agent } from "../agent.js";
import type { AskHandler } from "../types.js";
import type { Session } from "../session.js";
import { SessionStore } from "../session/session-store.js";
import type { ProtocolClusterStatus, ProtocolScoreboardEntry, ProtocolTeamJob, ProtocolPeerInfo, ProtocolSessionBackend, ProtocolToolInfo } from "./session-backend.js";
export interface AgentSessionBackendOptions {
    createAgent: (opts: {
        sessionId: string;
        cwd: string | undefined;
        askHandler: AskHandler;
        /** When resuming, the persisted session instance (else in-memory). */
        session?: Session;
    }) => Agent;
    /** When set, `loadSession` reads JSONL transcripts from disk. */
    sessionStore?: SessionStore;
    defaultCwd?: string;
    /**
     * When set, PreToolUse asks only for tools where this returns true.
     * Default: ask for every tool (ACP host decides allow/deny).
     */
    shouldAskTool?: (toolName: string, args?: unknown) => boolean;
    /** Cap live sessions; oldest are dropped. Default 32. */
    maxSessions?: number;
    /**
     * R3 — the host's connected peer cluster, exposed over `peers/list`
     * (ACP + SDK). Hosts with a peer registry (e.g. EnvoyMesh's in-process
     * ACP host) pass a snapshot function here.
     */
    listPeers?: () => ReadonlyArray<ProtocolPeerInfo>;
    /** U1 — cluster status (peers + health) for the dedicated UI. */
    clusterStatus?: () => ProtocolClusterStatus;
    /** U1 — team jobs (running/finished) for the dedicated UI. */
    teamJobs?: () => ReadonlyArray<ProtocolTeamJob>;
    /** U1 — peer reputation scoreboard for the dedicated UI. */
    scoreboardSummary?: () => ReadonlyArray<ProtocolScoreboardEntry>;
    /** U2 — host config for the status bar (e.g. `{ model }`). */
    getConfig?: () => Record<string, unknown>;
    /** Tool catalog for `tools/list`. */
    listTools?: () => ProtocolToolInfo[];
    /** Optional memory store for `session/memory` (REPL parity). */
    memoryStore?: MemoryStore;
}
export declare function createAgentSessionBackend(options: AgentSessionBackendOptions): ProtocolSessionBackend;
//# sourceMappingURL=agent-backend.d.ts.map