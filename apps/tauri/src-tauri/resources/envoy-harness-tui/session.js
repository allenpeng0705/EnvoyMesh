/**
 * TuiSession — ACP-backed controller (IO-free for hermetic tests).
 */
import { hasTurnHints } from "@envoymesh/envoy-harness";
import { parsePeerEndpoint } from "@envoymesh/envoy-harness";
import { parseSlash } from "./slash.js";
import { formatActivityLine } from "./activity.js";
import { buildPermissionPreview } from "./permission-preview.js";
import { formatPermissionBlock, formatTranscriptLine, } from "./transcript.js";
export class TuiSession {
    #client;
    #cwd;
    #initialAutoRun;
    #onTranscript;
    #onPermission;
    #lines = [];
    #sessionId;
    #busy = false;
    /** Dedupe live `session/update` vs final `session/prompt` messages. */
    #turnSeen = new Set();
    /** Tool lines shown via activity this turn — skip duplicate tool transcript. */
    #turnToolActivityLines = 0;
    /** Status line indices to collapse when the turn ends. */
    #turnActivityLineIndices = [];
    #streamingAssistantText = "";
    #streamingAssistantLineIndex;
    #removeSessionToken;
    #removeSessionUpdate;
    #removeSessionActivity;
    #lastTurnCostUsd;
    #clusterSnapshot;
    #discoveryEvents = [];
    #gitDiffStaged = false;
    #gitDiffStat = false;
    #imagesSupported = false;
    #permissionWaiter;
    #turnHints;
    #transcriptFormat;
    /** Codex-shaped follow-ups typed while a turn is in flight. */
    #inputQueue = [];
    constructor(options) {
        this.#client = options.client;
        this.#cwd = options.cwd;
        this.#initialAutoRun = options.initialAutoRun;
        this.#onTranscript = options.onTranscript;
        this.#onPermission = options.onPermission;
        this.#transcriptFormat = options.transcriptFormat ?? {};
        this.#removeSessionUpdate = this.#client.onNotification("session/update", (params) => this.#handleSessionUpdate(params));
        this.#removeSessionToken = this.#client.onNotification("session/token", (params) => this.#handleSessionToken(params));
        const unsubActivity = this.#client.onNotification("session/activity", (params) => this.#handleSessionActivity(params));
        const unsubSdkEvent = this.#client.onNotification("session/event", (params) => {
            const p = params;
            if (p.type === "activity" && p.activity !== undefined) {
                this.#pushActivity(p.activity);
            }
            else if (p.type === "token" && p.token !== undefined) {
                this.#handleSessionToken({ token: p.token });
            }
        });
        this.#removeSessionActivity = () => {
            unsubActivity();
            unsubSdkEvent();
        };
    }
    /** Wire live transcript refresh (screen / plain mode). */
    setOnTranscript(cb) {
        this.#onTranscript = cb;
    }
    get sessionId() {
        return this.#sessionId;
    }
    get busy() {
        return this.#busy;
    }
    /** Follow-up chips from the last completed turn (`suggest_follow_ups`). */
    get turnHints() {
        return this.#turnHints;
    }
    clearTurnHints() {
        this.#turnHints = undefined;
    }
    get transcript() {
        return this.#lines;
    }
    get pendingPermission() {
        return this.#permissionWaiter?.req;
    }
    /** The last cluster snapshot (U2 cluster rail). */
    get clusterSnapshot() {
        return this.#clusterSnapshot;
    }
    /** U3/U5 — recent discovery events (newest last, max 20; /trace reads it). */
    get discoveryEvents() {
        return [...this.#discoveryEvents];
    }
    get gitDiffStaged() {
        return this.#gitDiffStaged;
    }
    get gitDiffStat() {
        return this.#gitDiffStat;
    }
    get imagesSupported() {
        return this.#imagesSupported;
    }
    /** Queued user lines waiting for the current turn to finish. */
    get queuedInputCount() {
        return this.#inputQueue.length;
    }
    /** Drop one queued line (newest last). */
    dropQueuedInput(index) {
        if (index < 0 || index >= this.#inputQueue.length)
            return false;
        this.#inputQueue.splice(index, 1);
        return true;
    }
    clearQueuedInput() {
        this.#inputQueue.length = 0;
    }
    setTranscriptFormat(options) {
        this.#transcriptFormat = options;
    }
    /** Used by EnvoyHarnessClient.onPermissionRequest. */
    handlePermissionRequest(req) {
        if (this.#onPermission !== undefined) {
            return this.#onPermission(req);
        }
        return new Promise((resolve) => {
            this.#permissionWaiter = { req, resolve };
            this.#push("status", formatPermissionBlock(req, undefined, this.#transcriptFormat));
            void buildPermissionPreview(req, this.#cwd).then((preview) => {
                if (preview !== undefined && preview.trim().length > 0) {
                    this.#push("status", formatPermissionBlock(req, preview, this.#transcriptFormat));
                }
            });
        });
    }
    answerPermission(decision) {
        if (this.#permissionWaiter === undefined)
            return false;
        this.#permissionWaiter.resolve(decision);
        this.#permissionWaiter = undefined;
        this.#push("status", `permission → ${decision}`);
        return true;
    }
    async start() {
        const init = await this.#client.initialize();
        this.#imagesSupported =
            init.capabilities?.promptCapabilities?.image === true;
        this.#push("status", `ACP protocol v${init.protocolVersion} — /help for commands`);
        const created = await this.#client.acpNewSession(this.#cwd !== undefined ? { cwd: this.#cwd } : undefined);
        this.#sessionId = created.sessionId;
        if (this.#initialAutoRun !== undefined) {
            try {
                await this.#client.setSessionPolicy(created.sessionId, {
                    autoRun: this.#initialAutoRun,
                });
            }
            catch {
                // Best-effort — the policy is a convenience, not a hard requirement.
            }
        }
        this.#push("system", `session ${created.sessionId}`);
    }
    async submit(line) {
        const trimmed = line.trim();
        if (trimmed.length === 0)
            return "ok";
        const slash = parseSlash(trimmed);
        if (slash !== null) {
            switch (slash.kind) {
                case "help":
                    this.#push("status", slash.text.trimEnd());
                    return "ok";
                case "cancel":
                    await this.cancel();
                    return "ok";
                case "mesh":
                    if (slash.action === "connect" && slash.endpoint !== undefined) {
                        await this.connectMeshPeer(slash.endpoint);
                    }
                    return "ok";
                case "peers":
                    await this.listPeers();
                    return "ok";
                case "cluster":
                    await this.showClusterStatus();
                    return "ok";
                case "team":
                    await this.showTeamJobs();
                    return "ok";
                case "scoreboard":
                    await this.showScoreboard();
                    return "ok";
                case "route":
                    await this.showRoute(slash.tag);
                    return "ok";
                case "search":
                    await this.showSearch(slash.term);
                    return "ok";
                case "trace":
                    this.showTrace();
                    return "ok";
                case "tools":
                    await this.showTools();
                    return "ok";
                case "config":
                    await this.showConfig();
                    return "ok";
                case "session":
                    this.showSessionInfo();
                    return "ok";
                case "status":
                    await this.showStatus();
                    return "ok";
                case "cost":
                    this.showCost();
                    return "ok";
                case "clear":
                    this.clearTranscript();
                    return "ok";
                case "new":
                    await this.newSession();
                    return "ok";
                case "context":
                    this.showContext();
                    return "ok";
                case "compact":
                    await this.runCompact(slash.keep, slash.budget, slash.summarize);
                    return "ok";
                case "provider":
                    await this.runSetProvider(slash.name, slash.model);
                    return "ok";
                case "model":
                    this.showModelUsage();
                    return "ok";
                case "sandbox":
                    await this.runSetSandbox(slash.mode);
                    return "ok";
                case "approval":
                    await this.runSetApproval(slash.mode);
                    return "ok";
                case "permissions":
                    await this.runSetAutoRun(slash.mode);
                    return "ok";
                case "diff":
                    await this.showGitDiff(slash.staged, slash.stat);
                    return "ok";
                case "git-status":
                    await this.showGitStatus();
                    return "ok";
                case "hooks":
                    await this.showHooks();
                    return "ok";
                case "mcp":
                    await this.showMcp();
                    return "ok";
                case "agents":
                    await this.showAgents();
                    return "ok";
                case "memory":
                    await this.runMemory(slash.op, slash.name, slash.body);
                    return "ok";
                case "plan":
                    await this.runPlan(slash.action, slash.text, slash.reason);
                    return "ok";
                case "review":
                    await this.runReview(slash.staged);
                    return "ok";
                case "init":
                    await this.runInit();
                    return "ok";
                case "resume":
                    if (slash.id !== undefined && slash.id.length > 0) {
                        await this.resumeSession(slash.id);
                    }
                    return "ok";
                case "quit":
                    return "quit";
                case "unknown":
                    this.#push("status", `unknown slash: /${slash.command} — try /help`);
                    return "ok";
            }
        }
        if (this.#sessionId === undefined) {
            this.#push("status", "not started — call start() first");
            return "ok";
        }
        if (this.#busy) {
            this.#inputQueue.push(trimmed);
            this.#push("status", `queued (${this.#inputQueue.length}): ${trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed}`);
            return "ok";
        }
        await this.#runUserPrompt(trimmed);
        return "ok";
    }
    async #runUserPrompt(trimmed) {
        if (this.#sessionId === undefined)
            return;
        this.#push("user", trimmed);
        this.#busy = true;
        this.#turnHints = undefined;
        this.#turnSeen.clear();
        this.#turnToolActivityLines = 0;
        this.#turnActivityLineIndices.length = 0;
        this.#streamingAssistantText = "";
        this.#streamingAssistantLineIndex = undefined;
        try {
            const result = await this.#client.prompt(this.#sessionId, trimmed);
            for (const msg of result.messages) {
                this.#consumeProtocolMessage(msg);
            }
            if (result.turnHints !== undefined && hasTurnHints(result.turnHints)) {
                this.#turnHints = result.turnHints;
                if (result.turnHints.deferred !== undefined) {
                    for (const item of result.turnHints.deferred) {
                        this.#push("status", `deferred: ${item.task} — ${item.reason}`);
                    }
                }
            }
            this.#push("status", `stop: ${result.stopReason}`);
        }
        catch (err) {
            this.#push("status", `error: ${err.message}`);
        }
        finally {
            this.#busy = false;
            this.#turnToolActivityLines = 0;
            this.#turnActivityLineIndices.length = 0;
            this.#streamingAssistantText = "";
            this.#streamingAssistantLineIndex = undefined;
            await this.#drainInputQueue();
        }
    }
    async #drainInputQueue() {
        while (this.#inputQueue.length > 0 && !this.#busy) {
            const next = this.#inputQueue.shift();
            if (next === undefined || next.trim().length === 0)
                continue;
            await this.#runUserPrompt(next.trim());
        }
    }
    async cancel() {
        if (this.#sessionId === undefined)
            return;
        this.#clearStreamingAssistant();
        try {
            await this.#client.cancel(this.#sessionId);
            this.#push("status", "cancelled");
        }
        catch (err) {
            this.#push("status", `cancel failed: ${err.message}`);
        }
    }
    /** Drop or finalize the in-flight assistant stream line on cancel. */
    #clearStreamingAssistant() {
        if (this.#streamingAssistantLineIndex === undefined) {
            this.#streamingAssistantText = "";
            return;
        }
        const line = this.#lines[this.#streamingAssistantLineIndex];
        if (line === undefined) {
            this.#streamingAssistantText = "";
            this.#streamingAssistantLineIndex = undefined;
            return;
        }
        line.text =
            line.text.length > 0 ? `${line.text} [cancelled]` : "(cancelled)";
        this.#streamingAssistantText = "";
        this.#streamingAssistantLineIndex = undefined;
        this.#onTranscript?.(this.#lines);
    }
    /** R3 — render the host's connected peer cluster (`peers/list`). */
    async listPeers() {
        let peers;
        try {
            peers = await this.#client.listPeers();
        }
        catch (err) {
            this.#push("status", `peers unavailable: ${err.message}`);
            return;
        }
        if (peers.length === 0) {
            this.#push("status", "Peers (0) — no peers connected");
            return;
        }
        const lines = peers.map((p) => {
            const model = p.model !== undefined ? ` model=${p.model}` : "";
            const caps = p.capabilities !== undefined && p.capabilities.length > 0
                ? ` capabilities=${p.capabilities.join(",")}`
                : "";
            return `- ${p.id}${model}${caps}`;
        });
        this.#push("status", `Peers (${peers.length})\n${lines.join("\n")}`);
    }
    /** U2 — refresh the cluster snapshot (`cluster/status`); best-effort. */
    async refreshCluster() {
        try {
            this.#clusterSnapshot = await this.#client.clusterStatus();
        }
        catch {
            // Keep the previous snapshot (or undefined); the UI shows the rail
            // only when a snapshot exists.
        }
        return this.#clusterSnapshot;
    }
    /** `/mesh connect <id@host:port>` — runtime peer wiring. */
    async connectMeshPeer(raw) {
        let spec;
        try {
            spec = parsePeerEndpoint(raw);
        }
        catch (err) {
            this.#push("status", `mesh connect: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        try {
            const result = await this.#client.connectClusterPeer({
                id: spec.id,
                endpoint: spec.endpoint,
            });
            if (result.ok) {
                this.#push("status", `mesh: connected ${spec.id}@${spec.endpoint}`);
                await this.refreshCluster();
            }
            else {
                this.#push("status", `mesh connect failed: ${result.error ?? "unknown error"}`);
            }
        }
        catch (err) {
            this.#push("status", `mesh connect unavailable: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /** U2 — the host's model label from `config/get` (best-effort). */
    async getModelLabel() {
        try {
            const config = await this.#client.getConfig();
            const model = config.model;
            return typeof model === "string" && model.length > 0 ? model : undefined;
        }
        catch {
            return undefined;
        }
    }
    /** U3 — buffer one discovery event (the UI renders it as a ticker). */
    noteDiscoveryEvent(event) {
        this.#discoveryEvents.push(event);
        if (this.#discoveryEvents.length > 20) {
            this.#discoveryEvents.splice(0, this.#discoveryEvents.length - 20);
        }
    }
    /** U3 — subscribe to the host's discovery stream; returns unsubscribe. */
    async subscribeDiscovery(onEvent) {
        const remove = await this.#client.subscribeDiscovery((event) => {
            this.noteDiscoveryEvent(event);
            onEvent?.();
        });
        return remove;
    }
    /** U3 — routing preview (plain mode renders it as a status line). */
    async showRoute(tag) {
        let peer;
        try {
            peer = await this.#client.routePeer(tag);
        }
        catch (err) {
            this.#push("status", `route unavailable: ${err.message}`);
            return;
        }
        if (peer === undefined) {
            this.#push("status", `Route "${tag}" → no peer available`);
            return;
        }
        const model = peer.model !== undefined ? ` model=${peer.model}` : "";
        const caps = peer.capabilities !== undefined && peer.capabilities.length > 0
            ? ` capabilities=${peer.capabilities.join(",")}`
            : "";
        this.#push("status", `Route "${tag}" → ${peer.id}${model}${caps}`);
    }
    /** U3 — raw peer list for the view renderer. */
    async peers() {
        return this.#client.listPeers();
    }
    /** U3 — raw team jobs for the view renderer. */
    async teamJobs() {
        return this.#client.teamJobs();
    }
    /** U3 — raw scoreboard entries for the view renderer. */
    async scoreboard() {
        return this.#client.scoreboardSummary();
    }
    /** U3 — raw routing preview for the view renderer. */
    async route(tag) {
        return this.#client.routePeer(tag);
    }
    /** U5 — plain-mode `/search`: list matching transcript lines. */
    async showSearch(term) {
        const matches = this.#lines
            .map((line) => formatTranscriptLine(line, this.#transcriptFormat))
            .filter((line) => line.toLowerCase().includes(term.toLowerCase()));
        if (matches.length === 0) {
            this.#push("status", `Search "${term}" — no matches`);
            return;
        }
        this.#push("status", `Search "${term}" — ${matches.length} match${matches.length === 1 ? "" : "es"}\n${matches.map((m) => `  ${m}`).join("\n")}`);
    }
    /** U5 — plain-mode `/trace`: the discovery event log. */
    showTrace() {
        if (this.#discoveryEvents.length === 0) {
            this.#push("status", "Trace (0) — no events yet");
            return;
        }
        this.#push("status", `Trace (${this.#discoveryEvents.length})\n${[...this.#discoveryEvents]
            .reverse()
            .map((e) => `  ${e.at} ${e.peerId} ${e.type}`)
            .join("\n")}`);
    }
    /** U1 — render the host's cluster status (`cluster/status`). */
    async showClusterStatus() {
        let cluster;
        try {
            cluster = await this.#client.clusterStatus();
        }
        catch (err) {
            this.#push("status", `cluster unavailable: ${err.message}`);
            return;
        }
        if (cluster.peers.length === 0) {
            this.#push("status", `Cluster (0) — no peers connected (${cluster.connected}/${cluster.failed})`);
            return;
        }
        const lines = cluster.peers.map((p) => {
            const model = p.model !== undefined ? ` model=${p.model}` : "";
            const caps = p.capabilities !== undefined && p.capabilities.length > 0
                ? ` capabilities=${p.capabilities.join(",")}`
                : "";
            const health = p.health.ok
                ? ` ok${p.health.rttMs !== undefined ? ` rtt=${p.health.rttMs}ms` : ""}`
                : ` down${p.health.error !== undefined ? ` (${p.health.error})` : ""}`;
            return `- ${p.id}${model}${caps}${health}`;
        });
        this.#push("status", `Cluster (${cluster.peers.length} connected=${cluster.connected} failed=${cluster.failed})\n${lines.join("\n")}`);
    }
    /** U1 — render the host's team jobs (`team/jobs`). */
    async showTeamJobs() {
        let jobs;
        try {
            jobs = await this.#client.teamJobs();
        }
        catch (err) {
            this.#push("status", `team unavailable: ${err.message}`);
            return;
        }
        if (jobs.length === 0) {
            this.#push("status", "Team (0) — no jobs");
            return;
        }
        const lines = jobs.map((j) => {
            const cost = j.costUsd !== undefined ? ` cost=${j.costUsd}` : "";
            const agents = j.agents
                .map((a) => `${a.id}@${a.host}=${a.status}`)
                .join(", ");
            return `- ${j.jobId} ${j.status}${cost}\n    ${agents}`;
        });
        this.#push("status", `Team (${jobs.length})\n${lines.join("\n")}`);
    }
    /** U1 — render the host's peer reputation scoreboard (`scoreboard/summary`). */
    async showScoreboard() {
        let entries;
        try {
            entries = await this.#client.scoreboardSummary();
        }
        catch (err) {
            this.#push("status", `scoreboard unavailable: ${err.message}`);
            return;
        }
        if (entries.length === 0) {
            this.#push("status", "Scoreboard (0) — no verdicts yet");
            return;
        }
        const lines = entries.map((e) => `- ${e.workerPeerId} ${e.skillId} score=${e.score} pass=${e.passCount} fail=${e.failCount} partial=${e.partialCount}`);
        this.#push("status", `Scoreboard (${entries.length})\n${lines.join("\n")}`);
    }
    close() {
        this.#removeSessionUpdate();
        this.#removeSessionToken();
        this.#removeSessionActivity();
        this.#client.close();
    }
    /** R3 — list tools (`tools/list`). */
    async showTools() {
        let tools;
        try {
            tools = await this.#client.listTools();
        }
        catch (err) {
            this.#push("status", `tools unavailable: ${err.message}`);
            return;
        }
        if (tools.length === 0) {
            this.#push("status", "Tools (0)");
            return;
        }
        const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
        this.#push("status", `Tools (${tools.length})\n${lines.join("\n")}`);
    }
    /** Show harness config (`config/get`). */
    async showConfig() {
        try {
            const config = await this.#client.getConfig();
            const lines = Object.entries(config).map(([k, v]) => `- ${k}: ${String(v)}`);
            this.#push("status", lines.length > 0 ? `Config\n${lines.join("\n")}` : "Config (empty)");
        }
        catch (err) {
            this.#push("status", `config unavailable: ${err.message}`);
        }
    }
    showSessionInfo() {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        this.#push("status", `Session ${this.#sessionId}\n  messages: ${this.#lines.length}\n  busy: ${this.#busy}`);
    }
    async showStatus() {
        const model = await this.getModelLabel();
        const parts = [
            `session: ${this.#sessionId ?? "—"}`,
            `busy: ${this.#busy}`,
            `transcript lines: ${this.#lines.length}`,
            ...(model !== undefined ? [`model: ${model}`] : []),
            ...(this.#lastTurnCostUsd !== undefined
                ? [`last turn cost: $${this.#lastTurnCostUsd.toFixed(4)}`]
                : []),
        ];
        this.#push("status", `Status\n  ${parts.join("\n  ")}`);
    }
    showCost() {
        if (this.#lastTurnCostUsd === undefined) {
            this.#push("status", "Cost — no completed turn yet (run a prompt first)");
            return;
        }
        this.#push("status", `Last turn cost: $${this.#lastTurnCostUsd.toFixed(4)}`);
    }
    clearTranscript() {
        this.#lines.length = 0;
        this.#onTranscript?.(this.#lines);
        this.#push("status", "transcript cleared (agent session unchanged)");
    }
    /** New ACP session — fresh agent context on the host. */
    async newSession() {
        if (this.#busy) {
            this.#push("status", "busy — /cancel first, then /new");
            return;
        }
        try {
            const created = await this.#client.acpNewSession(this.#cwd !== undefined ? { cwd: this.#cwd } : undefined);
            this.#sessionId = created.sessionId;
            if (this.#initialAutoRun !== undefined) {
                try {
                    await this.#client.setSessionPolicy(created.sessionId, {
                        autoRun: this.#initialAutoRun,
                    });
                }
                catch {
                    // Best-effort.
                }
            }
            this.#lines.length = 0;
            this.#turnSeen.clear();
            this.#lastTurnCostUsd = undefined;
            this.#onTranscript?.(this.#lines);
            this.#push("system", `new session ${created.sessionId}`);
        }
        catch (err) {
            this.#push("status", `new session failed: ${err.message}`);
        }
    }
    /** Transcript footprint (display only — agent memory unchanged). */
    showContext() {
        const byRole = new Map();
        for (const line of this.#lines) {
            byRole.set(line.role, (byRole.get(line.role) ?? 0) + 1);
        }
        const parts = [
            `session: ${this.#sessionId ?? "—"}`,
            `transcript lines: ${this.#lines.length}`,
            ...[...byRole.entries()].map(([role, n]) => `${role}: ${n}`),
            ...(this.#lastTurnCostUsd !== undefined
                ? [`last turn cost: $${this.#lastTurnCostUsd.toFixed(4)}`]
                : []),
        ];
        this.#push("status", `Context\n  ${parts.join("\n  ")}`);
    }
    showModelUsage() {
        this.#push("status", "Model swap: use /provider <openai|anthropic|deepseek|ollama> [model-id]\n" +
            "Example: /provider deepseek deepseek-chat");
    }
    async runCompact(keep, budget, summarize) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        if (summarize === true) {
            this.#push("status", "summarizing transcript…");
        }
        try {
            const r = await this.#client.compactSession(this.#sessionId, {
                ...(keep !== undefined ? { keep } : {}),
                ...(budget !== undefined ? { budget } : {}),
                ...(summarize === true ? { summarize: true } : {}),
            });
            const note = r.overBudget === true
                ? " (over budget)"
                : r.summarized === false && summarize === true
                    ? " (summarize failed — drop-oldest fallback)"
                    : r.summarized === true
                        ? " (with LLM summary)"
                        : "";
            const tokens = r.totalTokensAfter !== undefined
                ? `, ${r.totalTokensAfter} tokens`
                : "";
            this.#push("status", `Compacted: ${r.messageCountBefore} → ${r.messageCountAfter} messages (dropped ${r.droppedCount}${tokens})${note}`);
        }
        catch (err) {
            this.#push("status", `compact failed: ${err.message}`);
        }
    }
    async runSetProvider(name, model) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        try {
            const r = await this.#client.setSessionModel(this.#sessionId, name, model);
            this.#push("status", `provider: ${r.provider}${r.model !== undefined ? ` model=${r.model}` : ""}`);
        }
        catch (err) {
            this.#push("status", `provider swap failed: ${err.message}`);
        }
    }
    async runSetSandbox(mode) {
        const valid = new Set([
            "read-only",
            "workspace-write",
            "danger-full-access",
        ]);
        if (!valid.has(mode)) {
            this.#push("status", `invalid sandbox: ${mode}`);
            return;
        }
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        try {
            await this.#client.setSessionPolicy(this.#sessionId, {
                sandbox: mode,
            });
            this.#push("status", `sandbox: ${mode}`);
        }
        catch (err) {
            this.#push("status", `sandbox failed: ${err.message}`);
        }
    }
    async runSetApproval(mode) {
        const valid = new Set([
            "unless-trusted",
            "on-request",
            "granular",
            "never",
        ]);
        if (!valid.has(mode)) {
            this.#push("status", `invalid approval: ${mode}`);
            return;
        }
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        try {
            await this.#client.setSessionPolicy(this.#sessionId, {
                approval: mode,
            });
            this.#push("status", `approval: ${mode}`);
        }
        catch (err) {
            this.#push("status", `approval failed: ${err.message}`);
        }
    }
    async runSetAutoRun(mode) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        try {
            if (mode === undefined) {
                // Show the current policy (no getter was available before;
                // `session/get_policy` fills the gap).
                const policy = await this.#client.getSessionPolicy(this.#sessionId);
                const autoRun = policy.autoRun ?? "unset (host default)";
                const label = autoRun === "off"
                    ? "always approve"
                    : autoRun === "always-confirm"
                        ? "always ask"
                        : autoRun === "safe-only"
                            ? "default (auto-run safe)"
                            : autoRun;
                this.#push("status", `permissions: ${label} · sandbox: ${policy.sandbox ?? "?"} · approval: ${policy.approval ?? "?"}`);
                return;
            }
            await this.#client.setSessionPolicy(this.#sessionId, { autoRun: mode });
            const label = mode === "safe-only"
                ? "default (auto-run safe)"
                : mode === "always-confirm"
                    ? "always ask"
                    : "always approve";
            this.#push("status", `permissions: ${label}`);
        }
        catch (err) {
            this.#push("status", `permissions failed: ${err.message}`);
        }
    }
    async showGitDiff(staged, stat) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        try {
            const out = await this.#client.gitDiff(this.#sessionId, {
                ...(staged === true ? { staged: true } : {}),
                ...(stat === true ? { stat: true } : {}),
            });
            this.#push("status", `Git diff\n${out}`);
        }
        catch (err) {
            this.#push("status", `git diff failed: ${err.message}`);
        }
    }
    async showGitStatus() {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        try {
            const out = await this.#client.gitStatus(this.#sessionId);
            this.#push("status", `Git status\n${out}`);
        }
        catch (err) {
            this.#push("status", `git status failed: ${err.message}`);
        }
    }
    async showHooks() {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        try {
            const hooks = await this.#client.listSessionHooks(this.#sessionId);
            if (hooks.length === 0) {
                this.#push("status", "Hooks (0)");
                return;
            }
            const lines = hooks.map((h) => `  ${h.event.padEnd(20)}  ${h.handlerCount} handler(s)`);
            this.#push("status", `Hooks (${hooks.length})\n${lines.join("\n")}`);
        }
        catch (err) {
            this.#push("status", `hooks failed: ${err.message}`);
        }
    }
    async showMcp() {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        try {
            const servers = await this.#client.listSessionMcp(this.#sessionId);
            if (servers.length === 0) {
                this.#push("status", "MCP (0 servers)");
                return;
            }
            this.#push("status", `MCP (${servers.length})\n${servers.map((s) => `  - ${s}`).join("\n")}`);
        }
        catch (err) {
            this.#push("status", `mcp failed: ${err.message}`);
        }
    }
    async showAgents() {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        try {
            const out = await this.#client.listSessionAgents(this.#sessionId);
            this.#push("status", out);
        }
        catch (err) {
            this.#push("status", `agents failed: ${err.message}`);
        }
    }
    async runMemory(op, name, body) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        try {
            const out = await this.#client.sessionMemory(this.#sessionId, op, {
                ...(name !== undefined ? { name } : {}),
                ...(body !== undefined ? { body } : {}),
            });
            this.#push("status", out);
        }
        catch (err) {
            this.#push("status", `memory failed: ${err.message}`);
        }
    }
    async runPlan(action, text, reason) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy && action !== "show") {
            this.#push("status", "busy — /cancel first");
            return;
        }
        try {
            const out = await this.#client.sessionPlan(this.#sessionId, action, {
                ...(text !== undefined ? { text } : {}),
                ...(reason !== undefined ? { reason } : {}),
            });
            this.#push("status", out);
        }
        catch (err) {
            this.#push("status", `plan failed: ${err.message}`);
        }
    }
    async runReview(staged) {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        this.#push("status", "reviewing…");
        try {
            const out = await this.#client.sessionReview(this.#sessionId, staged === true);
            this.#push("status", `Review\n${out}`);
        }
        catch (err) {
            this.#push("status", `review failed: ${err.message}`);
        }
    }
    async runInit() {
        if (this.#sessionId === undefined) {
            this.#push("status", "no active session");
            return;
        }
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        this.#push("status", "generating AGENTS.md…");
        try {
            const out = await this.#client.sessionInit(this.#sessionId);
            this.#push("status", out);
        }
        catch (err) {
            this.#push("status", `init failed: ${err.message}`);
        }
    }
    /** U6 — resume a persisted session (`session/load`). */
    async resumeSession(sessionId) {
        if (this.#busy) {
            this.#push("status", "busy — /cancel first");
            return;
        }
        try {
            const loaded = await this.#client.loadSession(sessionId, this.#cwd);
            this.#sessionId = loaded.sessionId;
            this.#lines.length = 0;
            this.#turnSeen.clear();
            this.#lastTurnCostUsd = undefined;
            this.#onTranscript?.(this.#lines);
            this.#push("system", `resumed session ${loaded.sessionId}`);
        }
        catch (err) {
            this.#push("status", `resume failed: ${err.message}`);
        }
    }
    /** U6a.5 — persisted sessions for resume picker (`sessions/list`). */
    async listPersistedSessions() {
        try {
            return await this.#client.listSessions();
        }
        catch {
            return [];
        }
    }
    /** U6 — plan tab body. */
    async fetchPlanView() {
        if (this.#sessionId === undefined)
            return "";
        return await this.#client.sessionPlan(this.#sessionId, "show");
    }
    /** U6 — memory tab body. */
    async fetchMemoryView() {
        if (this.#sessionId === undefined)
            return "";
        return await this.#client.sessionMemory(this.#sessionId, "list");
    }
    /** U6 — git diff tab body. */
    async fetchGitDiffView(staged, stat) {
        if (this.#sessionId === undefined)
            return "";
        return await this.#client.gitDiff(this.#sessionId, {
            ...(staged === true ? { staged: true } : {}),
            ...(stat === true ? { stat: true } : {}),
        });
    }
    setGitDiffFlags(staged, stat) {
        this.#gitDiffStaged = staged === true;
        this.#gitDiffStat = stat === true;
    }
    #handleSessionActivity(params) {
        if (!this.#busy || this.#sessionId === undefined)
            return;
        const p = params;
        if (p.sessionId !== undefined && p.sessionId !== this.#sessionId)
            return;
        if (p.activity !== undefined) {
            this.#pushActivity(p.activity);
        }
    }
    #pushActivity(activity) {
        if (activity.kind === "agent_end") {
            this.#collapseTurnActivityLines();
        }
        // Quiet live feed: model thinking / successful tool stdout are noise.
        // Keep tool_call (what it's doing), errors, progress, and agent_end.
        if (activity.kind === "model_response")
            return;
        if (activity.kind === "tool_result" && activity.isError !== true)
            return;
        if (activity.kind === "agent_start")
            return;
        const key = activity.kind === "tool_progress"
            ? `${activity.kind}\0${activity.ts ?? ""}\0${activity.summary}`
            : `${activity.kind}\0${activity.summary}\0${activity.ts ?? ""}`;
        if (this.#turnSeen.has(key))
            return;
        this.#turnSeen.add(key);
        if (activity.kind === "tool_call" ||
            activity.kind === "tool_result" ||
            activity.kind === "tool_progress") {
            this.#turnToolActivityLines++;
            this.#turnActivityLineIndices.push(this.#lines.length);
        }
        if (activity.kind === "agent_end" && activity.costUsd !== undefined) {
            this.#lastTurnCostUsd = activity.costUsd;
        }
        this.#push("status", formatActivityLine(activity));
    }
    #collapseTurnActivityLines() {
        if (this.#turnActivityLineIndices.length === 0)
            return;
        const sorted = [...this.#turnActivityLineIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
            this.#lines.splice(idx, 1);
            if (this.#streamingAssistantLineIndex !== undefined &&
                idx < this.#streamingAssistantLineIndex) {
                this.#streamingAssistantLineIndex -= 1;
            }
        }
        this.#turnActivityLineIndices.length = 0;
        this.#turnToolActivityLines = 0;
        this.#onTranscript?.(this.#lines);
    }
    #handleSessionToken(params) {
        if (!this.#busy || this.#sessionId === undefined)
            return;
        const p = params;
        if (p.sessionId !== undefined && p.sessionId !== this.#sessionId)
            return;
        const token = p.token;
        if (token === undefined)
            return;
        if (token.role !== "assistant" ||
            typeof token.delta !== "string" ||
            token.delta.length === 0) {
            return;
        }
        this.#streamingAssistantText += token.delta;
        if (this.#streamingAssistantLineIndex === undefined) {
            this.#lines.push({
                role: "assistant",
                text: this.#streamingAssistantText,
                at: new Date().toISOString(),
            });
            this.#streamingAssistantLineIndex = this.#lines.length - 1;
        }
        else {
            const streamLine = this.#lines[this.#streamingAssistantLineIndex];
            if (streamLine !== undefined) {
                streamLine.text = this.#streamingAssistantText;
            }
        }
        this.#onTranscript?.(this.#lines);
    }
    #handleSessionUpdate(params) {
        if (!this.#busy || this.#sessionId === undefined)
            return;
        const p = params;
        if (p.sessionId !== undefined && p.sessionId !== this.#sessionId)
            return;
        this.#consumeProtocolMessage(p.message);
    }
    #consumeProtocolMessage(msg) {
        if (msg === undefined || msg === null)
            return;
        const m = msg;
        if (typeof m.text !== "string" || m.text.length === 0)
            return;
        const rawRole = m.role ?? "assistant";
        if (rawRole === "user" || rawRole === "system" || rawRole === "status") {
            return;
        }
        const role = rawRole === "assistant" || rawRole === "tool" ? rawRole : "assistant";
        if (role === "assistant" &&
            this.#streamingAssistantLineIndex !== undefined) {
            const streamLine = this.#lines[this.#streamingAssistantLineIndex];
            if (streamLine !== undefined) {
                streamLine.text = m.text;
            }
            this.#turnSeen.add(`${role}\0${m.text}`);
            this.#streamingAssistantLineIndex = undefined;
            this.#streamingAssistantText = "";
            this.#onTranscript?.(this.#lines);
            return;
        }
        if (role === "tool" &&
            this.#busy &&
            this.#turnToolActivityLines > 0) {
            return;
        }
        const key = `${role}\0${m.text}`;
        if (this.#turnSeen.has(key))
            return;
        this.#turnSeen.add(key);
        this.#push(role, m.text);
    }
    renderTranscript() {
        return this.#lines
            .map((line) => formatTranscriptLine(line, this.#transcriptFormat))
            .join("\n");
    }
    #push(role, text) {
        this.#lines.push({
            role,
            text,
            at: new Date().toISOString(),
        });
        this.#onTranscript?.(this.#lines);
    }
}
//# sourceMappingURL=session.js.map