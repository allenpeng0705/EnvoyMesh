/**
 * D2 — `PeerMeshSubmitter`: the `MeshSubmitter` implementation that
 * submits sub-agent tasks to a standalone envoy-harness peer (same or
 * different machine, possibly a different model) over the peer dialect.
 *
 * Same contract as `LocalMeshSubmitter` / `RemoteMeshSubmitter` — the
 * agent loop's `task` tool doesn't know which one it is.
 */
import type { MeshSubmitter, SubagentRecord, SubagentInput, SubagentResult } from "@envoymesh/envoy-harness";
import type { PeerClient } from "./client.js";
export interface PeerMeshSubmitterOptions {
    /** The typed peer client (connection + dialect). */
    client: PeerClient;
    /** Fallback worker peerId when the peer's result omits its own
     *  (the wire result's `peerId` is authoritative). Default `"peer"`. */
    workerPeerId?: string;
}
export declare class PeerMeshSubmitter implements MeshSubmitter {
    #private;
    constructor(options: PeerMeshSubmitterOptions);
    submit(input: SubagentInput, signal: AbortSignal): Promise<SubagentResult>;
    /** F17.6 — a snapshot of peers this submitter has spawned. */
    listSubagents(): ReadonlyArray<SubagentRecord>;
}
//# sourceMappingURL=submitter.d.ts.map