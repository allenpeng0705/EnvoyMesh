/**
 * Team runner — executes a `TeamConfig` once.
 *
 * **What this module does:**
 * 1. Topologically sorts the agents by `dependsOn`.
 * 2. For each agent, in order:
 *    - Builds a system prompt (the agent's
 *      `systemPrompt`).
 *    - Builds the user message: the agent's
 *      `objective` (with `${input}` substituted
 *      to the team-level input) + the upstream
 *      agents' final text.
 *    - Constructs an `Agent` with the configured
 *      model + the message + the system prompt.
 *    - Runs the agent; captures the final text.
 * 3. Returns a `TeamResult` with per-agent results
 *    in execution order.
 *
 * **Why topological sort:** a downstream agent
 * shouldn't run before its upstream agents finish.
 * The sort gives a stable order; ties (no shared
 * ancestor) preserve TOML order.
 *
 * **Why in-process:** v0 has no distributed
 * execution. The host (system cron, k8s CronJob)
 * calls `runOnce()` on schedule. The orchestrator
 * can run multiple teams in parallel by spawning
 * multiple `Team.runOnce()` calls in different
 * processes.
 *
 * **Why error-on-missing-dependency:** a typo'd
 * `dependsOn` ID is a bug, not a soft failure.
 * The runner fails fast with a clear error
 * ("agent X depends on Y, but Y is not in the
 * team"). The host sees the error in the result.
 *
 * **Why error-on-cycle:** a cycle is a bug in
 * the config. The runner detects cycles during
 * topological sort and throws.
 *
 * **Stability:** `Team` (class) is the public
 * surface. Additive; new options on the
 * constructor are additive.
 */
import { Agent, buildAgentSystemPrompt, HookRegistry, InMemorySession, newSessionId, ToolRegistry, } from "../index.js";
/** The runner. */
export class Team {
    config;
    model;
    cwd;
    optionsFor;
    input;
    peerExecutor;
    constructor(options) {
        this.config = options.config;
        this.model = options.model;
        this.cwd = options.cwd ?? process.cwd();
        this.optionsFor = options.optionsFor;
        this.input = options.input ?? "";
        this.peerExecutor = options.peerExecutor;
    }
    /**
     * Execute the team once. Returns a `TeamResult`
     * with per-agent results in execution order.
     *
     * **Errors:** if the team has a missing
     * dependency (an ID in `dependsOn` that doesn't
     * exist) or a cycle, throws immediately. The
     * caller catches the error and decides what to
     * do (log, surface to the user, etc.).
     *
     * **Per-agent errors:** if an individual agent
     * throws (e.g. model error), the team result
     * is `status: "failed"` and includes the error
     * message. The agents that ran before the
     * failure are still in the result.
     */
    async runOnce() {
        // 1. Validate + topological sort.
        const order = topologicalSort(this.config.agents);
        const results = new Map();
        // 2. Run each agent in order.
        for (const spec of order) {
            const startedAt = Date.now();
            const upstreamContext = this.buildUpstreamContext(spec, results);
            const objective = substituteInput(spec.objective, this.input);
            const prompt = upstreamContext
                ? `${objective}\n\nContext from upstream agents:\n${upstreamContext}`
                : objective;
            try {
                const { text, stopReason } = await this.runAgent(spec, prompt);
                // Record the agent's output even when it failed (the
                // transcript / error text is useful context).
                results.set(spec.id, {
                    id: spec.id,
                    finalText: text,
                    stopReason,
                    durationMs: Date.now() - startedAt,
                });
                if (stopReason === "aborted") {
                    // The agent's run caught an internal error
                    // (e.g. a model error) and returned an
                    // "aborted" result instead of throwing.
                    // Treat it as a per-agent failure.
                    return {
                        teamName: this.config.name,
                        agents: Array.from(results.values()),
                        status: "failed",
                        error: `agent ${spec.id} aborted (see transcript for details)`,
                    };
                }
            }
            catch (err) {
                return {
                    teamName: this.config.name,
                    agents: Array.from(results.values()),
                    status: "failed",
                    error: `agent ${spec.id} failed: ${err.message}`,
                };
            }
        }
        return {
            teamName: this.config.name,
            agents: Array.from(results.values()),
            status: "completed",
        };
    }
    // --- helpers ---
    async runAgent(spec, prompt) {
        // D4 — peer-hosted agents dispatch through the host's peer executor
        // (the peer package routes via PeerRegistry + PeerMeshSubmitter).
        if (spec.host !== undefined && spec.host !== "local") {
            if (this.peerExecutor === undefined) {
                throw new Error(`agent ${spec.id} host "${spec.host}" requires TeamOptions.peerExecutor ` +
                    "(provided by @envoymesh/envoy-harness-peer's createPeerTeamExecutor)");
            }
            const text = await this.peerExecutor(spec, prompt);
            return { text, stopReason: "end_turn" };
        }
        const session = new InMemorySession(newSessionId(), {
            cwd: this.cwd,
            permissionMode: "read-only",
            startedAt: new Date().toISOString(),
        });
        const tools = new ToolRegistry();
        const hooks = new HookRegistry();
        const partial = this.optionsFor?.(spec) ?? {};
        const agent = new Agent({
            model: this.model,
            tools,
            session,
            hooks,
            cwd: this.cwd,
            // Phase G — when the team spec doesn't pin a system prompt, fall
            // back to the default assembly (AGENTS.md discovery + guidance).
            systemPrompt: spec.systemPrompt ??
                (await buildAgentSystemPrompt({ cwd: this.cwd })),
            ...partial,
        });
        const result = await agent.run(prompt);
        const text = result.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        return { text, stopReason: result.stopReason };
    }
    buildUpstreamContext(spec, results) {
        if (spec.dependsOn.length === 0)
            return "";
        const lines = [];
        for (const dep of spec.dependsOn) {
            const r = results.get(dep);
            if (!r) {
                // Defensive: topological sort should have
                // caught this, but if a cycle slipped
                // through, surface it here.
                throw new Error(`agent ${spec.id} depends on ${dep}, but ${dep} has not run yet`);
            }
            lines.push(`[${r.id}]: ${r.finalText}`);
        }
        return lines.join("\n\n");
    }
}
// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------
/**
 * Sort the agents in topological order (each agent
 * comes after all of its `dependsOn` agents). Throws
 * on missing dependency or cycle.
 */
function topologicalSort(agents) {
    const byId = new Map(agents.map((a) => [a.id, a]));
    // Validate every dependsOn.
    for (const a of agents) {
        for (const dep of a.dependsOn) {
            if (!byId.has(dep)) {
                throw new Error(`agent ${a.id} depends on ${dep}, but ${dep} is not in the team`);
            }
        }
    }
    // Kahn's algorithm: process nodes with in-degree 0
    // first, then remove their outgoing edges.
    const inDegree = new Map();
    const dependents = new Map();
    for (const a of agents) {
        inDegree.set(a.id, a.dependsOn.length);
        for (const dep of a.dependsOn) {
            const list = dependents.get(dep) ?? [];
            list.push(a.id);
            dependents.set(dep, list);
        }
    }
    const queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0)
            queue.push(id);
    }
    const order = [];
    while (queue.length > 0) {
        // Pop the first; preserve insertion order for
        // ties.
        const id = queue.shift();
        const spec = byId.get(id);
        if (!spec) {
            throw new Error(`internal: missing spec for ${id}`);
        }
        order.push(spec);
        for (const next of dependents.get(id) ?? []) {
            const nextDeg = (inDegree.get(next) ?? 0) - 1;
            inDegree.set(next, nextDeg);
            if (nextDeg === 0)
                queue.push(next);
        }
    }
    if (order.length !== agents.length) {
        throw new Error(`team has a cycle: topological sort produced ${order.length} of ${agents.length} agents`);
    }
    return order;
}
/** Replace `${input}` with the team-level input. */
function substituteInput(objective, input) {
    return objective.replace(/\$\{input\}/g, input);
}
//# sourceMappingURL=runner.js.map