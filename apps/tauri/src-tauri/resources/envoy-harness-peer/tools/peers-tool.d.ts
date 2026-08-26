/**
 * R3 follow-up — `peers`: a model-facing tool over the peer cluster.
 *
 * The standalone peer cluster is host-injected (a `MeshSubmitter`
 * wrapper), so the model has no built-in way to discover WHICH peers
 * exist and what models they run. This tool closes that gap: a host
 * that wires a peer cluster (e.g. EnvoyMesh's execution pool) registers
 * `createPeersTool(registry)` in the agent's tool set, and the model can
 * then read `{ id, model, capabilities }` and route a `task` call with
 * `preferred_peer_id`.
 *
 * Package 1 stays clean: the `Tool` type comes from
 * `@envoymesh/envoy-harness` (which the peer package already depends on),
 * and the registry is the peer package's own `PeerRegistry`.
 */
import type { Tool } from "@envoymesh/envoy-harness";
import type { PeerRegistry } from "../registry.js";
export interface PeersToolOptions {
    /** Default max entries in the text output. Default 20. */
    limit?: number;
}
/** Build the `peers` tool over a live peer cluster registry. */
export declare function createPeersTool(registry: PeerRegistry, options?: PeersToolOptions): Tool;
//# sourceMappingURL=peers-tool.d.ts.map