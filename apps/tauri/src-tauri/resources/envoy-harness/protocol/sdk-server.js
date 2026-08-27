/**
 * Phase E / Item 11 — embedding SDK server dialect.
 */
import { JsonRpcError, JsonRpcErrorCode } from "./types.js";
/** Attach SDK handlers to a JSON-RPC connection. */
export function attachSdkServer(options) {
    const { connection, backend } = options;
    const sessions = new Map();
    let discoveryUnsubscribe;
    connection.setRequestHandler(async (method, params) => {
        switch (method) {
            case "session/create": {
                const cwd = params !== null &&
                    typeof params === "object" &&
                    typeof params.cwd === "string"
                    ? params.cwd
                    : undefined;
                const { sessionId } = await backend.createSession(cwd !== undefined ? { cwd } : undefined);
                sessions.set(sessionId, { busy: false, abort: undefined });
                return { sessionId };
            }
            case "session/prompt": {
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
                            // See acp-server.ts for the rationale: defensive
                            // parse the host's response; anything other than
                            // a literal `"allow"` is deny. Same 5-minute
                            // ceiling for permission waits.
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
                            connection.notify("session/event", {
                                sessionId: p.sessionId,
                                type: "message",
                                message: msg,
                            });
                        },
                        onActivity: (activity) => {
                            connection.notify("session/event", {
                                sessionId: p.sessionId,
                                type: "activity",
                                activity,
                            });
                        },
                        onToken: (token) => {
                            connection.notify("session/event", {
                                sessionId: p.sessionId,
                                type: "token",
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
                const sessionId = readSessionId(params);
                const state = sessions.get(sessionId);
                if (state === undefined) {
                    throw new JsonRpcError(`unknown session: ${sessionId}`, JsonRpcErrorCode.SESSION_ERROR);
                }
                backend.cancel(sessionId);
                state.abort?.abort();
                return { cancelled: true };
            }
            case "config/get":
                return backend.getConfig?.() ?? {};
            case "tools/list":
                return { tools: backend.listTools?.() ?? [] };
            case "session/compact": {
                if (backend.compact === undefined) {
                    throw new JsonRpcError("session/compact not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSdkCompactParams(params);
                return { result: await backend.compact(p) };
            }
            case "session/set_model": {
                if (backend.setModel === undefined) {
                    throw new JsonRpcError("session/set_model not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSdkSetModelParams(params);
                return { result: await backend.setModel(p) };
            }
            case "session/set_policy": {
                if (backend.setPolicy === undefined) {
                    throw new JsonRpcError("session/set_policy not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSdkSetPolicyParams(params);
                return { result: await backend.setPolicy(p) };
            }
            case "git/diff": {
                if (backend.gitDiff === undefined) {
                    throw new JsonRpcError("git/diff not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const p = parseSdkGitDiffParams(params);
                return await backend.gitDiff(p);
            }
            case "git/status": {
                if (backend.gitStatus === undefined) {
                    throw new JsonRpcError("git/status not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                const sessionId = readSessionId(params);
                return await backend.gitStatus({ sessionId });
            }
            case "session/context": {
                if (backend.getSessionContext === undefined) {
                    throw new JsonRpcError("session/context not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.getSessionContext({
                    sessionId: readSessionId(params),
                });
            }
            case "session/hooks": {
                if (backend.listSessionHooks === undefined) {
                    throw new JsonRpcError("session/hooks not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.listSessionHooks({
                    sessionId: readSessionId(params),
                });
            }
            case "session/mcp": {
                if (backend.listSessionMcp === undefined) {
                    throw new JsonRpcError("session/mcp not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.listSessionMcp({
                    sessionId: readSessionId(params),
                });
            }
            case "session/agents": {
                if (backend.listSessionAgents === undefined) {
                    throw new JsonRpcError("session/agents not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.listSessionAgents({
                    sessionId: readSessionId(params),
                });
            }
            case "session/plan": {
                if (backend.sessionPlan === undefined) {
                    throw new JsonRpcError("session/plan not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionPlan(parseSdkPlanParams(params));
            }
            case "session/memory": {
                if (backend.sessionMemory === undefined) {
                    throw new JsonRpcError("session/memory not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionMemory(parseSdkMemoryParams(params));
            }
            case "session/review": {
                if (backend.sessionReview === undefined) {
                    throw new JsonRpcError("session/review not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionReview(parseSdkReviewParams(params));
            }
            case "session/init": {
                if (backend.sessionInit === undefined) {
                    throw new JsonRpcError("session/init not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.sessionInit({
                    sessionId: readSessionId(params),
                });
            }
            case "peers/list":
                return { peers: backend.listPeers?.() ?? [] };
            case "cluster/status":
                return {
                    cluster: (await backend.clusterStatus?.()) ?? {
                        peers: [],
                        connected: 0,
                        failed: 0,
                    },
                };
            case "team/jobs":
                return { jobs: backend.teamJobs?.() ?? [] };
            case "scoreboard/summary":
                return { entries: backend.scoreboardSummary?.() ?? [] };
            case "discovery/subscribe":
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
            case "cluster/route":
                return {
                    peer: backend.routePeer?.(parseSdkRouteInput(params)) ?? null,
                };
            case "cluster/connect":
                if (backend.connectPeer === undefined) {
                    throw new JsonRpcError("cluster/connect not supported", JsonRpcErrorCode.METHOD_NOT_FOUND);
                }
                return await backend.connectPeer(parseSdkConnectPeerInput(params));
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
function parseSdkRouteInput(params) {
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
function parseSdkConnectPeerInput(params) {
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
        const blocks = [];
        for (const block of obj.content) {
            if (block === null || typeof block !== "object")
                continue;
            const b = block;
            if (b.type === "text" && typeof b.text === "string" && b.text.length > 0) {
                blocks.push({ type: "text", text: b.text });
            }
            else if (b.type === "image" &&
                typeof b.mimeType === "string" &&
                typeof b.data === "string" &&
                b.data.length > 0) {
                blocks.push({ type: "image", mimeType: b.mimeType, data: b.data });
            }
        }
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
function parseSdkCompactParams(params) {
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
    const summarize = obj.summarize === true ? true : undefined;
    return {
        sessionId,
        ...(keep !== undefined ? { keep } : {}),
        ...(budget !== undefined ? { budget } : {}),
        ...(summarize !== undefined ? { summarize } : {}),
    };
}
function parseSdkSetModelParams(params) {
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
const SDK_SANDBOX = new Set([
    "read-only",
    "workspace-write",
    "danger-full-access",
]);
const SDK_APPROVAL = new Set([
    "unless-trusted",
    "on-request",
    "granular",
    "never",
]);
function parseSdkSetPolicyParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    const sandbox = typeof obj.sandbox === "string" && SDK_SANDBOX.has(obj.sandbox)
        ? obj.sandbox
        : undefined;
    const approval = typeof obj.approval === "string" && SDK_APPROVAL.has(obj.approval)
        ? obj.approval
        : undefined;
    if (sandbox === undefined && approval === undefined) {
        throw new JsonRpcError("sandbox or approval required", JsonRpcErrorCode.INVALID_PARAMS);
    }
    return {
        sessionId,
        ...(sandbox !== undefined ? { sandbox } : {}),
        ...(approval !== undefined ? { approval } : {}),
    };
}
function parseSdkGitDiffParams(params) {
    if (params === null || typeof params !== "object") {
        throw new JsonRpcError("invalid params", JsonRpcErrorCode.INVALID_PARAMS);
    }
    const obj = params;
    const sessionId = readSessionId(params);
    return {
        sessionId,
        ...(obj.staged === true ? { staged: true } : {}),
        ...(obj.stat === true ? { stat: true } : {}),
    };
}
function parseSdkPlanParams(params) {
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
function parseSdkMemoryParams(params) {
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
function parseSdkReviewParams(params) {
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
//# sourceMappingURL=sdk-server.js.map