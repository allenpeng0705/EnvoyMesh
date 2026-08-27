/**
 * Phase F2a — Windows sandbox scaffold (job-object lifecycle).
 *
 * **F2a scope:** run commands via `cmd.exe` on Windows; libuv assigns spawned
 * children to a kill-on-close job object. Full FS isolation (Codex
 * `windows-sandbox-rs`) is **F2b** — not implemented here.
 */
import { spawnCapture } from "./spawn-capture.js";
/** True when the F2a executor targets this host. */
export function isWindowsSandboxAvailable() {
    return process.platform === "win32";
}
export class WindowsJobSandboxExecutor {
    #onUnusable;
    constructor(options = {}) {
        this.#onUnusable = options.onUnusable ?? "error";
    }
    async execute(command, context) {
        const captureOpts = {
            cwd: context.cwd,
            signal: context.signal,
            ...(context.maxOutputBytes !== undefined
                ? { maxOutputBytes: context.maxOutputBytes }
                : {}),
            ...(context.onStdout !== undefined
                ? { onStdout: context.onStdout }
                : {}),
        };
        if (process.platform !== "win32") {
            if (this.#onUnusable === "noop") {
                return spawnCapture({
                    file: "sh",
                    args: ["-c", command],
                    ...captureOpts,
                });
            }
            return {
                stdout: "",
                stderr: "windows-sandbox backend is only available on Windows",
                exitCode: 125,
                isError: true,
                stdoutTruncated: false,
                stderrTruncated: false,
            };
        }
        return spawnCapture({
            file: "cmd.exe",
            args: ["/d", "/s", "/c", command],
            ...captureOpts,
        });
    }
}
//# sourceMappingURL=windows-job.js.map