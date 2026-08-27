/**
 * Mesh-remote job transport seam (Package 1 stub).
 *
 * Hosts (EnvoyMesh adapter) inject a live transport that fetches
 * job snapshots from a peer node. Package 1 only defines the contract.
 */
export class RemoteJobError extends Error {
    code;
    name = "RemoteJobError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
/** No-op transport — fails until the mesh adapter wires a real one. */
export const NOOP_REMOTE_JOB_TRANSPORT = {
    async fetchJob(ref) {
        throw new RemoteJobError(`remote job ${ref} requires mesh adapter transport`, "NOT_CONFIGURED");
    },
};
//# sourceMappingURL=remote.js.map