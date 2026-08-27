/**
 * Phase C / Item 9 — optional `node-pty` terminal backend.
 *
 * `node-pty` is an optionalDependency. When it cannot
 * be resolved, {@link isPtyAvailable} returns false and
 * callers should fall back to the fake backend.
 */
import type { TerminalBackend, TerminalSessionStatus } from "./types.js";
/** True when the optional `node-pty` package can be resolved. */
export declare function isPtyAvailable(): boolean;
/**
 * Wait for terminal output to go quiet (deepseek "readiness detection" /
 * `inferred_idle` parity). Resolves when the retained line buffer stops
 * growing for `quietMs`, the session exits, or `timeoutMs` elapses.
 * Polling-based so it is hermetic and deterministic in tests.
 */
export declare function waitForQuiescence(opts: {
    lines: string[];
    getStatus: () => TerminalSessionStatus;
    signal?: AbortSignal;
    quietMs?: number;
    timeoutMs?: number;
    pollMs?: number;
}): Promise<"inferred_idle" | "timeout" | "session_exit">;
/**
 * Create a real PTY {@link TerminalBackend} via `node-pty`.
 * Callers should gate on {@link isPtyAvailable} first.
 */
export declare function createPtyTerminalBackend(): TerminalBackend;
//# sourceMappingURL=pty-backend.d.ts.map