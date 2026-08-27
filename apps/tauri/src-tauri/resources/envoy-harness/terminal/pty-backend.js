/**
 * Phase C / Item 9 — optional `node-pty` terminal backend.
 *
 * `node-pty` is an optionalDependency. When it cannot
 * be resolved, {@link isPtyAvailable} returns false and
 * callers should fall back to the fake backend.
 */
import { createRequire } from "node:module";
const DEFAULT_READ_COUNT = 500;
const DEFAULT_QUIET_MS = 100;
const DEFAULT_QUIESCENCE_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_MS = 25;
const require = createRequire(import.meta.url);
function tryResolvePty() {
    try {
        require.resolve("node-pty");
        return true;
    }
    catch {
        return false;
    }
}
/** True when the optional `node-pty` package can be resolved. */
export function isPtyAvailable() {
    return tryResolvePty();
}
async function loadPty() {
    const mod = (await import("node-pty"));
    return mod;
}
function appendToLines(lines, chunk) {
    if (chunk.length === 0)
        return;
    const parts = chunk.split("\n");
    if (lines.length === 0)
        lines.push("");
    lines[lines.length - 1] = (lines[lines.length - 1] ?? "") + parts[0];
    for (let i = 1; i < parts.length; i++) {
        lines.push(parts[i]);
    }
}
function pageLines(lines, request) {
    const offset = request.offset ?? 0;
    const count = request.count ?? DEFAULT_READ_COUNT;
    const totalLines = lines.length;
    const startFromEnd = Math.min(Math.max(0, offset), totalLines);
    const endFromEnd = Math.min(startFromEnd + Math.max(0, count), totalLines);
    const sliceStart = totalLines - endFromEnd;
    const sliceEnd = totalLines - startFromEnd;
    const page = lines.slice(sliceStart, sliceEnd);
    return {
        text: page.join("\n"),
        totalLines,
        lineBegin: startFromEnd,
        lineEnd: endFromEnd,
        truncated: startFromEnd === 0 && endFromEnd < totalLines,
    };
}
/**
 * Wait for terminal output to go quiet (deepseek "readiness detection" /
 * `inferred_idle` parity). Resolves when the retained line buffer stops
 * growing for `quietMs`, the session exits, or `timeoutMs` elapses.
 * Polling-based so it is hermetic and deterministic in tests.
 */
export function waitForQuiescence(opts) {
    const quietMs = opts.quietMs ?? DEFAULT_QUIET_MS;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_QUIESCENCE_TIMEOUT_MS;
    const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
    const started = Date.now();
    return new Promise((resolve) => {
        if (opts.signal?.aborted) {
            resolve("timeout");
            return;
        }
        let last = totalChars(opts.lines);
        let lastChangedAt = started;
        const timer = setInterval(() => {
            if (opts.signal?.aborted) {
                clearInterval(timer);
                resolve("timeout");
                return;
            }
            if (opts.getStatus().kind === "exited") {
                clearInterval(timer);
                resolve("session_exit");
                return;
            }
            const now = Date.now();
            const current = totalChars(opts.lines);
            if (current !== last) {
                last = current;
                lastChangedAt = now;
            }
            if (now - lastChangedAt >= quietMs) {
                clearInterval(timer);
                resolve("inferred_idle");
                return;
            }
            if (now - started >= timeoutMs) {
                clearInterval(timer);
                resolve("timeout");
                return;
            }
        }, pollMs);
    });
}
/** Total retained characters (lines + newline separators). */
function totalChars(lines) {
    let n = lines.length > 0 ? lines.length - 1 : 0;
    for (const line of lines)
        n += line.length;
    return n;
}
/** The full retained terminal text (the delta basis for send viewports). */
function retainedText(lines) {
    return lines.join("\n");
}
function mapSignal(signal) {
    switch (signal) {
        case "SIGINT":
            return "SIGINT";
        case "SIGTERM":
            return "SIGTERM";
        case "SIGKILL":
            return "SIGKILL";
        case "SIGTSTP":
            return "SIGTSTP";
        case "SIGHUP":
            return "SIGHUP";
    }
}
function createPtySession(handle, lines, getStatus, setStatus) {
    return {
        motd: "pty ready",
        pid: handle.pid,
        startSend(request) {
            const chunk = request.submit === true ? `${request.text}\n` : request.text;
            const before = retainedText(lines);
            let latestViewport = chunk;
            handle.write(chunk);
            const readLiveViewport = () => {
                const after = retainedText(lines);
                return after.length > before.length ? after.slice(before.length) : latestViewport;
            };
            const done = waitForQuiescence({
                lines,
                getStatus,
                ...(request.signal !== undefined ? { signal: request.signal } : {}),
            }).then((waitReason) => {
                const after = retainedText(lines);
                const viewport = after.length > before.length ? after.slice(before.length) : chunk;
                latestViewport = viewport;
                return {
                    viewport,
                    waitReason,
                    sessionStatus: getStatus(),
                    truncated: false,
                };
            });
            return {
                done,
                readOutput() {
                    const viewport = readLiveViewport();
                    latestViewport = viewport;
                    return { delta: viewport, truncated: false };
                },
                cancel() {
                    return false;
                },
            };
        },
        read(request) {
            return pageLines(lines, request);
        },
        async signal(signal) {
            handle.kill(mapSignal(signal));
            if (signal === "SIGKILL" && getStatus().kind === "running") {
                setStatus({ kind: "exited", exitCode: null, signal: "SIGKILL" });
            }
            return { delivered: true, targetPgid: handle.pid };
        },
        status() {
            return getStatus();
        },
        async close(_reason) {
            try {
                handle.kill("SIGHUP");
            }
            catch {
                // already exited
            }
            if (getStatus().kind === "running") {
                setStatus({ kind: "exited", exitCode: 0, signal: null });
            }
        },
    };
}
/**
 * Create a real PTY {@link TerminalBackend} via `node-pty`.
 * Callers should gate on {@link isPtyAvailable} first.
 */
export function createPtyTerminalBackend() {
    return {
        type: "pty",
        async spawn(spec) {
            spec.signal?.throwIfAborted();
            if (!tryResolvePty()) {
                throw new Error("node-pty is not available");
            }
            const pty = await loadPty();
            spec.signal?.throwIfAborted();
            const shell = process.env["SHELL"] && process.env["SHELL"].length > 0
                ? process.env["SHELL"]
                : process.platform === "win32"
                    ? "powershell.exe"
                    : "/bin/bash";
            const handle = pty.spawn(shell, [], {
                name: "xterm-color",
                cols: 80,
                rows: 24,
                ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
                env: process.env,
            });
            const lines = [];
            let status = { kind: "running" };
            handle.onData((data) => appendToLines(lines, data));
            handle.onExit(({ exitCode, signal }) => {
                status = {
                    kind: "exited",
                    exitCode,
                    signal: null,
                };
                // node-pty reports numeric signal codes; we don't map them
                // to NodeJS.Signals names here (fake backend uses string names).
                void signal;
            });
            return createPtySession(handle, lines, () => status, (s) => {
                status = s;
            });
        },
    };
}
//# sourceMappingURL=pty-backend.js.map