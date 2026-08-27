/**
 * F10.4.1: `FanOutSpec` + `FanOutRegistry` — capability-driven fan-out.
 *
 * **What this is:** the host-driven fan-out pattern (the user's
 * explicit F10.2 ask #4). The host registers a `FanOutSpec` for
 * a `capabilityTag` ("for tag X, always fan out to 3 workers
 * with input partition `P(i, N)`"). When the model emits ONE
 * `task` call with that tag, the tool expands it to N
 * sub-agents running in parallel.
 *
 * **Why this exists, when F10.2 already does fan-out:** F10.2
 * lets the **model** fan out (it emits N `task` calls; the
 * agent runs them in parallel). F10.4 lets the **host** fan
 * out: the model emits ONE call, the host's spec turns it
 * into N. The model doesn't need to know.
 *
 * **Use case:** "for tag X, always fan out to 3 workers with
 * input partition `P(i, N)`". The host wants parallel work
 * to happen for a specific tag, even if the model doesn't
 * emit multiple calls. Examples: a research task that should
 * always hit 3 different sources, a code-review task that
 * should always run 3 reviewers in parallel, etc.
 *
 * **The seam (per `docs/boundary.{en,zh}.md`):** fan-out is
 * a host concern (the host knows its workflow). envoy-harness
 * provides the registry + the tool integration; the mesh
 * (EnvoyMesh) is not involved at this layer. The N
 * sub-agents can be local or remote (per the F10.3.2
 * `RemoteMeshSubmitter`); the fan-out doesn't care.
 *
 * **v0 (F10.4.1) limits (deferred to F10.5+):**
 * - Cost aggregation into the parent's `CostTracker`
 *   (F10.5). v0: the aggregated result's `costUsd` is the
 *   sum; the parent's own tracker doesn't see it.
 * - Progress streaming (F10.5). v0: fire-and-await.
 * - Multi-tier fan-out (a `FanOutSpec` that fans out to
 *   another `FanOutSpec`). v0: one level.
 * - Dynamic fan-out count. v0: static `count` per tag.
 *
 * **Stability:** the public surface is `FanOutSpec` (interface)
 * + `FanOutRegistry` (class) + `aggregateFanOutResults` (helper).
 * Additive; new fields on `FanOutSpec` are additive.
 */
import type { SubagentInput, SubagentResult } from "./types.js";
/**
 * F10.4.1: a host-registered fan-out pattern. The host
 * says: "for `capabilityTag` X, spawn `count` sub-agents
 * with input partition `partition(i, count)`."
 *
 * **Count semantics:** `count` is the number of sub-agents
 * to spawn. v0: must be `>= 1`. The `maxSubagents` cap
 * (F10.2) still applies — if `count > maxSubagents`, the
 * agent refuses ALL (per F10.2's design: refuse-all
 * teaches the model to budget).
 *
 * **Partition:** default is identity (each sub-agent gets
 * the same `SubagentInput`). The host provides a custom
 * function to inject `i` (the sub-agent's index, 0-based)
 * and `count` into the input. The function MUST return a
 * `SubagentInput`; it can derive new fields from the
 * original (e.g. set `routingHint` differently per i).
 *
 * **What `partition` does NOT do:** the partition function
 * cannot change `capabilityTag` (the registry lookup
 * already happened). It can change `objective` (most
 * common — split a research task into 3 sub-questions),
 * `costCeilingUsd` (per-sub-agent budget), `routingHint`
 * (per-sub-agent peer preference), etc.
 */
export interface FanOutSpec {
    /**
     * The capability tag this spec matches. When the
     * `task` tool sees an input with this tag, it
     * expands to N sub-agents. v0: one spec per tag
     * (last `register` call wins; the previous is
     * replaced).
     */
    capabilityTag: string;
    /**
     * Number of sub-agents to spawn. Must be `>= 1`.
     * The `maxSubagents` cap still applies.
     */
    count: number;
    /**
     * Optional partition function. Called once per
     * sub-agent with `(input, i, count)`. The returned
     * `SubagentInput` is what gets passed to the
     * `MeshSubmitter` for that sub-agent.
     *
     * Default (no partition): identity — every sub-agent
     * gets the same input. The host provides a custom
     * function to inject `i` into the input (e.g. set
     * `objective` to a sub-question, set `routingHint`
     * to bias a different peer per i).
     */
    partition?: (input: SubagentInput, i: number, count: number) => SubagentInput;
}
/**
 * F10.4.1: the registry of `FanOutSpec`s. Host-owned;
 * the host constructs one and passes it to the agent
 * via `AgentOptions.fanOutRegistry`. The `task` tool
 * looks up the spec by `capabilityTag` on each call.
 *
 * **Why a class, not a plain object:** the registry has
 * imperative operations (`register`, `clear`) and the
 * host may want to mutate it at runtime (e.g. update
 * a spec when a new node joins the mesh). A class is
 * the natural shape.
 *
 * **v0 lookup:** O(1) via Map. v0: one spec per tag
 * (last write wins).
 */
export declare class FanOutRegistry {
    private readonly specs;
    /**
     * Register a `FanOutSpec`. Replaces any existing
     * spec for the same `capabilityTag` (last write wins).
     */
    register(spec: FanOutSpec): void;
    /**
     * Look up the spec for a `capabilityTag`. Returns
     * `undefined` if no spec matches. O(1).
     */
    lookup(capabilityTag: string): FanOutSpec | undefined;
    /**
     * Remove all specs. Useful for tests + host-side
     * teardown.
     */
    clear(): void;
    /**
     * Number of registered specs. For tests / introspection.
     */
    get size(): number;
}
/**
 * F10.4.1: aggregate N `SubagentResult`s into one for
 * the model.
 *
 * **Why aggregate (not return N):** the model emitted
 * ONE `task` call; the host's `FanOutSpec` expanded
 * it to N sub-agents. The model expects ONE result.
 * Returning N would confuse the model ("wait, I only
 * asked for one task"). The aggregated result is the
 * model's view of "I asked for a research task, here's
 * what came back."
 *
 * **Aggregation rules:**
 * - `status`: worst-case ("completed" < "partial" <
 *   "failed"; "failed" wins).
 * - `content`: text blocks from all N results,
 *   concatenated in completion order, each prefixed
 *   with `"[sub-agent {i+1}/{count}] "` for clarity.
 * - `costUsd`: sum of all N.
 * - `durationMs`: max of all N (the wall-clock time
 *   the parent waited — the slowest sub-agent).
 * - `verdict`: worst-case (pass < partial < fail;
 *   "fail" wins).
 * - `signature`: empty string. The aggregated result
 *   is not a single signed result; the host can
 *   verify each individual signature separately if
 *   it cares. v0 simplification.
 * - `workerPeerId`: the workerPeerId of the first
 *   result (or the parent node's if all are local
 *   with no workerPeerId stamp).
 * - `workerRuntime`: the first result's runtime
 *   (v0: all share the same runtime).
 *
 * **Empty input:** `aggregateFanOutResults([])` throws
 * — the caller should ensure N >= 1 before calling.
 * v0: the task tool's fan-out expansion never passes
 * an empty array (the `count` is required to be >= 1).
 *
 * **Why worst-case (not best-case):** the model wants
 * to know the worst outcome. If one sub-agent failed,
 * the aggregated status is "failed" — even if two
 * others succeeded. The model's next iteration can
 * then decide to retry, ask for clarification, or
 * surface the failure to the user. Best-case would
 * hide the failure.
 */
export declare function aggregateFanOutResults(results: ReadonlyArray<SubagentResult>, workerPeerId?: string, workerRuntime?: SubagentResult["workerRuntime"]): SubagentResult;
//# sourceMappingURL=fan-out.d.ts.map