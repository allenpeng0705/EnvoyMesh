/**
 * Phase C / Item 13 — env-var credentials backend.
 */
import type { CredentialsProvider } from "./types.js";
export interface EnvCredentialsOptions {
    /** Extra known names to advertise via `list()` (default: empty). */
    knownNames?: readonly string[];
    env?: NodeJS.ProcessEnv;
}
export declare function createEnvCredentialsProvider(options?: EnvCredentialsOptions): CredentialsProvider;
//# sourceMappingURL=env.d.ts.map