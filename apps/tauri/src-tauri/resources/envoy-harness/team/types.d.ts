/**
 * Team types (§22 of the design — F9.3 Phase 4 feature).
 *
 * **What is this module?** the public type surface for
 * the team + cron integration. A `TeamConfig` describes
 * a graph of agents (a "team") and an optional schedule;
 * a `Team` runner executes the team once per call.
 *
 * **Why a graph of agents, not a single one:** some
 * tasks benefit from a hand-off (explore → review →
 * summarize). The simplest v0 model is a DAG: each
 * agent has a list of `dependsOn` IDs; the runner
 * executes in topological order.
 *
 * **Why the schedule is just a cron string:** we
 * don't ship a cron parser. The host (system cron,
 * k8s CronJob, a Node `setInterval`) reads the
 * string and decides when to invoke `runOnce()`.
 * v0 only validates that the string is a 5-field
 * cron expression (very loose).
 *
 * **What this is NOT:**
 * - Not a workflow engine. v0 has no if/else, no
 *   parallel branches, no retries. A future chunk
 *   can add a state-machine DSL.
 * - Not a stateful orchestrator. Each `runOnce()`
 *   is stateless; the host persists results if
 *   needed.
 *
 * **Stability:** additive. New fields on
 * `AgentSpec` are additive. Removing a field is a
 * major version.
 */
/** One agent in the team. */
export interface AgentSpec {
    /** Unique id within the team. */
    id: string;
    /** Free-form role label (e.g. "explore", "review"). */
    role: string;
    /** The system prompt for this agent. */
    /** System prompt; omitted → the runner defaults to the assembled
     *  AGENTS.md + guidance prompt (Phase G). */
    systemPrompt?: string;
    /** The objective (the user task; can include
     *  `${input}` placeholders that get substituted
     *  with the team-level input). */
    objective: string;
    /** IDs of agents whose final text this agent
     *  should receive as a "context" message. */
    dependsOn: ReadonlyArray<string>;
    /**
     * D4 — where this agent runs. `"local"` (default) runs in-process;
     * `"peer://<peerId>"` dispatches to a standalone envoy-harness peer
     * (same or different machine, possibly a different model) via the
     * host-supplied `TeamOptions.peerExecutor` (the peer package provides
     * the implementation — Package 1 stays free of it).
     */
    host?: string;
}
/** The schedule (when the team should run). v0
 *  only stores the cron string; the host parses it. */
export interface ScheduleSpec {
    /** A 5-field cron expression (minute, hour,
     *  day-of-month, month, day-of-week). v0
     *  validates the shape (5 fields) but not the
     *  semantics. */
    cron: string;
}
/** The top-level team config. Parsed from a TOML
 *  file (see `parseTeamToml`). */
export interface TeamConfig {
    /** The team's name. */
    name: string;
    /** The agents in the team, in TOML order. */
    agents: ReadonlyArray<AgentSpec>;
    /** Optional schedule. */
    schedule?: ScheduleSpec;
}
/** The result of one agent's run within a team. */
export interface AgentRunResult {
    /** The agent's id. */
    id: string;
    /** The final text from the agent's last assistant
     *  message. */
    finalText: string;
    /** The agent's stop reason. */
    stopReason: string;
    /** How long the agent ran (wall-clock ms). */
    durationMs: number;
}
/** The result of a `Team.runOnce()` call. */
export interface TeamResult {
    /** The team's name. */
    teamName: string;
    /** Per-agent results, in execution order (topological
     *  sort of `dependsOn`). */
    agents: ReadonlyArray<AgentRunResult>;
    /** Overall status: "completed" if all agents finished
     *  with `end_turn`; "failed" if any agent failed. */
    status: "completed" | "failed";
    /** The error message if `status === "failed"`. */
    error?: string;
}
//# sourceMappingURL=types.d.ts.map