/**
 * @envoymesh/envoy-harness-client — typed stdio client for
 * the ACP + embedding SDK dialects.
 */
import { spawn } from "node:child_process";
import { JsonRpcConnection } from "@envoymesh/envoy-harness";
export { EHUI_PANELS } from "./ehui.js";
export class EnvoyHarnessClient {
    #conn;
    #onEvent;
    #notificationHandlers = new Map();
    #dialect;
    constructor(options) {
        this.#onEvent = options.onEvent;
        this.#conn = new JsonRpcConnection({
            input: options.input,
            output: options.output,
            defaultRequestTimeoutMs: options.defaultRequestTimeoutMs ?? 120_000,
            onRequest: async (method, params) => {
                if (method === "session/request_permission") {
                    const req = params;
                    const decision = (await options.onPermissionRequest?.(req)) ?? "deny";
                    return { decision };
                }
                throw new Error(`unexpected server request: ${method}`);
            },
            onNotification: (method, params) => {
                const handlers = this.#notificationHandlers.get(method);
                if (handlers !== undefined) {
                    for (const handler of [...handlers])
                        handler(params);
                }
                if (method === "session/update") {
                    this.#onEvent?.({ dialect: "acp", params });
                }
                else if (method === "session/event") {
                    this.#onEvent?.({ dialect: "sdk", params });
                }
            },
        });
    }
    /** Register a notification handler; returns an unsubscribe fn. */
    onNotification(method, handler) {
        let set = this.#notificationHandlers.get(method);
        if (set === undefined) {
            set = new Set();
            this.#notificationHandlers.set(method, set);
        }
        set.add(handler);
        return () => {
            set.delete(handler);
            if (set.size === 0)
                this.#notificationHandlers.delete(method);
        };
    }
    async initialize() {
        this.#dialect = "acp";
        return (await this.#conn.request("initialize", {}));
    }
    async acpNewSession(params) {
        this.#dialect = "acp";
        return (await this.#conn.request("session/new", params ?? {}));
    }
    async loadSession(sessionId, cwd) {
        this.#dialect = "acp";
        return (await this.#conn.request("session/load", {
            sessionId,
            ...(cwd !== undefined ? { cwd } : {}),
        }));
    }
    /** U6a.5 — list persisted sessions (`sessions/list`). */
    async listSessions() {
        const res = (await this.#conn.request("sessions/list", {}));
        return res.sessions;
    }
    async createSession(params) {
        this.#dialect = "sdk";
        return (await this.#conn.request("session/create", params ?? {}));
    }
    /** One agent turn — LLM + tools + user questions (Codex-style long budget). */
    static PROMPT_TIMEOUT_MS = 900_000;
    async prompt(sessionId, text, content) {
        return (await this.#conn.request("session/prompt", {
            sessionId,
            ...(content !== undefined && content.length > 0 ? { content } : { text }),
        }, EnvoyHarnessClient.PROMPT_TIMEOUT_MS));
    }
    async cancel(sessionId) {
        await this.#conn.request("session/cancel", { sessionId });
    }
    async listTools() {
        const res = (await this.#conn.request("tools/list", {}));
        return res.tools;
    }
    async getConfig() {
        return (await this.#conn.request("config/get", {}));
    }
    /** R3 — the host's connected peer cluster (`peers/list`, both dialects). */
    async listPeers() {
        const res = (await this.#conn.request("peers/list", {}));
        return res.peers;
    }
    /** U1 — the host's cluster status (`cluster/status`, both dialects). */
    async clusterStatus() {
        const res = (await this.#conn.request("cluster/status", {}));
        return res.cluster;
    }
    /** U1 — the host's team jobs (`team/jobs`, both dialects). */
    async teamJobs() {
        const res = (await this.#conn.request("team/jobs", {}));
        return res.jobs;
    }
    /** U1 — the host's peer reputation scoreboard (`scoreboard/summary`). */
    async scoreboardSummary() {
        const res = (await this.#conn.request("scoreboard/summary", {}));
        return res.entries;
    }
    /**
     * U3 — subscribe to discovery/lifecycle events. Returns an
     * unsubscribe function. The server forwards `discovery/event`
     * notifications to `listener`.
     */
    async subscribeDiscovery(listener) {
        // Register the notification handler BEFORE the request so events
        // emitted during subscription (initial replay) are not missed.
        const remove = this.onNotification("discovery/event", (params) => {
            const { event } = (params ?? {});
            if (event !== undefined)
                listener(event);
        });
        try {
            const res = (await this.#conn.request("discovery/subscribe", {}));
            if (!res.subscribed) {
                throw new Error("discovery/subscribe not supported by this host");
            }
            return remove;
        }
        catch (err) {
            remove();
            throw err;
        }
    }
    /**
     * U3 — routing preview: which peer would run a task with this
     * capability tag (`cluster/route`). Returns undefined when the host
     * has no peer for the tag.
     */
    async routePeer(capabilityTag, preferredPeerId) {
        const res = (await this.#conn.request("cluster/route", {
            capabilityTag,
            ...(preferredPeerId !== undefined ? { preferredPeerId } : {}),
        }));
        return res.peer ?? undefined;
    }
    /** Runtime mesh wiring (`cluster/connect`). */
    async connectClusterPeer(params) {
        return (await this.#conn.request("cluster/connect", {
            id: params.id,
            endpoint: params.endpoint,
            ...(params.model !== undefined ? { model: params.model } : {}),
            ...(params.capabilities !== undefined
                ? { capabilities: [...params.capabilities] }
                : {}),
        }));
    }
    async compactSession(sessionId, options) {
        const res = (await this.#conn.request("session/compact", {
            sessionId,
            ...(options?.keep !== undefined ? { keep: options.keep } : {}),
            ...(options?.budget !== undefined ? { budget: options.budget } : {}),
            ...(options?.summarize === true ? { summarize: true } : {}),
        }));
        return res.result;
    }
    async setSessionModel(sessionId, provider, model) {
        const res = (await this.#conn.request("session/set_model", {
            sessionId,
            provider,
            ...(model !== undefined ? { model } : {}),
        }));
        return res.result;
    }
    async setSessionPolicy(sessionId, policy) {
        const res = (await this.#conn.request("session/set_policy", {
            sessionId,
            ...(policy.sandbox !== undefined ? { sandbox: policy.sandbox } : {}),
            ...(policy.approval !== undefined ? { approval: policy.approval } : {}),
            ...(policy.autoRun !== undefined ? { autoRun: policy.autoRun } : {}),
        }));
        return res.result;
    }
    async getSessionPolicy(sessionId) {
        const res = (await this.#conn.request("session/get_policy", {
            sessionId,
        }));
        return res.result;
    }
    async gitDiff(sessionId, options) {
        const res = (await this.#conn.request("git/diff", {
            sessionId,
            ...(options?.staged === true ? { staged: true } : {}),
            ...(options?.stat === true ? { stat: true } : {}),
        }));
        return res.output;
    }
    async gitStatus(sessionId) {
        const res = (await this.#conn.request("git/status", {
            sessionId,
        }));
        return res.output;
    }
    async getSessionContext(sessionId) {
        return (await this.#conn.request("session/context", {
            sessionId,
        }));
    }
    async listSessionHooks(sessionId) {
        const res = (await this.#conn.request("session/hooks", {
            sessionId,
        }));
        return res.hooks;
    }
    async listSessionMcp(sessionId) {
        const res = (await this.#conn.request("session/mcp", {
            sessionId,
        }));
        return res.servers;
    }
    async listSessionAgents(sessionId) {
        const res = (await this.#conn.request("session/agents", {
            sessionId,
        }));
        return res.output;
    }
    async sessionPlan(sessionId, action, options) {
        const res = (await this.#conn.request("session/plan", {
            sessionId,
            action,
            ...(options?.text !== undefined ? { text: options.text } : {}),
            ...(options?.reason !== undefined ? { reason: options.reason } : {}),
        }));
        return res.output;
    }
    async sessionMemory(sessionId, op, options) {
        const res = (await this.#conn.request("session/memory", {
            sessionId,
            op,
            ...(options?.name !== undefined ? { name: options.name } : {}),
            ...(options?.body !== undefined ? { body: options.body } : {}),
        }));
        return res.output;
    }
    async sessionReview(sessionId, staged) {
        const res = (await this.#conn.request("session/review", {
            sessionId,
            ...(staged === true ? { staged: true } : {}),
        }));
        return res.output;
    }
    async sessionInit(sessionId) {
        const res = (await this.#conn.request("session/init", {
            sessionId,
        }));
        return res.output;
    }
    get dialect() {
        return this.#dialect;
    }
    close() {
        this.#conn.close();
    }
}
/** Create an EHUI data-source for a live session (EnvoyGo side panel). */
export function createEhuiDataSource(client, sessionId) {
    return {
        sessionId,
        plan: (action, options) => client.sessionPlan(sessionId, action, options),
        memory: (op, options) => client.sessionMemory(sessionId, op, options),
        gitDiff: (options) => client.gitDiff(sessionId, options),
        gitStatus: () => client.gitStatus(sessionId),
        clusterStatus: () => client.clusterStatus(),
        listPeers: () => client.listPeers(),
        teamJobs: () => client.teamJobs(),
        scoreboardSummary: () => client.scoreboardSummary(),
        listSessions: () => client.listSessions(),
        subscribeDiscovery: (listener) => client.subscribeDiscovery(listener),
    };
}
export { JsonRpcConnection };
/** Spawn a harness ACP server and return a typed client over its stdio. */
export function spawnAcpServer(options = {}) {
    const command = options.command ?? "envoy-harness";
    const args = options.args ?? ["--acp"];
    const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", options.stderr ?? "inherit"],
    });
    const client = new EnvoyHarnessClient({
        input: child.stdout,
        output: child.stdin,
        ...(options.onPermissionRequest !== undefined
            ? { onPermissionRequest: options.onPermissionRequest }
            : {}),
        ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
    });
    return {
        client,
        child,
        close() {
            client.close();
            if (!child.killed)
                child.kill();
        },
    };
}
//# sourceMappingURL=index.js.map