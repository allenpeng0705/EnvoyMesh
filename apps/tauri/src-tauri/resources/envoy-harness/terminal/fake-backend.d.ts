/**
 * Phase C / Item 9 — hermetic fake terminal backend.
 *
 * Line-buffered scrollback with immediate send settlement.
 * No real PTY / `node-pty`. Controllable hooks for tests.
 */
import type { TerminalBackend, TerminalBackendSpawnSpec, TerminalSendRequest, TerminalSessionStatus, TerminalSignal } from "./types.js";
/** Optional hooks / knobs for {@link createFakeTerminalBackend}. */
export interface FakeTerminalBackendOptions {
    /** Backend type key (default `"fake"`). */
    type?: string;
    /** MOTD returned on spawn (default `"fake terminal ready"`). */
    motd?: string;
    /** Optional process id exposed on snapshots. */
    pid?: number;
    /** Delay before a send settles (default `0`). */
    sendDelayMs?: number;
    onSpawn?: (spec: TerminalBackendSpawnSpec) => void | Promise<void>;
    onSend?: (request: TerminalSendRequest, sessionId: string) => void;
    onSignal?: (signal: TerminalSignal, sessionId: string) => void;
    onClose?: (reason: string, sessionId: string) => void;
}
/** Mutable state exposed for tests via {@link createFakeTerminalBackend}. */
export interface FakeTerminalSessionState {
    lines: string[];
    status: TerminalSessionStatus;
    signals: TerminalSignal[];
    closed: string[];
}
/**
 * Create a fake {@link TerminalBackend} for hermetic tests.
 * Sessions retain a line buffer; sends settle immediately with
 * `waitReason: "inferred_idle"`.
 */
export declare function createFakeTerminalBackend(options?: FakeTerminalBackendOptions): TerminalBackend & {
    /** Test helper: inspect live session buffers. */
    readonly sessions: ReadonlyMap<string, FakeTerminalSessionState>;
};
//# sourceMappingURL=fake-backend.d.ts.map