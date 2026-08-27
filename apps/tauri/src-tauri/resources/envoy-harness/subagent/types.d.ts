/**
 * Sub-agent types (§10.3 of the design — F10.1 Phase 5).
 *
 * **What is this module?** the public type surface for
 * the mesh-native sub-agent integration. The parent
 * agent calls the `task` tool; the tool submits to a
 * `MeshSubmitter`; the submitter runs (or routes) the
 * sub-agent and returns the result.
 *
 * **Why a separate "sub-agent" abstraction, not just
 * "call Agent.run()":** the design invariant #9 says
 * "sub-agents map to mesh chain steps, not in-process
 * tasks". A sub-agent is a fresh session, even locally.
 * The `MeshSubmitter` seam makes that explicit: the
 * parent doesn't directly call `new Agent()`; the
 * submitter decides the sub-agent's session, model,
 * tools, permission, and (in the future) whether the
 * sub-agent runs locally or on a peer.
 *
 * **Why envoy-harness owns these types:** the `task`
 * tool is a first-class harness tool. The seam
 * (`MeshSubmitter`) is the *interface*; the
 * implementation (`LocalMeshSubmitter`) is the
 * *default*. Both live in Package 1. The future
 * `RemoteMeshSubmitter` (cross-node) can live in
 * the adapter (Package 3) — the seam doesn't change.
 *
 * **What this is NOT:**
 * - Not a fork pattern. The sub-agent is a NEW
 *   `Agent` instance with a NEW `InMemorySession`.
 *   It does not share the parent's session, hooks,
 *   or permission.
 * - Not a thread. JS is single-threaded; the
 *   "sub-agent runs in parallel" semantic is the
 *   host's concern (the host can `Promise.all` over
 *   multiple `submitter.submit()` calls if it wants
 *   concurrency).
 * - Not the F9.3 Team pattern. F9.3 Team is a
 *   pre-defined graph of agents in TOML, all
 *   sharing the parent's tool registry. F10.1
 *   sub-agents are dynamic, single-shot, with
 *   their own session.
 *
 * **Stability:** additive. New fields on
 * `SubagentInput` or `SubagentResult` are
 * additive; removing a field is a major version.
 */
import type { AgentRuntime } from "../types.js";
import type { ContentBlock } from "../tools/types.js";
import type { Verdict } from "../types.js";
/**
 * F10.3.3: federated routing hint. The mesh uses
 * this to pick the right peer for the sub-agent.
 *
 * **The seam:** envoy-harness exposes the hint as
 * structured data. The actual routing decision
 * (which peer to send to, capability matching, load
 * balancing) lives in EnvoyMesh — NOT in
 * envoy-harness. Per the boundary doc
 * (`docs/boundary.{en,zh}.md`): "Routing is a mesh
 * concern; envoy-harness exposes the hint, EnvoyMesh
 * decides the target."
 *
 * **Why structured, not opaque `Record<string, unknown>`:**
 * TypeScript users get IDE autocomplete + type
 * checking. The host can still pass extra fields
 * via the `SubagentInput.routingHint as
 * Partial<RoutingHint>` escape hatch if the mesh
 * adds new fields before envoy-harness picks them
 * up. The mesh can also pass through unknown
 * fields unchanged.
 *
 * **v0 (this commit):** the type is defined; the
 * fields are advisory. `LocalMeshSubmitter` ignores
 * them (no peer selection). `RemoteMeshSubmitter`
 * passes them through to the transport; the
 * transport (host-injected, mesh-side) interprets
 * them. Future: a `FanOutSpec` (F10.4+) can
 * pre-populate `routingHint` from the parent's
 * perspective.
 *
 * **What envoy-harness does NOT do:** peer scoring,
 * load balancing, capability matching, fallback
 * selection. All of that is a mesh concern; the
 * mesh-side transport (or the orchestrator above
 * the transport) makes the call.
 */
export interface RoutingHint {
    /**
     * The worker's capability tag (what the worker
     * advertises it can do). The mesh matches this
     * against the worker's manifest to pick a
     * suitable peer. Distinct from
     * `SubagentInput.capabilityTag` (which is the
     * sub-agent's *task* tag; this is the worker's
     * *advertised* tag).
     */
    workerCapabilityTag: string;
    /**
     * Max hops the sub-agent can be routed through.
     * v0: 1 (parent → worker; no transit). Multi-hop
     * (parent → relay → worker) is a future mesh
     * feature. The mesh can also use this as a
     * routing preference (prefer shorter paths).
     */
    maxHops?: number;
    /**
     * Preferred geographic regions. The mesh
     * biases peer selection toward these regions
     * (latency optimization, data-residency
     * requirements). Empty/undefined = any region.
     * Region names are mesh-defined (typically
     * `us-west`, `eu-central`, `ap-southeast`).
     */
    preferredRegions?: ReadonlyArray<string>;
}
/**
 * The parent's view of "what to ask the sub-agent
 * to do". The `MeshSubmitter` decides how to run it
 * (locally, on a peer, etc.).
 */
export interface SubagentInput {
    /** The sub-agent's task. Free-form. */
    objective: string;
    /**
     * A free-form tag the orchestrator (or local
     * router) uses to pick the right runtime + tools.
     * v0: not interpreted by `LocalMeshSubmitter`;
     * the host can override the factory to use it.
     */
    capabilityTag: string;
    /** Cost ceiling in USD. The sub-agent's run is
     *  bounded by this. */
    costCeilingUsd: number;
    /** Wall-clock deadline in ms from now. */
    deadlineMs: number;
    /** Optional: prefer a specific peer (mesh routing
     *  hint). v0's `LocalMeshSubmitter` ignores this. */
    preferredPeerId?: string;
    /** Optional: prefer a specific runtime. v0's
     *  `LocalMeshSubmitter` ignores this. */
    preferredRuntime?: AgentRuntime;
    /**
     * F10.3.3: federated routing hint. Mesh uses
     * this to pick the right peer. envoy-harness
     * doesn't interpret it (per the boundary doc);
     * it just passes it through to the
     * `MeshSubmitter` (and onward to the mesh-side
     * transport, if any). The model does NOT see
     * this field (it's not in the `task` tool's
     * zod schema); only the host (or a future
     * `FanOutSpec`) can set it.
     */
    routingHint?: RoutingHint;
}
/**
 * The result of a sub-agent's run. The parent sees
 * this as the `task` tool's return value.
 */
export interface SubagentResult {
    /** Overall status. "completed" if the sub-agent
     *  finished cleanly; "failed" if it aborted;
     *  "partial" if it ran but the verdict was
     *  partial/disputed. */
    status: "completed" | "failed" | "partial";
    /** The sub-agent's final content blocks. */
    content: ReadonlyArray<ContentBlock>;
    /** The worker's peerId. Stamped into the result. */
    workerPeerId: string;
    /** The worker's runtime. v0: always "envoy-harness". */
    workerRuntime: AgentRuntime;
    /** The sub-agent's cost in USD. */
    costUsd: number;
    /** The sub-agent's wall-clock duration in ms. */
    durationMs: number;
    /**
     * The sub-agent's verdict. v0: a simple synthesis
     * from the agent's `stopReason` + content shape.
     * Future: the mesh orchestrator's verdict.
     */
    verdict: Verdict;
    /**
     * v0: empty string. Local execution doesn't need
     * cryptographic trust (parent + sub-agent are in
     * the same process). Future cross-node: Ed25519
     * over the canonical result, signed with the
     * worker's owner key.
     */
    signature: string;
}
/**
 * F17.6: a record of one sub-agent spawn. The local
 * `LocalMeshSubmitter` keeps these so the REPL's
 * `/agents` command can list spawned sub-agents.
 *
 * **Why a separate type, not just `SubagentResult`:**
 * the result is the parent's view (final content +
 * verdict). The record is the local lifecycle view
 * (started, in-flight, completed). A record exists
 * from the moment `submit()` is called until the
 * sub-agent finishes; a `SubagentResult` only exists
 * after the sub-agent returns.
 *
 * **Why a snapshot, not a stream:** the REPL is
 * synchronous from the user's perspective. The user
 * types `/agents` and sees a list. They don't want
 * a live feed. The snapshot is the answer.
 *
 * **Stability:** additive. New fields are backward-
 * compatible. Removing a field is a major version.
 */
export interface SubagentRecord {
    /** The sub-agent's session id. Stable across the
     *  sub-agent's lifetime. */
    sessionId: string;
    /** The sub-agent's capability tag (from
     *  `SubagentInput.capabilityTag`). */
    capabilityTag: string;
    /** The sub-agent's objective (from
     *  `SubagentInput.objective`). Truncated in the
     *  REPL's display; the full text is here. */
    objective: string;
    /** When `submit()` was called (ISO timestamp). */
    startedAt: string;
    /** When the sub-agent finished (ISO timestamp).
     *  Undefined while the sub-agent is still running. */
    completedAt?: string;
    /** Wall-clock duration in ms. Undefined while
     *  running. */
    durationMs?: number;
    /** Lifecycle status. `running` → not yet finished.
     *  The other values mirror `SubagentResult.status`. */
    status: "running" | "completed" | "failed" | "partial";
    /** Cost in USD. Undefined while running; populated
     *  from `SubagentResult.costUsd` on completion. */
    costUsd?: number;
}
/**
 * The seam between the `task` tool and the actual
 * sub-agent execution. The default implementation
 * (`LocalMeshSubmitter`) runs the sub-agent in a
 * NEW local session. Future implementations may
 * route to a peer (via the EnvoyMesh orchestrator)
 * or to a different runtime (e.g. openclaw).
 *
 * **Why an interface, not a class:** the host
 * decides. The `LocalMeshSubmitter` is the default
 * for testing + local dev. Production hosts may
 * inject a custom submitter (e.g. one that also
 * broadcasts the subtask to bonded peers for
 * off-node execution).
 *
 * **Why `submit` is async:** the sub-agent is
 * async. A cross-node submitter may also be
 * async (network round-trip). A local submitter
 * is also async (the agent's `run()` is async).
 *
 * **The signal:** the parent's abort signal.
 * Submit-terrain honor it (the agent's loop checks
 * the signal at every iteration boundary). The
 * submitter's `submit()` should also pass the
 * signal through to the sub-agent's `run()`.
 */
export interface MeshSubmitter {
    submit(input: SubagentInput, signal: AbortSignal): Promise<SubagentResult>;
    /**
     * F17.6: optional. Returns a snapshot of the
     * sub-agents this submitter has spawned (or is
     * currently spawning). v0: optional — the
     * `LocalMeshSubmitter` implements it; the
     * `NoopMeshSubmitter` doesn't; cross-node
     * submitters (F10.3.2 `RemoteMeshSubmitter` in
     * Package 3) may or may not.
     *
     * **Why optional:** the registry is a UX concern
     * (the REPL's `/agents` command). It doesn't
     * change the submitter's core contract. Hosts
     * that don't care about listing can omit it.
     *
     * **Read-only view:** the returned array is a
     * snapshot; the caller MUST NOT mutate it. The
     * submitter may reuse the same array on each
     * call (return the same reference with mutated
     * contents) — but the contract is "snapshot at
     * the time of the call". The REPL's `/agents`
     * command treats the result as a frozen point-
     * in-time view.
     */
    listSubagents?(): ReadonlyArray<SubagentRecord>;
}
//# sourceMappingURL=types.d.ts.map