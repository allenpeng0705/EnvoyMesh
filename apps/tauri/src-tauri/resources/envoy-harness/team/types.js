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
export {};
//# sourceMappingURL=types.js.map