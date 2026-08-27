/**
 * Phase E — shared session backend for ACP + SDK dialects.
 */
export interface ProtocolPermissionRequest {
    sessionId: string;
    toolName: string;
    description: string;
    args: unknown;
}
export type ProtocolPermissionDecision = "allow" | "deny";
export interface ProtocolCommittedMessage {
    role: "user" | "assistant" | "tool" | "system";
    text: string;
    /** True for in-flight assistant text (superseded by the final message). */
    partial?: boolean;
}
/** One assistant text delta during streaming (`session/token`). */
export interface ProtocolToken {
    role: "assistant";
    delta: string;
}
export interface ProtocolPromptResult {
    stopReason: string;
    messages: ProtocolCommittedMessage[];
    turnHints?: import("../interaction/turn-hints.js").TurnHints;
}
export interface ProtocolCompactResult {
    messageCountBefore: number;
    messageCountAfter: number;
    droppedCount: number;
    totalTokensAfter?: number;
    overBudget?: boolean;
    summarized?: boolean;
}
export interface ProtocolSetModelResult {
    provider: string;
    model?: string;
}
export interface ProtocolSetPolicyResult {
    sandbox?: string;
    approval?: string;
    autoRun?: string;
}
export interface ProtocolGitResult {
    output: string;
}
/** Live progress from the agent trace stream (`session/activity`). */
export interface ProtocolActivityEvent {
    kind: "agent_start" | "model_response" | "tool_call" | "tool_result" | "tool_progress" | "agent_end" | "error";
    ts: string;
    subagentOf?: string;
    /** Human-readable one-liner for terminals. */
    summary: string;
    toolName?: string;
    toolArgs?: unknown;
    toolCallId?: string;
    resultPreview?: string;
    isError?: boolean;
    durationMs?: number;
    iterations?: number;
    toolCalls?: number;
    costUsd?: number;
    stopReason?: string;
    message?: string;
    tools?: string[];
}
export interface ProtocolToolInfo {
    name: string;
    description: string;
}
/** One connected peer in the host's peer cluster (R3 peer surface). */
export interface ProtocolPeerInfo {
    id: string;
    model?: string;
    capabilities?: readonly string[];
}
/** U1 — per-peer health snapshot for the cluster rail. */
export interface ProtocolPeerHealth {
    ok: boolean;
    rttMs?: number;
    lastPingAt?: string;
    error?: string;
}
/** U1 — `cluster/status`: the host's peer cluster with health. */
export interface ProtocolClusterStatus {
    peers: Array<{
        id: string;
        model?: string;
        capabilities?: readonly string[];
        health: ProtocolPeerHealth;
    }>;
    connected: number;
    failed: number;
}
/** U1 — one agent inside a `team/jobs` entry. */
export interface ProtocolTeamAgentStatus {
    id: string;
    /** `"local"` or `"peer://<id>"`. */
    host: string;
    model?: string;
    status: "pending" | "running" | "completed" | "failed";
    costUsd?: number;
    startedAt?: string;
    completedAt?: string;
}
/** U1 — `team/jobs`: running/finished distributed team runs. */
export interface ProtocolTeamJob {
    jobId: string;
    status: "running" | "completed" | "failed";
    createdAt: string;
    costUsd?: number;
    agents: ProtocolTeamAgentStatus[];
}
/** U1 — `scoreboard/summary`: reputation per (peer, skill). */
export interface ProtocolScoreboardEntry {
    workerPeerId: string;
    skillId: string;
    score: number;
    passCount: number;
    failCount: number;
    partialCount: number;
}
/** U3 — one discovery/lifecycle event pushed to subscribed clients. */
export interface ProtocolDiscoveryEvent {
    type: "peer.connected" | "peer.disconnected" | "peer.failed" | "peer.health";
    peerId: string;
    model?: string;
    rttMs?: number;
    error?: string;
    at: string;
}
export type ProtocolPromptInput = {
    text: string;
} | {
    content: ReadonlyArray<{
        type: "text";
        text: string;
    } | {
        type: "image";
        mimeType: string;
        data: string;
    }>;
};
export interface ProtocolSessionBackend {
    createSession(params?: {
        cwd?: string;
    }): Promise<{
        sessionId: string;
    }>;
    /** Load a persisted session transcript into a live agent (ACP `session/load`). */
    loadSession?(params: {
        sessionId: string;
        cwd?: string;
    }): Promise<{
        sessionId: string;
    }>;
    /** U6a.5 — list persisted sessions for resume picker. */
    listSessions?(): Promise<ReadonlyArray<{
        id: string;
        mtimeMs: number;
        title?: string;
        cwd?: string;
        startedAt?: string;
        messageCount: number;
    }>>;
    prompt(params: {
        sessionId: string;
        prompt: ProtocolPromptInput;
        signal: AbortSignal;
        requestPermission: (req: ProtocolPermissionRequest) => Promise<ProtocolPermissionDecision>;
        onUpdate?: (msg: ProtocolCommittedMessage) => void;
        onActivity?: (activity: ProtocolActivityEvent) => void;
        onToken?: (token: ProtocolToken) => void;
    }): Promise<ProtocolPromptResult>;
    cancel(sessionId: string): void;
    listTools?(): ProtocolToolInfo[];
    getConfig?(): Record<string, unknown>;
    /**
     * R3 — the host's connected peer cluster (static discovery). The
     * standalone harness CLI has no peers of its own; hosts that embed
     * the ACP/SDK server (e.g. EnvoyMesh's in-process ACP host) wire this
     * to their registry so clients can render a `/peers` surface.
     */
    listPeers?(): ReadonlyArray<ProtocolPeerInfo>;
    /**
     * U1 — the host's cluster status (peers + health). Optional: the UI
     * shows "unavailable" when the host doesn't wire it.
     */
    clusterStatus?(): ProtocolClusterStatus | Promise<ProtocolClusterStatus>;
    /** U1 — the host's team jobs (running/finished). Optional. */
    teamJobs?(): ReadonlyArray<ProtocolTeamJob>;
    /** U1 — the host's peer reputation scoreboard. Optional. */
    scoreboardSummary?(): ReadonlyArray<ProtocolScoreboardEntry>;
    /**
     * U3 — subscribe to discovery/lifecycle events. Returns an
     * unsubscribe function (or undefined when the backend doesn't
     * support unsubscribing). The server forwards events to the client
     * as `discovery/event` notifications.
     */
    subscribeDiscovery?(listener: (event: ProtocolDiscoveryEvent) => void): (() => void) | void;
    /**
     * U3 — routing preview: which peer would run a task with this
     * capability tag (and optional preferred peer id). Optional.
     */
    routePeer?(input: {
        capabilityTag: string;
        preferredPeerId?: string;
    }): ProtocolPeerInfo | undefined;
    /**
     * Runtime mesh wiring — connect a peer without restarting the host
     * (`cluster/connect` over ACP/SDK).
     */
    connectPeer?(params: {
        id: string;
        endpoint: string;
        model?: string;
        capabilities?: readonly string[];
    }): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Drop oldest messages (REPL `/compact` parity). */
    compact?(params: {
        sessionId: string;
        keep?: number;
        budget?: number;
        summarize?: boolean;
    }): Promise<ProtocolCompactResult>;
    /** Swap model provider (`/provider` / `/model`). */
    setModel?(params: {
        sessionId: string;
        provider: string;
        model?: string;
    }): Promise<ProtocolSetModelResult>;
    /** Change sandbox or approval policy mid-session. */
    setPolicy?(params: {
        sessionId: string;
        sandbox?: "read-only" | "workspace-write" | "danger-full-access";
        approval?: "unless-trusted" | "on-request" | "granular" | "never";
        autoRun?: "always-confirm" | "safe-only" | "off";
    }): Promise<ProtocolSetPolicyResult>;
    /** Read the current sandbox / approval / auto-run policy for a session. */
    getPolicy?(params: {
        sessionId: string;
    }): Promise<ProtocolSetPolicyResult>;
    /** Read-only `git diff` for the session cwd. */
    gitDiff?(params: {
        sessionId: string;
        staged?: boolean;
        stat?: boolean;
    }): Promise<ProtocolGitResult>;
    /** Read-only `git status --porcelain` for the session cwd. */
    gitStatus?(params: {
        sessionId: string;
    }): Promise<ProtocolGitResult>;
    /** Message count + token usage (`/context`). */
    getSessionContext?(params: {
        sessionId: string;
    }): Promise<{
        messageCount: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }>;
    /** Registered hooks (`/hooks`). */
    listSessionHooks?(params: {
        sessionId: string;
    }): Promise<{
        hooks: Array<{
            event: string;
            handlerCount: number;
        }>;
    }>;
    /** MCP server names (`/mcp`). */
    listSessionMcp?(params: {
        sessionId: string;
    }): Promise<{
        servers: string[];
    }>;
    /** Sub-agents spawned this session (`/agents`). */
    listSessionAgents?(params: {
        sessionId: string;
    }): Promise<{
        output: string;
    }>;
    /** Plan lifecycle (`/plan`). */
    sessionPlan?(params: {
        sessionId: string;
        action: string;
        text?: string;
        reason?: string;
    }): Promise<ProtocolGitResult>;
    /** Memory store ops (`/memory`). */
    sessionMemory?(params: {
        sessionId: string;
        op: "list" | "read" | "add";
        name?: string;
        body?: string;
    }): Promise<ProtocolGitResult>;
    /** Model code review (`/review`). */
    sessionReview?(params: {
        sessionId: string;
        staged?: boolean;
    }): Promise<ProtocolGitResult>;
    /** Generate AGENTS.md (`/init`). */
    sessionInit?(params: {
        sessionId: string;
    }): Promise<ProtocolGitResult>;
}
/** In-memory backend for hermetic protocol tests. */
export declare function createFakeSessionBackend(options?: {
    tools?: ProtocolToolInfo[];
    config?: Record<string, unknown>;
    permissionTool?: string;
    peers?: ProtocolPeerInfo[];
    clusterStatus?: ProtocolClusterStatus;
    teamJobs?: ProtocolTeamJob[];
    scoreboard?: ProtocolScoreboardEntry[];
    /** U3 — replayed to each `discovery/subscribe` (for tests). */
    discoveryEvents?: ProtocolDiscoveryEvent[];
    routePeer?: (input: {
        capabilityTag: string;
        preferredPeerId?: string;
    }) => ProtocolPeerInfo | undefined;
}): ProtocolSessionBackend & {
    cancelled: string[];
    prompts: Array<{
        sessionId: string;
        text: string;
    }>;
};
//# sourceMappingURL=session-backend.d.ts.map