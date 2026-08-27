import { spawnCapture } from "./backends/spawn-capture.js";
/**
 * The default `SandboxExecutor` — passes the
 * command through to the bash tool's normal
 * spawn. The 6 bash validators already ran
 * (the bash tool doesn't bypass them); this
 * executor just runs the command in the same
 * process tree as the harness.
 *
 * **Why a noop at all:** the bash tool's code path
 * differs based on whether a `sandboxExecutor` is
 * set. The noop ensures the default behavior is
 * identical to v0 (no sandbox enforcement layer).
 * A future landlock/namespace executor is a
 * drop-in replacement — the bash tool calls the
 * same method, the executor decides whether to
 * wrap the spawn.
 */
export class NoopSandboxExecutor {
    /**
     * Wraps a raw `child_process.spawn` and
     * captures stdout/stderr/exitCode. The
     * bash tool owns the actual command logic;
     * this executor just runs the supplied
     * command in a child process and reports the
     * result. The 6 bash validators already
     * approved the command; this is the
     * "no kernel sandbox" fallback.
     */
    async execute(command, context) {
        return spawnCapture({
            file: "sh",
            args: ["-c", command],
            cwd: context.cwd,
            signal: context.signal,
            ...(context.maxOutputBytes !== undefined
                ? { maxOutputBytes: context.maxOutputBytes }
                : {}),
            ...(context.onStdout !== undefined
                ? { onStdout: context.onStdout }
                : {}),
        });
    }
}
//# sourceMappingURL=types.js.map