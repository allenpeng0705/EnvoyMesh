/**
 * Mesh-remote terminal transport seam (Package 1 stub).
 */
export interface RemoteTerminalTransport {
    /** Read output from a terminal hosted on a peer. */
    readOutput(ref: string, signal: AbortSignal): Promise<string>;
}
export declare class RemoteTerminalError extends Error {
    readonly code: "NOT_CONFIGURED" | "NOT_FOUND" | "TRANSPORT";
    readonly name = "RemoteTerminalError";
    constructor(message: string, code: "NOT_CONFIGURED" | "NOT_FOUND" | "TRANSPORT");
}
export declare const NOOP_REMOTE_TERMINAL_TRANSPORT: RemoteTerminalTransport;
//# sourceMappingURL=remote.d.ts.map