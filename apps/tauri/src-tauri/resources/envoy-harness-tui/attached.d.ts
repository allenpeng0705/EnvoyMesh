/**
 * Attach a TuiSession to an existing ACP stdio pair.
 */
import type { Readable, Writable } from "node:stream";
import { EnvoyHarnessClient, type EnvoyHarnessClientOptions } from "@envoymesh/envoy-harness-client";
import { TuiSession, type PermissionRequest } from "./session.js";
export interface AttachedTuiOptions {
    input: Readable;
    output: Writable;
    cwd?: string;
    onPermission?: (req: PermissionRequest) => Promise<"allow" | "deny">;
    onEvent?: EnvoyHarnessClientOptions["onEvent"];
}
export interface AttachedTui {
    session: TuiSession;
    client: EnvoyHarnessClient;
    close(): void;
}
/** Create a TuiSession over host-provided ACP streams (no server spawn). */
export declare function createAttachedTui(options: AttachedTuiOptions): AttachedTui;
//# sourceMappingURL=attached.d.ts.map