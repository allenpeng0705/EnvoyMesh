/**
 * TuiSession — ACP-backed controller (IO-free for hermetic tests).
 */
import type { ClientClusterStatus, ClientDiscoveryEvent, ClientPeerInfo, ClientScoreboardEntry, ClientTeamJob, EnvoyHarnessClient } from "@envoymesh/envoy-harness-client";
import { type TurnHints } from "@envoymesh/envoy-harness";
import { type TranscriptFormatOptions, type TranscriptLine } from "./transcript.js";
export interface PermissionRequest {
    sessionId: string;
    toolName: string;
    description: string;
    args: unknown;
}
export interface TuiSessionOptions {
    client: EnvoyHarnessClient;
    cwd?: string;
    /** Auto-run permission policy applied when a session starts. */
    initialAutoRun?: "safe-only" | "always-confirm" | "off";
    onTranscript?: (lines: readonly TranscriptLine[]) => void;
    onPermission?: (req: PermissionRequest) => Promise<"allow" | "deny">;
    transcriptFormat?: TranscriptFormatOptions;
}
export declare class TuiSession {
    #private;
    constructor(options: TuiSessionOptions);
    /** Wire live transcript refresh (screen / plain mode). */
    setOnTranscript(cb: (lines: readonly TranscriptLine[]) => void): void;
    get sessionId(): string | undefined;
    get busy(): boolean;
    /** Follow-up chips from the last completed turn (`suggest_follow_ups`). */
    get turnHints(): TurnHints | undefined;
    clearTurnHints(): void;
    get transcript(): readonly TranscriptLine[];
    get pendingPermission(): PermissionRequest | undefined;
    /** The last cluster snapshot (U2 cluster rail). */
    get clusterSnapshot(): ClientClusterStatus | undefined;
    /** U3/U5 — recent discovery events (newest last, max 20; /trace reads it). */
    get discoveryEvents(): readonly ClientDiscoveryEvent[];
    get gitDiffStaged(): boolean;
    get gitDiffStat(): boolean;
    get imagesSupported(): boolean;
    /** Queued user lines waiting for the current turn to finish. */
    get queuedInputCount(): number;
    /** Drop one queued line (newest last). */
    dropQueuedInput(index: number): boolean;
    clearQueuedInput(): void;
    setTranscriptFormat(options: TranscriptFormatOptions): void;
    /** Used by EnvoyHarnessClient.onPermissionRequest. */
    handlePermissionRequest(req: PermissionRequest): Promise<"allow" | "deny">;
    answerPermission(decision: "allow" | "deny"): boolean;
    start(): Promise<void>;
    submit(line: string): Promise<"ok" | "quit">;
    cancel(): Promise<void>;
    /** R3 — render the host's connected peer cluster (`peers/list`). */
    listPeers(): Promise<void>;
    /** U2 — refresh the cluster snapshot (`cluster/status`); best-effort. */
    refreshCluster(): Promise<ClientClusterStatus | undefined>;
    /** `/mesh connect <id@host:port>` — runtime peer wiring. */
    connectMeshPeer(raw: string): Promise<void>;
    /** U2 — the host's model label from `config/get` (best-effort). */
    getModelLabel(): Promise<string | undefined>;
    /** U3 — buffer one discovery event (the UI renders it as a ticker). */
    noteDiscoveryEvent(event: ClientDiscoveryEvent): void;
    /** U3 — subscribe to the host's discovery stream; returns unsubscribe. */
    subscribeDiscovery(onEvent?: () => void): Promise<() => void>;
    /** U3 — routing preview (plain mode renders it as a status line). */
    showRoute(tag: string): Promise<void>;
    /** U3 — raw peer list for the view renderer. */
    peers(): Promise<ClientPeerInfo[]>;
    /** U3 — raw team jobs for the view renderer. */
    teamJobs(): Promise<ClientTeamJob[]>;
    /** U3 — raw scoreboard entries for the view renderer. */
    scoreboard(): Promise<ClientScoreboardEntry[]>;
    /** U3 — raw routing preview for the view renderer. */
    route(tag: string): Promise<ClientPeerInfo | undefined>;
    /** U5 — plain-mode `/search`: list matching transcript lines. */
    showSearch(term: string): Promise<void>;
    /** U5 — plain-mode `/trace`: the discovery event log. */
    showTrace(): void;
    /** U1 — render the host's cluster status (`cluster/status`). */
    showClusterStatus(): Promise<void>;
    /** U1 — render the host's team jobs (`team/jobs`). */
    showTeamJobs(): Promise<void>;
    /** U1 — render the host's peer reputation scoreboard (`scoreboard/summary`). */
    showScoreboard(): Promise<void>;
    close(): void;
    /** R3 — list tools (`tools/list`). */
    showTools(): Promise<void>;
    /** Show harness config (`config/get`). */
    showConfig(): Promise<void>;
    showSessionInfo(): void;
    showStatus(): Promise<void>;
    showCost(): void;
    clearTranscript(): void;
    /** New ACP session — fresh agent context on the host. */
    newSession(): Promise<void>;
    /** Transcript footprint (display only — agent memory unchanged). */
    showContext(): void;
    showModelUsage(): void;
    runCompact(keep?: number, budget?: number, summarize?: boolean): Promise<void>;
    runSetProvider(name: string, model?: string): Promise<void>;
    runSetSandbox(mode: string): Promise<void>;
    runSetApproval(mode: string): Promise<void>;
    runSetAutoRun(mode: "safe-only" | "always-confirm" | "off" | undefined): Promise<void>;
    showGitDiff(staged?: boolean, stat?: boolean): Promise<void>;
    showGitStatus(): Promise<void>;
    showHooks(): Promise<void>;
    showMcp(): Promise<void>;
    showAgents(): Promise<void>;
    runMemory(op: "list" | "read" | "add", name?: string, body?: string): Promise<void>;
    runPlan(action: string, text?: string, reason?: string): Promise<void>;
    runReview(staged?: boolean): Promise<void>;
    runInit(): Promise<void>;
    /** U6 — resume a persisted session (`session/load`). */
    resumeSession(sessionId: string): Promise<void>;
    /** U6a.5 — persisted sessions for resume picker (`sessions/list`). */
    listPersistedSessions(): Promise<Awaited<ReturnType<EnvoyHarnessClient["listSessions"]>>>;
    /** U6 — plan tab body. */
    fetchPlanView(): Promise<string>;
    /** U6 — memory tab body. */
    fetchMemoryView(): Promise<string>;
    /** U6 — git diff tab body. */
    fetchGitDiffView(staged?: boolean, stat?: boolean): Promise<string>;
    setGitDiffFlags(staged?: boolean, stat?: boolean): void;
    renderTranscript(): string;
}
//# sourceMappingURL=session.d.ts.map