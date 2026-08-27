/**
 * Phase C / Item 9 — persistent terminal types (L3 port of
 * deepseek `dsh-terminal`, Cordis-free).
 *
 * Owner is an opaque string (typically `session.id`).
 * Real PTY (`node-pty`) is deferred; v0 ships a fake
 * backend for tests + a pipe-backed process backend.
 */
export class TerminalError extends Error {
    code;
    name = "TerminalError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map