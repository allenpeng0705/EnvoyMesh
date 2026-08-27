/**
 * Phase C / Item 7 — in-memory {@link JobRegistry}.
 */
import type { JobRegistry } from "./types.js";
export interface LocalJobRegistryOptions {
    maxConcurrentJobsPerOwner?: number;
}
/** Create a process-local job registry. */
export declare function createLocalJobRegistry(options?: LocalJobRegistryOptions): JobRegistry;
//# sourceMappingURL=registry.d.ts.map