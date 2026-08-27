/**
 * OS sandbox — public API.
 *
 * Phase F adds landlock + seatbelt backends on top of the
 * T3.4 seam (`SandboxExecutor` + `NoopSandboxExecutor`).
 */
export { NoopSandboxExecutor, type SandboxContext, type SandboxExecutor, type SandboxResult, } from "./types.js";
export { policyToLandlockGrants, policyToSeatbeltProfile, type LandlockGrants, } from "./policy.js";
export { LandlockSandboxExecutor, type LandlockLauncherApi, type LandlockSandboxExecutorOptions, } from "./backends/landlock.js";
export { SeatbeltSandboxExecutor, type SeatbeltSandboxExecutorOptions, } from "./backends/seatbelt.js";
export { WindowsJobSandboxExecutor, isWindowsSandboxAvailable, type WindowsJobSandboxExecutorOptions, } from "./backends/windows-job.js";
export { WindowsSidecarSandboxExecutor, isWindowsSidecarAvailable, resolveWindowsSidecarBin, type WindowsSidecarSandboxExecutorOptions, } from "./backends/windows-sidecar.js";
export { resolveSandboxExecutor, type ResolveSandboxExecutorOptions, } from "./resolve.js";
//# sourceMappingURL=index.d.ts.map