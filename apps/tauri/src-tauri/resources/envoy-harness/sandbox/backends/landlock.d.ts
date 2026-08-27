/**
 * Phase F / C1 — LandlockSandboxExecutor
 * (`@deepseek-ai/node-addon-landlock-run`).
 *
 * Fail-closed: unusable probe / missing package does not
 * run the command unconfined (unless `onUnusable: "noop"`).
 *
 * **Probe caching (post-review):** the deepseek API contract
 * says consumers run `probe()` once and cache the verdict.
 * Previously we called it on every `execute()` — a synchronous
 * child spawn per bash call. The probe verdict is now cached
 * per executor instance (invalidated if the cached verdict
 * was "unusable", so a hot-reload of the landlock package
 * still has a chance to recover).
 *
 * **Exit-125 attribution (post-review):** the launcher emits
 * `LAUNCHER_FAILURE_EXIT` when it cannot apply the requested
 * restrictions. The previous code did not distinguish that
 * from a wrapped command that legitimately exits 125. We
 * now inspect `result.exitCode === api.LAUNCHER_FAILURE_EXIT`
 * and surface a structured `sandboxLauncherFailure: true`
 * flag (plus an attribution note in stderr) so callers can
 * react.
 */
import type { SandboxContext, SandboxExecutor, SandboxResult } from "../types.js";
/** Injectable subset of the landlock-run entry package. */
export interface LandlockLauncherApi {
    /**
     * Returns the absolute path to the launcher binary.
     * May throw if the package is broken / not installed
     * (we treat any throw as "unavailable" and fail-closed).
     */
    launcherPath(): string;
    probe(launcher?: string): "full" | "partial" | "unusable";
    grantArgs(grants: {
        readOnly?: readonly string[];
        readWrite?: readonly string[];
    }): string[];
    /**
     * Exit code the launcher emits when it cannot apply the
     * requested restrictions. Documented on the API surface
     * so callers / tests can recognize a launcher-side
     * failure vs. a command-side failure.
     */
    readonly LAUNCHER_FAILURE_EXIT: number;
}
export interface LandlockSandboxExecutorOptions {
    api?: LandlockLauncherApi;
    /** Default `"error"` (fail-closed). */
    onUnusable?: "noop" | "error";
    /**
     * Re-run the probe on every call (skip the cache). Off by
     * default per the deepseek contract. Useful for tests
     * that swap the API between calls; production code should
     * leave it alone.
     */
    noProbeCache?: boolean;
}
export declare class LandlockSandboxExecutor implements SandboxExecutor {
    #private;
    constructor(options?: LandlockSandboxExecutorOptions);
    execute(command: string, context: SandboxContext): Promise<SandboxResult>;
}
//# sourceMappingURL=landlock.d.ts.map