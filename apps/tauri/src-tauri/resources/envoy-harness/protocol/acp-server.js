/**
 * Phase E / Item 10 — ACP server dialect.
 */
import { JsonRpcError, JsonRpcErrorCode } from "./types.js";
export const ACP_PROTOCOL_VERSION = 1;
/** Attach ACP handlers to a JSON-RPC connection. */
export function attachAcpServer(options) {
    const { connection, backend } = options;
    const serverInfo = options.serverInfo ?? {
        name: "envoy-harness",
        version: "0.0.0",
    };
    const sessions = new Map();
    let discoveryUnsubscribe;
    let initialized = false;
    connection.setRequestHandler(async (method, params) => {
        switch (method) {
            case "initialize":
                initialized = true;
                return {
                    protocolVersion: ACP_PROTOCOL_VERSION,
                    serverInfo,
                    capabilities: {
                        loadSession: true,
                        promptCapabilities: {
                            image: true,
                            audio: false,
                            embeddedContext: false,
                        },
                        mcpServers: false,
                    },
                };
            case "authenticate":
                return { authenticated: true };
            case "session/new": {
                assertInitialized(initialized);
                const cwd = readOptionalCwd(params);
                const { sessionId } = await backend.createSession(cwd !== undefined ? { cwd } : undefined);
                sessions.set(sessionId, { busy: false, abort: undefined });
                return { sessionId };
            }
            case "session/load": {
                assertInitialized(initialized);
                if (backend.loadSession === undefined) {
                    throw new JsonRpcError("session/load not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const sessionId = readSessionId(params);
                const cwd = readOptionalCwd(params);
                const loaded = await backend.loadSession({
                    sessionId,
                    ...(cwd !== undefined ? { cwd } : {}),
                });
                sessions.set(loaded.sessionId, { busy: false, abort: undefined });
                return { sessionId: loaded.sessionId };
            }
            case "sessions/list": {
                assertInitialized(initialized);
                if (backend.listSessions === undefined) {
                    throw new JsonRpcError("sessions/list not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const sessions = await backend.listSessions();
                return { sessions };
            }
            case "session/prompt": {
                assertInitialized(initialized);
                const p = parsePromptParams(params);
                const state = sessions.get(p.sessionId);
                if (state === undefined) {
                    throw new JsonRpcError(`unknown session: ${p.sessionId}`, JsonRpcErrorCode.SESSION_ERROR);
                }
                if (state.busy) {
                    throw new JsonRpcError(`session busy: ${p.sessionId}`, JsonRpcErrorCode.SESSION_ERROR);
                }
                state.busy = true;
                const ac = new AbortController();
                state.abort = ac;
                try {
                    return await backend.prompt({
                        sessionId: p.sessionId,
                        prompt: p.prompt,
                        signal: ac.signal,
                        requestPermission: async (req) => {
                            // Defensive parse: the host's `onPermissionRequest`
                            // may return any shape (the typed contract is
                            // `Promise<"allow" | "deny">`, but a misbehaving
                            // client could return null or an object without
                            // `decision`). Treat anything other than a literal
                            // `"allow"` as deny.
                            // 5-minute ceiling for permission waits — humans
                            // might walk away, but the host should still
                            // answer eventually.
                            const raw = await connection.request("session/request_permission", {
                                sessionId: req.sessionId,
                                toolName: req.toolName,
                                description: req.description,
                                args: req.args,
                            }, 5 * 60_000);
                            const decision = typeof raw === "object" &&
                                raw !== null &&
                                "decision" in raw &&
                                typeof raw.decision === "string"
                                ? raw.decision
                                : undefined;
                            return decision === "allow" ? "allow" : "deny";
                        },
                        onUpdate: (msg) => {
                            connection.notify("session/update", {
                                sessionId: p.sessionId,
                                message: msg,
                            });
                        },
                        onActivity: (activity) => {
                            connection.notify("session/activity", {
                                sessionId: p.sessionId,
                                activity,
                            });
                        },
                        onToken: (token) => {
                            connection.notify("session/token", {
                                sessionId: p.sessionId,
                                token,
                            });
                        },
                    });
                }
                finally {
                    state.busy = false;
                    state.abort = undefined;
                }
            }
            case "session/cancel": {
                assertInitialized(initialized);
                const sessionId = readSessionId(params);
                const state = sessions.get(sessionId);
                if (state === undefined) {
                    throw new JsonRpcError(`unknown session: ${sessionId}`, JsonRpcErrorCode.SESSION_ERROR);
                }
                backend.cancel(sessionId);
                state.abort?.abort();
                return { cancelled: true };
            }
            case "peers/list": {
                assertInitialized(initialized);
                return { peers: backend.listPeers?.() ?? [] };
            }
            case "cluster/status": {
                assertInitialized(initialized);
                return {
                    cluster: (await backend.clusterStatus?.()) ?? {
                        peers: [],
                        connected: 0,
                        failed: 0,
                    },
                };
            }
            case "team/jobs": {
                assertInitialized(initialized);
                return { jobs: backend.teamJobs?.() ?? [] };
            }
            case "scoreboard/summary": {
                assertInitialized(initialized);
                return { entries: backend.scoreboardSummary?.() ?? [] };
            }
            case "discovery/subscribe": {
                assertInitialized(initialized);
                if (backend.subscribeDiscovery === undefined) {
                    return { subscribed: false };
                }
                discoveryUnsubscribe?.();
                const unsub = backend.subscribeDiscovery((event) => {
                    connection.notify("discovery/event", { event });
                });
                discoveryUnsubscribe =
                    typeof unsub === "function" ? unsub : undefined;
                return { subscribed: true };
            }
            case "cluster/route": {
                assertInitialized(initialized);
                const input = parseRouteInput(params);
                return {
                    peer: backend.routePeer?.(input) ?? null,
                };
            }
            case "cluster/connect": {
                assertInitialized(initialized);
                if (backend.connectPeer === undefined) {
                    throw new JsonRpcError("cluster/connect not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const input = parseConnectPeerInput(params);
                return await backend.connectPeer(input);
            }
            case "config/get": {
                assertInitialized(initialized);
                return backend.getConfig?.() ?? {};
            }
            case "tools/list": {
                assertInitialized(initialized);
                return { tools: backend.listTools?.() ?? [] };
            }
            case "session/compact": {
                assertInitialized(initialized);
                if (backend.compact === undefined) {
                    throw new JsonRpcError("session/compact not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSessionCompactParams(params);
                return { result: await backend.compact(p) };
            }
            case "session/set_model": {
                assertInitialized(initialized);
                if (backend.setModel === undefined) {
                    throw new JsonRpcError("session/set_model not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSetModelParams(params);
                return { result: await backend.setModel(p) };
            }
            case "session/set_policy": {
                assertInitialized(initialized);
                if (backend.setPolicy === undefined) {
                    throw new JsonRpcError("session/set_policy not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSetPolicyParams(params);
                return { result: await backend.setPolicy(p) };
            }
            case "session/get_policy": {
                assertInitialized(initialized);
                if (backend.getPolicy === undefined) {
                    throw new JsonRpcError("session/get_policy not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const sessionId = readSessionId(params);
                return { result: await backend.getPolicy({ sessionId }) };
            }
            case "git/diff": {
                assertInitialized(initialized);
                if (backend.gitDiff === undefined) {
                    throw new JsonRpcError("git/diff not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseGitDiffParams(params);
                return await backend.gitDiff(p);
            }
            case "git/status": {
                assertInitialized(initialized);
                if (backend.gitStatus === undefined) {
                    throw new JsonRpcError("git/status not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const sessionId = readSessionId(params);
                return await backend.gitStatus({ sessionId });
            }
            case "session/context": {
                assertInitialized(initialized);
                if (backend.getSessionContext === undefined) {
                    throw new JsonRpcError("session/context not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.getSessionContext({
                    sessionId: readSessionId(params),
                });
            }
            case "session/hooks": {
                assertInitialized(initialized);
                if (backend.listSessionHooks === undefined) {
                    throw new JsonRpcError("session/hooks not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const res = await backend.listSessionHooks({
                    sessionId: readSessionId(params),
                });
                return res;
            }
            case "session/mcp": {
                assertInitialized(initialized);
                if (backend.listSessionMcp === undefined) {
                    throw new JsonRpcError("session/mcp not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.listSessionMcp({
                    sessionId: readSessionId(params),
                });
            }
            case "session/agents": {
                assertInitialized(initialized);
                if (backend.listSessionAgents === undefined) {
                    throw new JsonRpcError("session/agents not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.listSessionAgents({
                    sessionId: readSessionId(params),
                });
            }
            case "session/plan": {
                assertInitialized(initialized);
                if (backend.sessionPlan === undefined) {
                    throw new JsonRpcError("session/plan not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionPlan(parseSessionPlanParams(params));
            }
            case "session/memory": {
                assertInitialized(initialized);
                if (backend.sessionMemory === undefined) {
                    throw new JsonRpcError("session/memory not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionMemory(parseSessionMemoryParams(params));
            }
            case "session/review": {
                assertInitialized(initialized);
                if (backend.sessionReview === undefined) {
                    throw new JsonRpcError("session/review not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSessionReviewParams(params);
                return await backend.sessionReview(p);
            }
            case "session/init": {
                assertInitialized(initialized);
                if (backend.sessionInit === undefined) {
                    throw new JsonRpcError("session/init not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionInit({
                    sessionId: readSessionId(params),
                });
            }
            default:
                throw new JsonRpcError(`method not found: ${method}`, JsonRpcErrorCode.METHOD_NOT_FOUND);
        }
    });
    return () => {
        for (const [, state] of sessions)
            state.abort?.abort();
        sessions.clear();
        discoveryUnsubscribe?.();
        discoveryUnsubscribe = undefined;
    };
}
function parseRouteInput(params) {
    if (params === null ||
        typeof params !== "object" ||
        typeof params.capabilityTag !== "string" ||
        params.capabilityTag.length === 0) {
        throw new JsonRpcError("capabilityTag required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const preferred = params.preferredPeerId;
    return {
        capabilityTag: params.capabilityTag,
        ...(typeof preferred === "string" ? { preferredPeerId: preferred } : {}),
    };
}
function parseConnectPeerInput(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("id and endpoint required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const id = params.id;
    const endpoint = params.endpoint;
    if (typeof id !== "string" || id.length === 0) {
        throw new JsonRpcError("id required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    if (typeof endpoint !== "string" || endpoint.length === 0) {
        throw new JsonRpcError("endpoint required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const model = params.model;
    const capabilities = params.capabilities;
    return {
        id,
        endpoint,
        ...(typeof model === "string" && model.length > 0 ? { model } : {}),
        ...(Array.isArray(capabilities)
            ? {
                capabilities: capabilities.filter((c) => typeof c === "string" && c.length > 0),
            }
            : {}),
    };
}
function assertInitialized(initialized) {
    if (!initialized) {
        throw new JsonRpcError("server not initialized; call initialize first", JsonRpcErrorCode.INVALID_REQUEST);
    }
}
function readOptionalCwd(params) {
    if (params !== null &&
        typeof params === "object" &&
        typeof params.cwd === "string") {
        return params.cwd;
    }
    return undefined;
}
function readSessionId(params) {
    if (params !== null &&
        typeof params === "object" &&
        typeof params.sessionId === "string") {
        return params.sessionId;
    }
    throw new JsonRpcError("sessionId required", JsonRpcErrorCode.INVALID_PARAMS);
}
function parsePromptParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    if (typeof obj.sessionId !== "string") {
        throw new JsonRpcError("sessionId required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    if (Array.isArray(obj.content)) {
        const blocks = parsePromptContentBlocks(obj.content);
        if (blocks.length === 0) {
            throw new JsonRpcError("content required", JsonRpcErrorCode.INVALID_PARAMS);
        }
        return { sessionId: obj.sessionId, prompt: { content: blocks } };
    }
    const text = typeof obj.text === "string"
        ? obj.text
        : typeof obj.prompt === "string"
            ? obj.prompt
            : typeof obj.prompt === "object" &&
                obj.prompt !== null &&
                typeof obj.prompt.text === "string"
                ? obj.prompt.text
                : undefined;
    if (text === undefined) {
        throw new JsonRpcError("text required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    return { sessionId: obj.sessionId, prompt: { text } };
}
function parsePromptContentBlocks(content) {
    const out = [];
    for (const block of content) {
        if (block === null || typeof block !== "object")
            continue;
        const b = block;
        if (b.type === "text" && typeof b.text === "string" && b.text.length > 0) {
            out.push({ type: "text", text: b.text });
            continue;
        }
        if (b.type === "image" &&
            typeof b.mimeType === "string" &&
            typeof b.data === "string" &&
            b.data.length > 0) {
            out.push({ type: "image", mimeType: b.mimeType, data: b.data });
        }
    }
    return out;
}
function parseSessionCompactParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    const keep = typeof obj.keep === "number" && Number.isFinite(obj.keep)
        ? obj.keep
        : undefined;
    const budget = typeof obj.budget === "number" && Number.isFinite(obj.budget)
        ? obj.budget
        : undefined;
    const summarize = obj.summarize === true;
    return {
        sessionId,
        ...(keep !== undefined ? { keep } : {}),
        ...(budget !== undefined ? { budget } : {}),
        ...(summarize ? { summarize: true } : {}),
    };
}
function parseSetModelParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    if (typeof obj.provider !== "string" || obj.provider.length === 0) {
        throw new JsonRpcError("provider required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const model = typeof obj.model === "string" && obj.model.length > 0 ? obj.model : undefined;
    return {
        sessionId,
        provider: obj.provider,
        ...(model !== undefined ? { model } : {}),
    };
}
const SANDBOX_MODES = new Set([
    "read-only",
    "workspace-write",
    "danger-full-access",
]);
const APPROVAL_MODES = new Set([
    "unless-trusted",
    "on-request",
    "granular",
    "never",
]);
function parseSetPolicyParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    const sandbox = typeof obj.sandbox === "string" && SANDBOX_MODES.has(obj.sandbox)
        ? obj.sandbox
        : undefined;
    const approval = typeof obj.approval === "string" && APPROVAL_MODES.has(obj.approval)
        ? obj.approval
        : undefined;
    const autoRun = typeof obj.autoRun === "string" &&
        (obj.autoRun === "always-confirm" ||
            obj.autoRun === "safe-only" ||
            obj.autoRun === "off")
        ? obj.autoRun
        : undefined;
    if (sandbox === undefined && approval === undefined && autoRun === undefined) {
        throw new JsonRpcError("sandbox, approval, or autoRun required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    return {
        sessionId,
        ...(sandbox !== undefined ? { sandbox } : {}),
        ...(approval !== undefined ? { approval } : {}),
        ...(autoRun !== undefined ? { autoRun } : {}),
    };
}
function parseGitDiffParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    const staged = obj.staged === true ? true : undefined;
    const stat = obj.stat === true ? true : undefined;
    return {
        sessionId,
        ...(staged !== undefined ? { staged } : {}),
        ...(stat !== undefined ? { stat } : {}),
    };
}
function parseSessionPlanParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    if (typeof obj.action !== "string" || obj.action.length === 0) {
        throw new JsonRpcError("action required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const text = typeof obj.text === "string" && obj.text.length > 0 ? obj.text : undefined;
    const reason = typeof obj.reason === "string" && obj.reason.length > 0
        ? obj.reason
        : undefined;
    return {
        sessionId,
        action: obj.action,
        ...(text !== undefined ? { text } : {}),
        ...(reason !== undefined ? { reason } : {}),
    };
}
function parseSessionMemoryParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    const op = obj.op;
    if (op !== "list" && op !== "read" && op !== "add") {
        throw new JsonRpcError("op must be list|read|add", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const name = typeof obj.name === "string" && obj.name.length > 0 ? obj.name : undefined;
    const body = typeof obj.body === "string" && obj.body.length > 0 ? obj.body : undefined;
    return {
        sessionId,
        op,
        ...(name !== undefined ? { name } : {}),
        ...(body !== undefined ? { body } : {}),
    };
}
function parseSessionReviewParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const sessionId = readSessionId(params);
    const staged = params.staged === true ? true : undefined;
    return {
        sessionId,
        ...(staged !== undefined ? { staged } : {}),
    };
}
//# sourceMappingURL=acp-server.js.map