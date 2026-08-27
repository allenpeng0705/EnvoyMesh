/**
 * Mesh-remote terminal transport seam (Package 1 stub).
 */
export class RemoteTerminalError extends Error {
    code;
    name = "RemoteTerminalError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
export const NOOP_REMOTE_TERMINAL_TRANSPORT = {
    async readOutput(ref) {
        throw new RemoteTerminalError(`remote terminal ${ref} requires mesh adapter transport`, "NOT_CONFIGURED");
    },
};
//# sourceMappingURL=remote.js.map