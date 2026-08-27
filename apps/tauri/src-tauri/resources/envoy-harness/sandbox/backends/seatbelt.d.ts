/**
 * Phase F / C2 — SeatbeltSandboxExecutor (`sandbox-exec` on macOS).
 */
import type { SandboxContext, SandboxExecutor, SandboxResult } from "../types.js";
export interface SeatbeltSandboxExecutorOptions {
    binary?: string;
    onUnusable?: "noop" | "error";
}
export declare class SeatbeltSandboxExecutor implements SandboxExecutor {
    #private;
    constructor(options?: SeatbeltSandboxExecutorOptions);
    execute(command: string, context: SandboxContext): Promise<SandboxResult>;
}
//# sourceMappingURL=seatbelt.d.ts.map