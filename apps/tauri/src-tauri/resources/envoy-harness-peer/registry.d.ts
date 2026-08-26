/**
 * D3 — `PeerRegistry`: discoverable peers + model routing.
 *
 * The standalone analog of the mesh's capability-manifest routing: peers
 * announce `{ id, model, capabilities }`; an orchestrator routes a
 * subtask to the peer whose model/capability matches.
 */
import type { SubagentInput } from "@envoymesh/envoy-harness";
import type { PeerClient } from "./client.js";
export interface PeerEntry {
    /** Stable peer id. */
    id: string;
    /** The typed client to talk to this peer. */
    client: PeerClient;
    /** The peer's model (e.g. `"deepseek-chat"`) for routing. */
    model?: string;
    /** Capability tags the peer can run. */
    capabilities?: ReadonlyArray<string>;
}
export declare class PeerRegistry {
    #private;
    register(entry: PeerEntry): () => void;
    get(id: string): PeerEntry | undefined;
    list(): ReadonlyArray<PeerEntry>;
    /**
     * Route a `MeshSubmitter` input to a peer. Preference order:
     * 1. `input.preferredPeerId` (explicit).
     * 2. A peer whose capabilities include the task tag or the routing
     *    hint's worker capability tag.
     * 3. Any peer (first registered).
     */
    route(input: SubagentInput): PeerEntry | undefined;
    /** Explicit model routing — the "different models collaborate" picker. */
    pickByModel(model: string): PeerEntry | undefined;
}
//# sourceMappingURL=registry.d.ts.map