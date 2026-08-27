/**
 * Phase C / Item 7 — child-process job producer.
 */
import type { JobHooks } from "./types.js";
export interface ProcessJobOptions {
    command: string;
    cwd: string;
    env?: NodeJS.ProcessEnv;
    /** Soft cap on retained output bytes (default 256 KiB). */
    outputLimitBytes?: number;
    /** Grace period before SIGKILL after cancel (default 2s). */
    killGraceMs?: number;
    /** Live combined stdout/stderr chunks (UTF-8). */
    onOutput?: (chunk: string) => void;
}
/** Build {@link JobHooks} for a shell command. Call from `JobStart.run()`. */
export declare function createProcessJobHooks(options: ProcessJobOptions): JobHooks;
//# sourceMappingURL=process-provider.d.ts.map