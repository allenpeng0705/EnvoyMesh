/**
 * Phase E — shared session backend for ACP + SDK dialects.
 */
/** In-memory backend for hermetic protocol tests. */
export function createFakeSessionBackend(options) {
    let seq = 0;
    const sessions = new Set();
    const policies = new Map();
    const aborts = new Map();
    const cancelled = [];
    const prompts = [];
    const tools = options?.tools ?? [
        { name: "bash", description: "Run a shell command" },
    ];
    return {
        cancelled,
        prompts,
        async createSession() {
            const sessionId = `sess-${++seq}`;
            sessions.add(sessionId);
            policies.set(sessionId, {
                sandbox: "workspace-write",
                approval: "on-request",
            });
            return { sessionId };
        },
        async prompt(params) {
            if (!sessions.has(params.sessionId)) {
                throw new Error(`unknown session: ${params.sessionId}`);
            }
            const promptText = "text" in params.prompt
                ? params.prompt.text
                : params.prompt.content
                    .map((b) => b.type === "text" ? b.text : `[image:${b.mimeType}]`)
                    .join("\n");
            prompts.push({ sessionId: params.sessionId, text: promptText });
            const ac = new AbortController();
            aborts.set(params.sessionId, ac);
            const onAbort = () => ac.abort();
            params.signal.addEventListener("abort", onAbort, { once: true });
            try {
                if (options?.permissionTool !== undefined) {
                    const decision = await params.requestPermission({
                        sessionId: params.sessionId,
                        toolName: options.permissionTool,
                        description: `Allow ${options.permissionTool}?`,
                        args: {},
                    });
                    if (decision === "deny") {
                        return {
                            stopReason: "permission_denied",
                            messages: [{ role: "assistant", text: "permission denied" }],
                        };
                    }
                }
                if (ac.signal.aborted || params.signal.aborted) {
                    return {
                        stopReason: "cancelled",
                        messages: [{ role: "assistant", text: "cancelled" }],
                    };
                }
                const assistant = {
                    role: "assistant",
                    text: `echo:${promptText}`,
                };
                params.onUpdate?.(assistant);
                return {
                    stopReason: "end_turn",
                    messages: [
                        { role: "user", text: promptText },
                        assistant,
                    ],
                };
            }
            finally {
                params.signal.removeEventListener("abort", onAbort);
                aborts.delete(params.sessionId);
            }
        },
        cancel(sessionId) {
            cancelled.push(sessionId);
            aborts.get(sessionId)?.abort();
        },
        async setPolicy(params) {
            const p = policies.get(params.sessionId);
            if (p === undefined)
                throw new Error(`unknown session: ${params.sessionId}`);
            if (params.sandbox !== undefined)
                p.sandbox = params.sandbox;
            if (params.approval !== undefined)
                p.approval = params.approval;
            if (params.autoRun !== undefined)
                p.autoRun = params.autoRun;
            return { ...p };
        },
        async getPolicy(params) {
            const p = policies.get(params.sessionId);
            if (p === undefined)
                throw new Error(`unknown session: ${params.sessionId}`);
            return { ...p };
        },
        listTools: () => tools,
        getConfig: () => options?.config ?? { version: "0.0.0" },
        ...(options?.peers !== undefined
            ? { listPeers: () => options.peers ?? [] }
            : {}),
        ...(options?.clusterStatus !== undefined
            ? { clusterStatus: () => options.clusterStatus ?? emptyClusterStatus() }
            : {}),
        ...(options?.teamJobs !== undefined
            ? { teamJobs: () => options.teamJobs ?? [] }
            : {}),
        ...(options?.scoreboard !== undefined
            ? { scoreboardSummary: () => options.scoreboard ?? [] }
            : {}),
        ...(options?.discoveryEvents !== undefined
            ? {
                subscribeDiscovery: (listener) => {
                    for (const event of options.discoveryEvents ?? [])
                        listener(event);
                    return () => undefined;
                },
            }
            : {}),
        ...(options?.routePeer !== undefined
            ? { routePeer: options.routePeer }
            : {}),
    };
}
function emptyClusterStatus() {
    return { peers: [], connected: 0, failed: 0 };
}
//# sourceMappingURL=session-backend.js.map