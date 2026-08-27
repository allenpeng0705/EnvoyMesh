/**
 * @envoymesh/envoy-harness-client — typed stdio client for
 * the ACP + embedding SDK dialects.
 */
import { type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { JsonRpcConnection } from "@envoymesh/envoy-harness";
import type { ClientClusterStatus, ClientDiscoveryEvent, ClientPeerInfo, ClientScoreboardEntry, ClientSessionSummary, ClientTeamJob, EhuiDataSource } from "./ehui.js";
export type { ClientClusterStatus, ClientDiscoveryEvent, ClientPeerInfo, ClientScoreboardEntry, ClientSessionSummary, ClientTeamJob, EhuiDataSource, EhuiPanelId, } from "./ehui.js";
export { EHUI_PANELS } from "./ehui.js";
export interface EnvoyHarnessClientOptions {
    input: Readable;
    output: Writable;
    /**
     * Default JSON-RPC request timeout (ms). `session/prompt` uses a
     * longer per-call budget — agent turns include LLM + tools + user
     * questions. Default 120s.
     */
    defaultRequestTimeoutMs?: number;
    onPermissionRequest?: (req: {
        sessionId: string;
        toolName: string;
        description: string;
        args: unknown;
    }) => Promise<"allow" | "deny">;
    onEvent?: (event: {
        dialect: "acp" | "sdk";
        params: unknown;
    }) => void;
}
export declare class EnvoyHarnessClient {
    #private;
    constructor(options: EnvoyHarnessClientOptions);
    /** Register a notification handler; returns an unsubscribe fn. */
    onNotification(method: string, handler: (params: unknown) => void): () => void;
    initialize(): Promise<{
        protocolVersion: number;
        capabilities?: {
            promptCapabilities?: {
                image?: boolean;
            };
        };
    }>;
    acpNewSession(params?: {
        cwd?: string;
    }): Promise<{
        sessionId: string;
    }>;
    loadSession(sessionId: string, cwd?: string): Promise<{
        sessionId: string;
    }>;
    /** U6a.5 — list persisted sessions (`sessions/list`). */
    listSessions(): Promise<ClientSessionSummary[]>;
    createSession(params?: {
        cwd?: string;
    }): Promise<{
        sessionId: string;
    }>;
    /** One agent turn — LLM + tools + user questions (Codex-style long budget). */
    static readonly PROMPT_TIMEOUT_MS = 900000;
    prompt(sessionId: string, text: string, content?: ReadonlyArray<{
        type: "text";
        text: string;
    } | {
        type: "image";
        mimeType: string;
        data: string;
    }>): Promise<{
        stopReason: string;
        messages: unknown[];
        turnHints?: {
            followUps?: string[];
            deferred?: Array<{
                task: string;
                reason: string;
            }>;
        };
    }>;
    cancel(sessionId: string): Promise<void>;
    listTools(): Promise<Array<{
        name: string;
        description: string;
    }>>;
    getConfig(): Promise<Record<string, unknown>>;
    /** R3 — the host's connected peer cluster (`peers/list`, both dialects). */
    listPeers(): Promise<ClientPeerInfo[]>;
    /** U1 — the host's cluster status (`cluster/status`, both dialects). */
    clusterStatus(): Promise<ClientClusterStatus>;
    /** U1 — the host's team jobs (`team/jobs`, both dialects). */
    teamJobs(): Promise<ClientTeamJob[]>;
    /** U1 — the host's peer reputation scoreboard (`scoreboard/summary`). */
    scoreboardSummary(): Promise<ClientScoreboardEntry[]>;
    /**
     * U3 — subscribe to discovery/lifecycle events. Returns an
     * unsubscribe function. The server forwards `discovery/event`
     * notifications to `listener`.
     */
    subscribeDiscovery(listener: (event: ClientDiscoveryEvent) => void): Promise<() => void>;
    /**
     * U3 — routing preview: which peer would run a task with this
     * capability tag (`cluster/route`). Returns undefined when the host
     * has no peer for the tag.
     */
    routePeer(capabilityTag: string, preferredPeerId?: string): Promise<ClientPeerInfo | undefined>;
    /** Runtime mesh wiring (`cluster/connect`). */
    connectClusterPeer(params: {
        id: string;
        endpoint: string;
        model?: string;
        capabilities?: readonly string[];
    }): Promise<{
        ok: boolean;
        error?: string;
    }>;
    compactSession(sessionId: string, options?: {
        keep?: number;
        budget?: number;
        summarize?: boolean;
    }): Promise<{
        messageCountBefore: number;
        messageCountAfter: number;
        droppedCount: number;
        totalTokensAfter?: number;
        overBudget?: boolean;
        summarized?: boolean;
    }>;
    setSessionModel(sessionId: string, provider: string, model?: string): Promise<{
        provider: string;
        model?: string;
    }>;
    setSessionPolicy(sessionId: string, policy: {
        sandbox?: "read-only" | "workspace-write" | "danger-full-access";
        approval?: "unless-trusted" | "on-request" | "granular" | "never";
        autoRun?: "always-confirm" | "safe-only" | "off";
    }): Promise<{
        sandbox?: string;
        approval?: string;
        autoRun?: string;
    }>;
    getSessionPolicy(sessionId: string): Promise<{
        sandbox?: string;
        approval?: string;
        autoRun?: string;
    }>;
    gitDiff(sessionId: string, options?: {
        staged?: boolean;
        stat?: boolean;
    }): Promise<string>;
    gitStatus(sessionId: string): Promise<string>;
    getSessionContext(sessionId: string): Promise<{
        messageCount: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }>;
    listSessionHooks(sessionId: string): Promise<Array<{
        event: string;
        handlerCount: number;
    }>>;
    listSessionMcp(sessionId: string): Promise<string[]>;
    listSessionAgents(sessionId: string): Promise<string>;
    sessionPlan(sessionId: string, action: string, options?: {
        text?: string;
        reason?: string;
    }): Promise<string>;
    sessionMemory(sessionId: string, op: "list" | "read" | "add", options?: {
        name?: string;
        body?: string;
    }): Promise<string>;
    sessionReview(sessionId: string, staged?: boolean): Promise<string>;
    sessionInit(sessionId: string): Promise<string>;
    get dialect(): "acp" | "sdk" | undefined;
    close(): void;
}
/** Create an EHUI data-source for a live session (EnvoyGo side panel). */
export declare function createEhuiDataSource(client: EnvoyHarnessClient, sessionId: string): EhuiDataSource;
export { JsonRpcConnection };
export interface SpawnAcpOptions {
    command?: string;
    args?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stderr?: "inherit" | "pipe" | "ignore";
    onPermissionRequest?: EnvoyHarnessClientOptions["onPermissionRequest"];
    onEvent?: EnvoyHarnessClientOptions["onEvent"];
}
export interface SpawnedAcp {
    client: EnvoyHarnessClient;
    child: ChildProcessWithoutNullStreams;
    close(): void;
}
/** Spawn a harness ACP server and return a typed client over its stdio. */
export declare function spawnAcpServer(options?: SpawnAcpOptions): SpawnedAcp;
//# sourceMappingURL=index.d.ts.map