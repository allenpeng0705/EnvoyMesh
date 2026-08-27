/**
 * F2b — Windows sandbox sidecar executor (`envoy-sandbox-win`).
 *
 * Spawns a long-lived sidecar process and sends newline JSON requests.
 * Falls back to {@link WindowsJobSandboxExecutor} when the sidecar binary
 * is missing (or `onUnusable: "noop"` on non-Windows for tests).
 */
import type { SandboxContext, SandboxExecutor, SandboxResult } from "../types.js";
export interface WindowsSidecarSandboxExecutorOptions {
    /** Sidecar command (default: resolve `envoy-sandbox-win`). */
    command?: string;
    /** Sidecar argv prefix (default: `[sidecarBin]`). */
    args?: string[];
    onUnusable?: "noop" | "error";
}
export declare function resolveWindowsSidecarBin(): string | undefined;
export declare function isWindowsSidecarAvailable(): boolean;
export declare class WindowsSidecarSandboxExecutor implements SandboxExecutor {
    #private;
    constructor(options?: WindowsSidecarSandboxExecutorOptions);
    execute(command: string, context: SandboxContext): Promise<SandboxResult>;
}
//# sourceMappingURL=windows-sidecar.d.ts.map