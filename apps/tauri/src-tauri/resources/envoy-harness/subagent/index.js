/**
 * Sub-agent public API (F10.1, §10.3 of the design).
 *
 * **What this module exports:** the type surface +
 * the default implementations (no-op + local) +
 * the default sub-agent factory + the `task` tool
 * + the F10.3.1 `SubagentResultSigner` seam.
 *
 * **Exports:**
 * - Types: `SubagentInput`, `SubagentResult`,
 *   `MeshSubmitter`, `SubagentResultSigner` (F10.3.1).
 * - `NoopMeshSubmitter` (default error) +
 *   `NOOP_MESH_SUBMITTER_ERROR` (the documented
 *   message).
 * - `LocalMeshSubmitter` (the "real workable"
 *   default) + `defaultBuildSubagentFactory` (the
 *   default factory for fresh local sessions).
 *
 * **Stability:** the public surface is the union of
 * the above. Additive; new fields on the input /
 * result types are additive; new submitter classes
 * are additive.
 */
export { NoopMeshSubmitter, NOOP_MESH_SUBMITTER_ERROR, } from "./noop-submitter.js";
export { LocalMeshSubmitter, defaultBuildSubagentFactory, } from "./local-mesh-submitter.js";
export { TaskInputSchema, makeTaskTool, } from "./tools.js";
export { FanOutRegistry, aggregateFanOutResults, } from "./fan-out.js";
//# sourceMappingURL=index.js.map