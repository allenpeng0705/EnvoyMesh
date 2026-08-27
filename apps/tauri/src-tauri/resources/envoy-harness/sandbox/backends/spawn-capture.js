/**
 * Shared spawn-and-capture helper for all sandbox executors
 * (landlock, seatbelt, noop).
 *
 * **Why this exists:** the three backends each had their own
 * near-identical copy of the same `spawn → pipe stdout/stderr
 * → resolve on close` boilerplate. None of them enforced an
 * output cap, so a chatty command (`cat /dev/urandom`) would
 * OOM the process. This helper:
 *
 * 1. Spawns the child with `stdio: ["ignore", "pipe", "pipe"]`.
 * 2. Streams stdout and stderr separately, each capped at
 *    `maxOutputBytes` (default 1 MiB per stream). When the
 *    cap is hit, the stream is closed and the rest is dropped.
 * 3. Resolves on `close` with the captured text + a
 *    `stdoutTruncated` / `stderrTruncated` flag, OR on
 *    `error` (spawn failure).
 * 4. Honors the caller's `AbortSignal` (already plumbed via
 *    `spawn({ signal })`).
 *
 * Do NOT introduce another copy of this in a backend.
 */
import { spawn } from "node:child_process";
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MiB per stream
export function spawnCapture(options) {
    const cap = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(options.file, [...options.args], {
                cwd: options.cwd,
                ...(options.signal !== undefined ? { signal: options.signal } : {}),
                stdio: ["ignore", "pipe", "pipe"],
            });
        }
        catch (err) {
            resolve({
                stdout: "",
                stderr: err instanceof Error ? err.message : String(err),
                exitCode: 1,
                isError: true,
                stdoutTruncated: false,
                stderrTruncated: false,
            });
            return;
        }
        const outChunks = [];
        const errChunks = [];
        let outTotal = 0;
        let errTotal = 0;
        let outTruncated = false;
        let errTruncated = false;
        let outClosed = false;
        let errClosed = false;
        let childExitCode = null;
        let settled = false;
        const tryFinish = () => {
            if (settled)
                return;
            // Wait for the child to actually close (so `exitCode`
            // is set) AND for both pipes to close (so we don't
            // truncate trailing output).
            if (childExitCode === null)
                return;
            if (!outClosed || !errClosed)
                return;
            settled = true;
            const stdout = Buffer.concat(outChunks).toString("utf8");
            const stderr = Buffer.concat(errChunks).toString("utf8");
            resolve({
                stdout,
                stderr,
                exitCode: childExitCode,
                isError: childExitCode !== 0,
                stdoutTruncated: outTruncated,
                stderrTruncated: errTruncated,
            });
        };
        child.stdout?.on("data", (chunk) => {
            if (options.onStdout !== undefined && chunk.byteLength > 0) {
                options.onStdout(chunk.toString("utf8"));
            }
            if (outTruncated)
                return; // drain but drop
            const remaining = cap - outTotal;
            if (chunk.byteLength > remaining) {
                if (remaining > 0)
                    outChunks.push(chunk.subarray(0, remaining));
                outTotal = cap;
                outTruncated = true;
                // Switch to "drain-and-drop" mode instead of destroying
                // the stream. Destroying a pipe stream can wedge the
                // child on SIGPIPE handling; keeping the pipe open and
                // letting the kernel buffer drain is safer and lets the
                // child finish naturally so `close` fires.
            }
            else {
                outChunks.push(chunk);
                outTotal += chunk.byteLength;
            }
        });
        child.stdout?.on("close", () => {
            outClosed = true;
            tryFinish();
        });
        child.stderr?.on("data", (chunk) => {
            if (errTruncated)
                return;
            const remaining = cap - errTotal;
            if (chunk.byteLength > remaining) {
                if (remaining > 0)
                    errChunks.push(chunk.subarray(0, remaining));
                errTotal = cap;
                errTruncated = true;
                // Same "drain-and-drop" rationale as stdout.
            }
            else {
                errChunks.push(chunk);
                errTotal += chunk.byteLength;
            }
        });
        child.stderr?.on("close", () => {
            errClosed = true;
            tryFinish();
        });
        child.on("close", (code) => {
            // Node sets `child.exitCode` synchronously here.
            childExitCode = code;
            tryFinish();
        });
        child.on("error", (err) => {
            if (settled)
                return;
            settled = true;
            resolve({
                stdout: Buffer.concat(outChunks).toString("utf8"),
                stderr: err.message,
                exitCode: 1,
                isError: true,
                stdoutTruncated: outTruncated,
                stderrTruncated: errTruncated,
            });
        });
    });
}
//# sourceMappingURL=spawn-capture.js.map