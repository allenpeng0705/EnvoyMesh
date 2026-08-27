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
import type { SandboxResult } from "../types.js";
export interface SpawnCaptureOptions {
    file: string;
    args: readonly string[];
    cwd: string;
    signal: AbortSignal | undefined;
    /** Per-stream cap. Default 1 MiB. */
    maxOutputBytes?: number;
    /** Live stdout chunks (UTF-8). Used for protocol `tool_progress`. */
    onStdout?: (chunk: string) => void;
}
export interface SpawnCaptureResult extends SandboxResult {
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
}
export declare function spawnCapture(options: SpawnCaptureOptions): Promise<SpawnCaptureResult>;
//# sourceMappingURL=spawn-capture.d.ts.map