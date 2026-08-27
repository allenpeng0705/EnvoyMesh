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
import { Agent, type ModelAdapter } from "../index.js";
import type { AgentSpec, TeamConfig, TeamResult } from "./types.js";
/** Options for `Team`. */
export interface TeamOptions {
    /** The team config (parsed from TOML). */
    config: TeamConfig;
    /** The model adapter. Used for every agent. */
    model: ModelAdapter;
    /** Working directory. Default: `process.cwd()`. */
    cwd?: string;
    /**
     * Optional factory: receive an `AgentSpec` and
     * return a partial `AgentOptions` to merge
     * with the defaults. Used to customize the
     * tool registry, hook registry, tracer, etc.
     * per agent. Default: a fresh `ToolRegistry()`
     * (no tools) + the default `HookRegistry()`
     * (no hooks) for every agent.
     */
    optionsFor?: (spec: AgentSpec) => Partial<ConstructorParameters<typeof Agent>[0]>;
    /**
     * Optional input substitution. The team-level
     * input is used to substitute `${input}` in
     * each agent's `objective`. Default: empty
     * string.
     */
    input?: string;
    /**
     * D4 — dispatch an agent whose `spec.host` is `"peer://<id>"`. The
     * peer package (`@envoymesh/envoy-harness-peer`) provides the
     * implementation (`createPeerTeamExecutor`); Package 1 only declares
     * the seam. Absent → a peer-hosted agent fails with a clear error.
     */
    peerExecutor?: (spec: AgentSpec, prompt: string) => Promise<string>;
}
/** The runner. */
export declare class Team {
    private readonly config;
    private readonly model;
    private readonly cwd;
    private readonly optionsFor;
    private readonly input;
    private readonly peerExecutor;
    constructor(options: TeamOptions);
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
    runOnce(): Promise<TeamResult>;
    private runAgent;
    private buildUpstreamContext;
}
//# sourceMappingURL=runner.d.ts.map