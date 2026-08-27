/**
 * OS sandbox — public API.
 *
 * Phase F adds landlock + seatbelt backends on top of the
 * T3.4 seam (`SandboxExecutor` + `NoopSandboxExecutor`).
 */
export { NoopSandboxExecutor, } from "./types.js";
export { policyToLandlockGrants, policyToSeatbeltProfile, } from "./policy.js";
export { LandlockSandboxExecutor, } from "./backends/landlock.js";
export { SeatbeltSandboxExecutor, } from "./backends/seatbelt.js";
export { WindowsJobSandboxExecutor, isWindowsSandboxAvailable, } from "./backends/windows-job.js";
export { WindowsSidecarSandboxExecutor, isWindowsSidecarAvailable, resolveWindowsSidecarBin, } from "./backends/windows-sidecar.js";
export { resolveSandboxExecutor, } from "./resolve.js";
//# sourceMappingURL=index.js.map