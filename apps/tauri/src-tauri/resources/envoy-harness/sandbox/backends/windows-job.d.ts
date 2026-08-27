/**
 * Phase F2a — Windows sandbox scaffold (job-object lifecycle).
 *
 * **F2a scope:** run commands via `cmd.exe` on Windows; libuv assigns spawned
 * children to a kill-on-close job object. Full FS isolation (Codex
 * `windows-sandbox-rs`) is **F2b** — not implemented here.
 */
import type { SandboxContext, SandboxExecutor, SandboxResult } from "../types.js";
export interface WindowsJobSandboxExecutorOptions {
    /** When `"noop"`, fall back to plain `sh -c` off Windows (tests). */
    onUnusable?: "noop" | "error";
}
/** True when the F2a executor targets this host. */
export declare function isWindowsSandboxAvailable(): boolean;
export declare class WindowsJobSandboxExecutor implements SandboxExecutor {
    #private;
    constructor(options?: WindowsJobSandboxExecutorOptions);
    execute(command: string, context: SandboxContext): Promise<SandboxResult>;
}
//# sourceMappingURL=windows-job.d.ts.map