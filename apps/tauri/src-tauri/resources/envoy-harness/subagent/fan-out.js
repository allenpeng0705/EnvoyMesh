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
export class FanOutRegistry {
    specs = new Map();
    /**
     * Register a `FanOutSpec`. Replaces any existing
     * spec for the same `capabilityTag` (last write wins).
     */
    register(spec) {
        this.specs.set(spec.capabilityTag, spec);
    }
    /**
     * Look up the spec for a `capabilityTag`. Returns
     * `undefined` if no spec matches. O(1).
     */
    lookup(capabilityTag) {
        return this.specs.get(capabilityTag);
    }
    /**
     * Remove all specs. Useful for tests + host-side
     * teardown.
     */
    clear() {
        this.specs.clear();
    }
    /**
     * Number of registered specs. For tests / introspection.
     */
    get size() {
        return this.specs.size;
    }
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
export function aggregateFanOutResults(results, workerPeerId, workerRuntime) {
    if (results.length === 0) {
        throw new Error("aggregateFanOutResults: results is empty");
    }
    const count = results.length;
    // Status: worst-case.
    const statusRank = {
        completed: 0,
        partial: 1,
        failed: 2,
    };
    const statusLabels = [
        "completed",
        "partial",
        "failed",
    ];
    const worstStatusRank = results.reduce((acc, r) => Math.max(acc, statusRank[r.status]), 0);
    const status = statusLabels[worstStatusRank];
    if (!status) {
        throw new Error("aggregateFanOutResults: unreachable (worstStatusRank out of range)");
    }
    // Content: concatenate with sub-agent index prefix.
    const content = [];
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (!r)
            continue;
        const header = {
            type: "text",
            text: `[sub-agent ${i + 1}/${count}] `,
        };
        content.push(header);
        for (const block of r.content) {
            content.push(block);
        }
    }
    // Cost: sum.
    const costUsd = results.reduce((acc, r) => acc + r.costUsd, 0);
    // Duration: max (wall-clock time the parent waited).
    const durationMs = results.reduce((acc, r) => Math.max(acc, r.durationMs), 0);
    // Verdict: worst-case.
    const worstVerdict = results.reduce((acc, r) => {
        if (r.verdict.kind === "fail")
            return r.verdict;
        if (r.verdict.kind === "partial" && acc.kind !== "fail")
            return r.verdict;
        return acc;
    }, { kind: "pass", score: 0.5, confidence: "medium" });
    // Worker fields: first result's (or override from caller).
    const first = results[0];
    if (!first) {
        throw new Error("aggregateFanOutResults: unreachable (first is undefined after length check)");
    }
    return {
        status,
        content,
        workerPeerId: workerPeerId ?? first.workerPeerId,
        workerRuntime: workerRuntime ?? first.workerRuntime,
        costUsd,
        durationMs,
        verdict: worstVerdict,
        signature: "", // v0: aggregated result is not a single signed result
    };
}
//# sourceMappingURL=fan-out.js.map