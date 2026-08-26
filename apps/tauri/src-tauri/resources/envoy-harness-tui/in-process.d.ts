/**
 * In-process ACP pair for tests and `--demo` smoke.
 */
import { type ProtocolSessionBackend } from "@envoymesh/envoy-harness";
import { TuiSession, type PermissionRequest } from "./session.js";
export interface InProcessTuiOptions {
    cwd?: string;
    backend?: ProtocolSessionBackend;
    onPermission?: (req: PermissionRequest) => Promise<"allow" | "deny">;
}
export interface InProcessTui {
    session: TuiSession;
    close(): void;
}
/** Create a TuiSession talking to an in-process ACP server. */
export declare function createInProcessTui(options?: InProcessTuiOptions): InProcessTui;
//# sourceMappingURL=in-process.d.ts.map