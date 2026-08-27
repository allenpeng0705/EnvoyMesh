/**
 * D2 — `PeerMeshSubmitter`: the `MeshSubmitter` implementation that
 * submits sub-agent tasks to a standalone envoy-harness peer (same or
 * different machine, possibly a different model) over the peer dialect.
 *
 * Same contract as `LocalMeshSubmitter` / `RemoteMeshSubmitter` — the
 * agent loop's `task` tool doesn't know which one it is.
 */
import { subagentInputToExecuteInput, signedResultToSubagentResult, } from "./mapping.js";
export class PeerMeshSubmitter {
    #client;
    #workerPeerId;
    #spawned = [];
    constructor(options) {
        this.#client = options.client;
        this.#workerPeerId = options.workerPeerId ?? "peer";
    }
    async submit(input, signal) {
        const startedAt = new Date().toISOString();
        const wire = await this.#client.executeWithVerdict(subagentInputToExecuteInput(input, signal), signal);
        const result = signedResultToSubagentResult(wire.result, wire.verdict);
        const workerPeerId = result.workerPeerId || this.#workerPeerId;
        this.#spawned.push({
            sessionId: `${workerPeerId}-${this.#spawned.length}`,
            capabilityTag: input.capabilityTag,
            objective: input.objective,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: result.durationMs,
            status: result.status,
        });
        return result;
    }
    /** F17.6 — a snapshot of peers this submitter has spawned. */
    listSubagents() {
        return this.#spawned;
    }
}
//# sourceMappingURL=submitter.js.map