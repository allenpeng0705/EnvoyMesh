/**
 * Spawn `envoy-harness --acp` and attach a TuiSession.
 */
import { type SpawnAcpOptions } from "@envoymesh/envoy-harness-client";
import { TuiSession, type PermissionRequest } from "./session.js";
export interface SpawnedTuiOptions {
    cwd?: string;
    command?: string;
    args?: string[];
    /** Extra argv appended to the harness's `--acp` invocation (e.g. provider/model). */
    harnessArgs?: string[];
    env?: NodeJS.ProcessEnv;
    /** Auto-run permission policy applied when the ACP session starts. */
    initialAutoRun?: "safe-only" | "always-confirm" | "off";
    onPermission?: (req: PermissionRequest) => Promise<"allow" | "deny">;
    stderr?: SpawnAcpOptions["stderr"];
}
export interface SpawnedTui {
    session: TuiSession;
    close(): void;
}
/** Resolve `envoy-harness --acp` for monorepo + installed layouts. */
export declare function resolveHarnessAcpCommand(extraArgs?: string[]): {
    command: string;
    args: string[];
};
/** Spawn harness `--acp` and return an attached TuiSession. */
export declare function createSpawnedTui(options?: SpawnedTuiOptions): SpawnedTui;
//# sourceMappingURL=spawn.d.ts.map