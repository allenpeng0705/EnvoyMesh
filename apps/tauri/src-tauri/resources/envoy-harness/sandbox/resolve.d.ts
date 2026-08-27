/**
 * Phase F — pick SandboxExecutor from policy + platform.
 *
 * **Resolver contract (post-review):**
 * 1. The kernel-level sandbox is **opt-in**. A policy with
 *    `backend: "none"` always resolves to a noop executor,
 *    regardless of platform.
 * 2. `force: "landlock" | "seatbelt" | "noop"` overrides the
 *    policy (used by tests and explicit CLI flags).
 * 3. When the policy says `backend: "linux-landlock"`:
 *    - on Linux → `LandlockSandboxExecutor`
 *    - on any other platform → **noop** (do NOT silently swap
 *      to seatbelt; the user asked for landlock, so we honor
 *      the noop fallback when their chosen backend is
 *      unavailable on this host). This is the
 *      hermeticity-preserving choice: never requires a real
 *      kernel unless explicitly asked.
 * 4. `backend: "process-fs-namespace"` is reserved (no
 *    implementation in v0); resolves to noop.
 *
 * The Agent passes `force: "noop"` only when its
 * `sandboxExecutor` option is the noop executor, and the CLI
 * `--sandbox-executor <name>` flag is the user-facing opt-in.
 */
import type { SandboxPolicy } from "../types.js";
import { LandlockSandboxExecutor } from "./backends/landlock.js";
import { SeatbeltSandboxExecutor } from "./backends/seatbelt.js";
import { type WindowsJobSandboxExecutorOptions } from "./backends/windows-job.js";
import { type WindowsSidecarSandboxExecutorOptions } from "./backends/windows-sidecar.js";
import { type SandboxExecutor } from "./types.js";
export interface ResolveSandboxExecutorOptions {
    policy: SandboxPolicy;
    platform?: NodeJS.Platform;
    force?: "landlock" | "seatbelt" | "windows-sandbox" | "noop";
    landlock?: ConstructorParameters<typeof LandlockSandboxExecutor>[0];
    seatbelt?: ConstructorParameters<typeof SeatbeltSandboxExecutor>[0];
    windowsJob?: WindowsJobSandboxExecutorOptions;
    windowsSidecar?: WindowsSidecarSandboxExecutorOptions;
    /**
     * Explicit Windows executor choice. When set, overrides the
     * ambient sidecar-availability check (`isWindowsSidecarAvailable`
     * reads the environment + installed package, which is not
     * deterministic for tests and hosts). Hosts with a broken or
     * unwanted sidecar can force `"job"`.
     */
    windowsMode?: "sidecar" | "job";
}
export declare function resolveSandboxExecutor(options: ResolveSandboxExecutorOptions): SandboxExecutor;
//# sourceMappingURL=resolve.d.ts.map