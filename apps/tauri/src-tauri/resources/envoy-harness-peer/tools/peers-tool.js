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
import { z } from "zod";
/** Build the `peers` tool over a live peer cluster registry. */
export function createPeersTool(registry, options = {}) {
    return {
        name: "peers",
        description: "List the configured envoy-harness peer cluster: each peer's id, " +
            "model, and capability tags. Use this to decide WHICH peer a " +
            "sub-agent should run on (different machines, possibly different " +
            "models), then pass that peer's id to the task tool's " +
            "`preferred_peer_id`. Returns an empty list when no peers are " +
            "configured.",
        parameters: z.object({
            limit: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Maximum number of peers to return (default 20)."),
        }),
        async execute(args) {
            const max = args.limit ?? options.limit ?? 20;
            const entries = registry.list().slice(0, max);
            if (entries.length === 0) {
                return { content: "Peers (0) — no peers configured" };
            }
            const lines = entries.map((e) => {
                const model = e.model !== undefined ? ` model=${e.model}` : "";
                const caps = e.capabilities !== undefined && e.capabilities.length > 0
                    ? ` capabilities=${[...e.capabilities].join(",")}`
                    : "";
                return `- ${e.id}${model}${caps}`;
            });
            return {
                content: `Peers (${entries.length})\n${lines.join("\n")}\n` +
                    "Route a sub-agent with task.preferred_peer_id=<peer id>.",
            };
        },
    };
}
//# sourceMappingURL=peers-tool.js.map