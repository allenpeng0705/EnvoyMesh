/**
 * Phase C / Item 9 — hermetic fake terminal backend.
 *
 * Line-buffered scrollback with immediate send settlement.
 * No real PTY / `node-pty`. Controllable hooks for tests.
 */
const DEFAULT_READ_COUNT = 500;
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
        // Newest-first page that did not reach the oldest line.
        truncated: startFromEnd === 0 && endFromEnd < totalLines,
    };
}
function createFakeSession(sessionId, options, state) {
    const motd = options.motd ?? "fake terminal ready";
    const pid = options.pid;
    const sendDelayMs = options.sendDelayMs ?? 0;
    const session = {
        motd,
        ...(pid !== undefined ? { pid } : {}),
        startSend(request) {
            options.onSend?.(request, sessionId);
            const chunk = request.submit === true ? `${request.text}\n` : request.text;
            appendToLines(state.lines, chunk);
            const viewport = chunk;
            let settled = false;
            let settle;
            const gate = new Promise((resolve) => {
                settle = resolve;
            });
            const timer = sendDelayMs > 0
                ? setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        settle();
                    }
                }, sendDelayMs)
                : undefined;
            if (sendDelayMs <= 0) {
                queueMicrotask(() => {
                    if (!settled) {
                        settled = true;
                        settle();
                    }
                });
            }
            const done = gate.then(() => {
                if (timer !== undefined)
                    clearTimeout(timer);
                return {
                    viewport,
                    waitReason: "inferred_idle",
                    sessionStatus: state.status,
                    truncated: false,
                };
            });
            return {
                done,
                readOutput() {
                    return { delta: viewport, truncated: false };
                },
                cancel() {
                    if (settled)
                        return false;
                    settled = true;
                    if (timer !== undefined)
                        clearTimeout(timer);
                    settle();
                    return true;
                },
            };
        },
        read(request) {
            return pageLines(state.lines, request);
        },
        async signal(signal) {
            options.onSignal?.(signal, sessionId);
            state.signals.push(signal);
            if (signal === "SIGKILL" && state.status.kind === "running") {
                state.status = { kind: "exited", exitCode: null, signal: "SIGKILL" };
            }
            return { delivered: true, targetPgid: pid ?? 1 };
        },
        status() {
            return state.status;
        },
        async close(reason) {
            options.onClose?.(reason, sessionId);
            state.closed.push(reason);
            if (state.status.kind === "running") {
                state.status = { kind: "exited", exitCode: 0, signal: null };
            }
        },
    };
    return session;
}
/**
 * Create a fake {@link TerminalBackend} for hermetic tests.
 * Sessions retain a line buffer; sends settle immediately with
 * `waitReason: "inferred_idle"`.
 */
export function createFakeTerminalBackend(options = {}) {
    const type = options.type ?? "fake";
    const sessions = new Map();
    return {
        type,
        sessions,
        async spawn(spec) {
            spec.signal?.throwIfAborted();
            await options.onSpawn?.(spec);
            spec.signal?.throwIfAborted();
            const state = {
                lines: [],
                status: { kind: "running" },
                signals: [],
                closed: [],
            };
            sessions.set(spec.sessionId, state);
            return createFakeSession(spec.sessionId, options, state);
        },
    };
}
//# sourceMappingURL=fake-backend.js.map