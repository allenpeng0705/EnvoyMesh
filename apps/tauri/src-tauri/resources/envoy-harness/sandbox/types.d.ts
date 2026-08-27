/**
 * OS sandbox — types and the executor interface.
 *
 * **Design:** §5.2 / §7. v0 ships the *six bash
 * validators* (permission/syntax/path/redirect/
 * destructive/quote), which enforce the policy at
 * the command-parse level. The OS sandbox is a
 * second layer of enforcement — kernel-level
 * (landlock, namespace) — that wraps the actual
 * command execution.
 *
 * **T3.4 scope:** the *seam* only. v0 ships:
 * - `SandboxExecutor` interface
 * - `NoopSandboxExecutor` (default; the bash tool
 *   still uses the 6 validators but no kernel
 *   enforcement)
 *
 * The `LandlockSandboxExecutor` (Linux 5.13+) and
 * the `ProcessNamespaceSandboxExecutor` (POSIX,
 * needs CAP_SYS_ADMIN or unshare(1)) land in
 * follow-up sub-chunks T3.4.1 and T3.4.2. They
 * require a Linux test environment to validate
 * the actual kernel enforcement; shipping them
 * without a Linux test would be a lie about what
 * we can prove.
 *
 * **Why ship the seam first:** the bash tool
 * already has the seam (`sandboxPolicy` is in
 * `ToolContext`; `ToolRegistry` already has 6
 * validators; the gap is the kernel-level
 * executor). A small `SandboxExecutor` interface
 * + a noop default lands the shape; the landlock
 * impl drops in as a back-end detail (the bash
 * tool doesn't change).
 */
import type { SandboxPolicy } from "../types.js";
/**
 * The context a `SandboxExecutor.execute` sees.
 * The executor decides what to allow (filesystem
 * paths, network, etc.) based on the policy.
 */
export interface SandboxContext {
    /**
     * The current sandbox policy. The executor maps
     * `mode`, `backend`, `writableRoots`, and
     * `networkAccess` to kernel-level rules (e.g.
     * landlock FS rules, namespace bind mounts).
     */
    readonly policy: SandboxPolicy;
    /**
     * The working directory for the command. The
     * executor's default `cwd` for the spawned
     * subprocess (the bash tool sets this to
     * `ctx.cwd`, which is the agent's cwd).
     */
    readonly cwd: string;
    /**
     * The abort signal. The executor forwards this
     * to the spawned subprocess (so the bash tool's
     * abort semantics work the same way).
     */
    readonly signal: AbortSignal;
    /**
     * Per-stream output cap in bytes. Default 1 MiB.
     * A chatty command (`cat /dev/urandom`) is
     * truncated to this cap; the rest is dropped and
     * `stdoutTruncated` / `stderrTruncated` are set
     * on the {@link SandboxResult}.
     */
    readonly maxOutputBytes?: number;
    /**
     * Live stdout chunks during command execution. Bash forwards
     * these to protocol hosts as `tool_progress` activity.
     */
    readonly onStdout?: (chunk: string) => void;
}
/**
 * The result of a `SandboxExecutor.execute` call.
 * The executor may wrap the subprocess (so it sees
 * the wrapped stdout/stderr/exitCode) or run the
 * command directly (so it sees the raw output).
 *
 * v0 only ships the direct case (`NoopSandboxExecutor`).
 * The wrapping case (landlock/namespace) lands with
 * the kernel backends.
 */
export interface SandboxResult {
    /** The captured stdout (UTF-8). */
    stdout: string;
    /** The captured stderr (UTF-8). */
    stderr: string;
    /** The exit code of the wrapped (or unwrapped) command. */
    exitCode: number;
    /** If true, the sandbox itself rejected the command. */
    isError: boolean;
    /**
     * True when stdout was truncated by the executor's
     * output cap. Backends that pipe through the sandbox
     * wrapper report the wrapped stream's truncation;
     * backends that capture directly report the
     * pipe-buffer truncation. Always false when the
     * command's stdout fit under the cap.
     */
    readonly stdoutTruncated?: boolean;
    /** Same as {@link SandboxResult.stdoutTruncated} but for stderr. */
    readonly stderrTruncated?: boolean;
}
/**
 * The executor interface. The bash tool calls
 * `execute(command, context)` when a `sandboxExecutor`
 * is configured on the agent; the 6 bash validators
 * run first (as today), and the executor is the
 * second layer.
 *
 * **Why a second layer:** the validators work at
 * the command-parse level. They miss:
 * - File writes via an interpreter (`python -c
 *   'open("/etc/passwd","w")...'` — the
 *   interpreters are blocked at the wrapper level,
 *   but a determined user can find an unblocked
 *   one).
 * - Native file ops the bash tool doesn't see
 *   (e.g. a hook on the bash tool can edit a
 *   sub-process's args, but can't catch a
 *   `tee(1)` call).
 * The kernel sandbox (landlock: deny write to
 * `/etc`) catches these as a final filter.
 */
export interface SandboxExecutor {
    /**
     * Run the command under the sandbox. Returns
     * the captured output + exit code. Throws on
     * sandbox infrastructure failure (e.g. landlock
     * ruleset construction failed); these are
     * programming bugs, not user errors.
     */
    execute(command: string, context: SandboxContext): Promise<SandboxResult>;
}
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
export declare class NoopSandboxExecutor implements SandboxExecutor {
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
    execute(command: string, context: SandboxContext): Promise<SandboxResult>;
}
//# sourceMappingURL=types.d.ts.map