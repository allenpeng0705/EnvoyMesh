/**
 * Mesh-remote job transport seam (Package 1 stub).
 *
 * Hosts (EnvoyMesh adapter) inject a live transport that fetches
 * job snapshots from a peer node. Package 1 only defines the contract.
 */
import type { JobSnapshot } from "./types.js";
export interface RemoteJobTransport {
    /** Fetch a job snapshot from `peer://<peerId>/jobs/<jobId>`. */
    fetchJob(ref: string, signal: AbortSignal): Promise<JobSnapshot>;
}
export declare class RemoteJobError extends Error {
    readonly code: "NOT_CONFIGURED" | "NOT_FOUND" | "TRANSPORT";
    readonly name = "RemoteJobError";
    constructor(message: string, code: "NOT_CONFIGURED" | "NOT_FOUND" | "TRANSPORT");
}
/** No-op transport — fails until the mesh adapter wires a real one. */
export declare const NOOP_REMOTE_JOB_TRANSPORT: RemoteJobTransport;
//# sourceMappingURL=remote.d.ts.map