/**
 * `makeTaskTool` — the `task` tool the parent agent
 * uses to spawn a sub-agent.
 *
 * **Design doc:** §10.3 ("The task tool —
 * mesh-native sub-agent"). The `task` tool is the
 * parent's escape hatch: when the model decides
 * "this needs a different perspective" or "I need a
 * specialist", it calls the tool; the tool submits
 * to the `MeshSubmitter`; the submitter runs (or
 * routes) the sub-agent and returns the result.
 *
 * **Why a factory, not a singleton:** the tool
 * closes over the `MeshSubmitter` (the host injects
 * the implementation). Different hosts can wire
 * different submitters (`LocalMeshSubmitter`,
 * `NoopMeshSubmitter`, or a future
 * `RemoteMeshSubmitter`).
 *
 * **Why a tool, not an `Agent.run` option:** tools
 * are how the model expresses "I need help". The
 * model decides WHEN to spawn a sub-agent based
 * on the task. Making it a tool means the model
 * sees the tool in its tool list and decides
 * dynamically.
 *
 * **What the tool returns:** the `SubagentResult`
 * (the parent's view of what the sub-agent did).
 * The model sees the result and decides what to
 * do next (e.g. continue, retry, or report back
 * to the user).
 *
 * **F10.4.1 — capability-driven fan-out:** when
 * a `FanOutRegistry` is provided, the tool consults
 * it on every call. If a spec matches the input's
 * `capability_tag`, the tool expands ONE model
 * call into N parallel sub-agents (via
 * `Promise.all`), then aggregates the N results
 * into ONE for the model. The model sees ONE
 * call → ONE result; the host controls the
 * fan-out without teaching the model about it.
 *
 * **Stability:** additive. New fields on the
 * `TaskInput` / `TaskResult` (the tool's input /
 * output) are additive.
 */
import { z } from "zod";
import { aggregateFanOutResults } from "./fan-out.js";
/** The tool's input schema (zod). */
export const TaskInputSchema = z.object({
    objective: z
        .string()
        .min(1)
        .describe("What the sub-agent should do. Free-form."),
    capability_tag: z
        .string()
        .min(1)
        .describe("A free-form tag the orchestrator (or local router) uses to " +
        "pick the right runtime + tools. Examples: 'code-search', " +
        "'summarize', 'code-edit', 'doc-search'."),
    cost_ceiling_usd: z
        .number()
        .positive()
        .describe("Cost ceiling in USD. The sub-agent's run is bounded by this."),
    deadline_ms: z
        .number()
        .int()
        .positive()
        .describe("Wall-clock deadline in ms from now."),
    preferred_peer_id: z
        .string()
        .optional()
        .describe("Optional: prefer a specific peer (mesh routing hint). " +
        "LocalMeshSubmitter ignores it; a peer-backed submitter " +
        "(standalone peer cluster) routes by it. Read the `peers` tool " +
        "to discover peer ids/models."),
    preferred_runtime: z
        .string()
        .optional()
        .describe("Optional: prefer a specific runtime. v0's LocalMeshSubmitter " +
        "ignores this."),
});
/**
 * Build the `task` tool. The host provides the
 * `MeshSubmitter`; the tool calls it on every
 * invocation. The factory exists so multiple
 * agents can use different submitters (e.g. one
 * parent uses `LocalMeshSubmitter`, another uses
 * a future `RemoteMeshSubmitter`).
 *
 * **F10.4.1 — fan-out:** when `fanOutRegistry` is
 * provided, the tool consults the registry. If a
 * spec matches the input's `capability_tag`, the
 * tool:
 * 1. Builds N `SubagentInput`s via the spec's
 *    `partition` function (or identity if not set).
 * 2. Calls `submitter.submit` N times in parallel
 *    via `Promise.all` (F10.2 fan-out path).
 * 3. Aggregates the N results into ONE
 *    `SubagentResult` for the model.
 * 4. Honors the parent's `abortSignal` (any
 *    sub-agent abort propagates to all in-flight).
 */
export function makeTaskTool(submitterOrOptions) {
    // Backward compat: F10.1.3 callers pass a
    // MeshSubmitter directly. F10.4.1+ callers pass
    // an options object. Both shapes are accepted.
    const submitter = "submit" in submitterOrOptions
        ? submitterOrOptions
        : submitterOrOptions.submitter;
    const fanOutRegistry = "submit" in submitterOrOptions
        ? undefined
        : submitterOrOptions.fanOutRegistry;
    const onSubagentComplete = "submit" in submitterOrOptions
        ? undefined
        : submitterOrOptions.onSubagentComplete;
    const maxSubagents = "submit" in submitterOrOptions
        ? undefined
        : submitterOrOptions.maxSubagents;
    return {
        name: "task",
        description: "Spawn a sub-agent. The sub-agent runs in a NEW local session " +
            "(own permission state, own transcript) and may run on this " +
            "node or a peer in the mesh. Returns the sub-agent's final " +
            "text + verdict + cost. Use this when a sub-problem deserves " +
            "a fresh session with its own permission state — e.g. a " +
            "research sub-agent that should run read-only while you " +
            "continue to edit files.",
        parameters: TaskInputSchema,
        async execute(args, ctx) {
            const baseInput = {
                objective: args.objective,
                capabilityTag: args.capability_tag,
                costCeilingUsd: args.cost_ceiling_usd,
                deadlineMs: args.deadline_ms,
                ...(args.preferred_peer_id !== undefined
                    ? { preferredPeerId: args.preferred_peer_id }
                    : {}),
                ...(args.preferred_runtime !== undefined
                    ? { preferredRuntime: args.preferred_runtime }
                    : {}),
            };
            // F10.4.1: fan-out expansion. Check the
            // registry first; if a spec matches, expand
            // to N parallel sub-agents.
            const spec = fanOutRegistry?.lookup(baseInput.capabilityTag);
            let result;
            if (spec) {
                if (spec.count < 1) {
                    // Defensive: invalid spec. Refuse all.
                    result = {
                        status: "failed",
                        content: [
                            {
                                type: "text",
                                text: `FanOutSpec for "${spec.capabilityTag}" has invalid count ${spec.count}; must be >= 1.`,
                            },
                        ],
                        workerPeerId: "",
                        workerRuntime: "envoy-harness",
                        costUsd: 0,
                        durationMs: 0,
                        verdict: {
                            kind: "fail",
                            reason: "invalid FanOutSpec count",
                            rollback: false,
                        },
                        signature: "",
                    };
                }
                else if (maxSubagents !== undefined && spec.count > maxSubagents) {
                    // F10.2 cap applies to the expanded count too.
                    result = {
                        status: "failed",
                        content: [
                            {
                                type: "text",
                                text: `maxSubagents reached: FanOutSpec for "${spec.capabilityTag}" expands to ${spec.count} sub-agents (cap is ${maxSubagents}). Refused.`,
                            },
                        ],
                        workerPeerId: "",
                        workerRuntime: "envoy-harness",
                        costUsd: 0,
                        durationMs: 0,
                        verdict: {
                            kind: "fail",
                            reason: "maxSubagents exceeded by FanOutSpec",
                            rollback: false,
                        },
                        signature: "",
                    };
                }
                else {
                    const partition = spec.partition ?? ((input) => input);
                    const inputs = [];
                    for (let i = 0; i < spec.count; i++) {
                        inputs.push(partition(baseInput, i, spec.count));
                    }
                    // Parallel run (F10.2 path). Abort propagates
                    // via the shared `ctx.abortSignal`; each
                    // sub-agent's submitter honors it.
                    const results = await Promise.all(inputs.map((input) => submitter.submit(input, ctx.abortSignal)));
                    result = aggregateFanOutResults(results);
                }
            }
            else {
                // No fan-out: single sub-agent (F10.1 baseline).
                result = await submitter.submit(baseInput, ctx.abortSignal);
            }
            // F10.5: cost aggregation callback. Fires
            // AFTER the submitter (or fan-out aggregator)
            // returns, with the final result. For
            // fan-out, the parent sees the AGGREGATED
            // result (with summed costUsd), not the N
            // individual ones.
            if (onSubagentComplete) {
                onSubagentComplete(result);
            }
            return { content: result };
        },
    };
}
//# sourceMappingURL=tools.js.map