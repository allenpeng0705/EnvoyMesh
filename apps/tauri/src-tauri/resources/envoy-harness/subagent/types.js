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
export {};
//# sourceMappingURL=types.js.map