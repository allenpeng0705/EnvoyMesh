/**
 * Phase 8 Step 2 — `LocalCrossRuntimeSubmitter` in Package 3.
 *
 * **What this is:** the standard `MeshSubmitter` implementation
 * for sub-agents that run on a *local* but *different* runtime
 * (not envoy-harness). Today the only other runtime is
 * Built-in OpenClaw; future runtimes (Pi, HomeClaw, Hermes)
 * slot in via the same `LocalRuntimeBridge` seam.
 *
 * **Lives in Package 3** (the bridge) per the (B) plan's
 * open-question 2: "LocalCrossRuntimeSubmitter location —
 * envoy-harness-adapter (Option 1) OR EnvoyMesh apps/node/src/
 * (Option 2)? Lean toward Option 1 (bridge owns it) for the
 * same reason Q1 = C: keep envoy-harness clean of per-runtime
 * knowledge." This file does NOT import OpenClaw's protocol —
 * the bridge wraps a `LocalRuntimeBridge` interface that the
 * host (EnvoyMesh) implements with whatever ask path it has.
 *
 * **The seam:** `LocalRuntimeBridge` is a host-injected
 * `submitToOpenClaw(input, signal)` closure. envoy-harness-adapter
 * doesn't know what's inside; the host plugs in the OpenClaw
 * ask path. Same DI pattern as `RemoteMeshSubmitter`'s
 * `RemoteSubmitterTransport`.
 *
 * **Routing rule:** when `input.preferredRuntime` is
 * `"envoy-harness"` (or undefined), the submitter delegates to
 * the inner `LocalMeshSubmitter` (default — same-process
 * sub-agent in a fresh local session). When `preferredRuntime`
 * is `"openclaw"`, it routes through the bridge. Unknown
 * runtimes throw — strict "fail loud" for misconfiguration
 * (Q1 — design invariants favor explicit over implicit).
 *
 * **Result shape:** the bridge's `submitToOpenClaw` returns a
 * `SubagentResult`. We pass it through unchanged. The
 * `workerRuntime` is rewritten to `"openclaw"` so the parent
 * (and any downstream verifier) knows which runtime produced
 * the result. The signature is left as the bridge produced it
 * (empty for cross-runtime in v0; the cross-runtime delegation
 * is in-process so no cryptographic trust is needed — same
 * v0 semantics as `LocalMeshSubmitter`).
 *
 * **Stability:** the public surface is
 * `LocalCrossRuntimeSubmitter` (class) +
 * `LocalCrossRuntimeSubmitterOptions` (constructor opts) +
 * `LocalRuntimeBridge` (interface). Additive; new methods on
 * the bridge are backward-compatible; new constructor options
 * are optional.
 */
/**
 * Phase 8 Step 2 — a `MeshSubmitter` that routes sub-agents
 * to a different local runtime via an injected
 * `LocalRuntimeBridge`, or to the inner submitter for the
 * default same-runtime case.
 *
 * **Why "cross-runtime" and not "cross-node":** the transport
 * is *local* (no libp2p, no network). The seam
 * (`LocalRuntimeBridge`) is the host's ask path; the host
 * decides how to talk to the other runtime (HTTP, IPC, a
 * shared bus, etc.). This file does NOT know the transport.
 *
 * **Why a class, not a function:** the parent's
 * `AgentOptions.meshSubmitter` expects a `MeshSubmitter`
 * (interface with a `submit` method). A class is the natural
 * shape; future state (caching, retry, etc.) is additive
 * without breaking the interface.
 *
 * **Nested sub-agents (depth):** when the host injects this
 * submitter into a sub-agent's `Agent` (via
 * `defaultBuildAgentFactory({ meshSubmitter })`), the nested
 * agent ALSO gets a `task` tool routing through the same
 * submitter. Breadth is capped per turn (`maxSubagents`),
 * but depth is not — the model decides when to recurse, and
 * cost ceilings bound the spend. Hosts that want to bound
 * nesting should pass a leaf-only submitter for nested
 * sub-agents (e.g. a submitter that throws or a
 * depth-limited wrapper) rather than relying on the
 * harness to cap it.
 *
 * **The interface contract:** `submit(input, signal)` returns
 * a `SubagentResult`. The host sees one seam, regardless of
 * where the sub-agent ran (same runtime, different runtime,
 * different node — `RemoteMeshSubmitter` covers the third).
 */
export class LocalCrossRuntimeSubmitter {
    bridge;
    inner;
    workerPeerId;
    constructor(options) {
        this.bridge = options.bridge;
        this.inner = options.inner;
        this.workerPeerId = options.workerPeerId;
    }
    /**
     * Route the sub-agent based on `input.preferredRuntime`.
     *
     * **Routing table:**
     * - `undefined` or `"envoy-harness"` → inner (default).
     * - `"openclaw"` → bridge (`submitToOpenClaw`).
     * - other → throw `unsupported_preferred_runtime`.
     *
     * **Why strict on unknown runtimes:** the (B) plan's Q1
     * answer is "fail loud for misconfiguration". An unknown
     * `preferredRuntime` is almost certainly a bug in the
     * model (or a typo in the prompt); silently routing to
     * the inner submitter would mask it. The error message
     * names the bad value so the parent can render a useful
     * error.
     *
     * **Result rewriting:** when routed through the bridge,
     * we rewrite `result.workerRuntime` to the requested
     * runtime (the bridge may not have set it correctly).
     * `workerPeerId` is rewritten to this node's peerId
     * (cross-runtime sub-agents run on the same node as the
     * parent in v0; the bridge is local). Content,
     * costUsd, durationMs, verdict, and signature are passed
     * through unchanged.
     *
     * **Abort:** the parent's abort signal is forwarded
     * unchanged to the bridge or the inner submitter. The
     * bridge / inner submitter is responsible for honoring
     * it (the contract is documented on each).
     */
    async submit(input, signal) {
        const targetRuntime = input.preferredRuntime;
        if (targetRuntime === undefined || targetRuntime === "envoy-harness") {
            return this.inner.submit(input, signal);
        }
        if (targetRuntime === "openclaw") {
            const result = await this.bridge.submitToOpenClaw(input, signal);
            // Rewrite the runtime + peerId so downstream verifiers
            // see the right values. The bridge may have set these
            // to envoy-harness defaults; we know better here.
            // Derive from `targetRuntime` (not the literal) so a
            // future runtime added through the same bridge is
            // labeled correctly instead of hardcoding "openclaw".
            return {
                ...result,
                workerRuntime: targetRuntime,
                workerPeerId: this.workerPeerId,
            };
        }
        throw new Error(`LocalCrossRuntimeSubmitter: unsupported preferredRuntime ` +
            `"${targetRuntime}" — only "envoy-harness" (default) and ` +
            `"openclaw" are wired in Phase 8 Step 2.`);
    }
}
//# sourceMappingURL=local-cross-runtime-submitter.js.map