/**
 * FakeStdio — a controllable stdio pair for testing
 * `StdioLspClient` without a real child process.
 *
 * **What it does:** exposes the same surface as a Node
 * `ChildProcess`'s `stdin` / `stdout` (the bits
 * `StdioLspClient` actually uses), but:
 * - `stdin.write(chunk)` is captured into `writes[]`
 *   instead of going anywhere.
 * - `stdout.on("data", listener)` stores the listener;
 *   tests call `feed(chunk)` to push scripted data.
 *
 * **`process` is mocked:** `kill()` records the signal;
 *   tests can assert on it.
 *
 * **Why this exists:** the alternative is spawning
 * `typescript-language-server --stdio` in tests, which
 * is slow, flaky, and requires the binary in CI. The
 * protocol layer (framing, request/response matching,
 * notification dispatch) is what F9.2.2 tests; the
 * "does the real server understand our messages" is a
 * manual smoke test, not a unit test.
 *
 * **Stability:** the public surface is `FakeStdio` (class)
 * + `FakeStdioOptions` (interface). Additive.
 */
/**
 * A scripted-by-test `LspProcess`. Constructor wires
 * the pair; tests feed via `feedFromServer` and inspect
 * `writesToServer`.
 */
export class FakeStdio {
    /** Each entry is a UTF-8 string the client wrote. */
    writesToServer = [];
    /** Kill signal calls; each entry is the signal (or undefined). */
    killCalls = [];
    /** Whether `stdin.end()` was called. */
    stdinEnded = false;
    listeners = [];
    _stdinOpen = true;
    // --- LspProcess surface ---
    stdin = {
        write: (chunk) => {
            if (!this._stdinOpen) {
                throw new Error("FakeStdio: write after end()");
            }
            this.writesToServer.push(chunk);
        },
        end: () => {
            this._stdinOpen = false;
            this.stdinEnded = true;
        },
    };
    stdout = {
        on: (_event, listener) => {
            this.listeners.push(listener);
        },
        off: (_event, listener) => {
            const i = this.listeners.indexOf(listener);
            if (i !== -1)
                this.listeners.splice(i, 1);
        },
    };
    kill(signal) {
        this.killCalls.push(signal);
    }
    // --- test helpers ---
    /** Push a chunk from the "server" to the client. */
    feedFromServer(chunk) {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        for (const l of this.listeners)
            l(buf);
    }
    /** Get all messages the client wrote, as parsed JSON. */
    get messagesToServer() {
        return this.writesToServer
            .map(parseLspFrame)
            .filter((m) => m !== null);
    }
    /**
     * Convenience: write a single message to the client as
     * if it came from the server. Takes care of
     * Content-Length framing.
     */
    sendFromServer(message) {
        this.feedFromServer(frameLspMessage(message));
    }
}
// ---------------------------------------------------------------------------
// LSP framing helpers (used by FakeStdio + tests)
// ---------------------------------------------------------------------------
/**
 * Frame a JSON-RPC message per the LSP spec:
 * `Content-Length: N\r\n\r\n<body>`.
 */
export function frameLspMessage(message) {
    const body = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}
/**
 * Parse one or more LSP frames from a UTF-8 string and
 * return the JSON messages. Returns null entries for
 * frames that fail to parse (so the test can assert on
 * the count without crashing).
 */
function parseLspFrame(s) {
    // The string may contain multiple frames; iterate.
    // Tests usually write one frame at a time, but be safe.
    // For simplicity here, we only return the FIRST valid
    // frame — tests that write multiple frames should use
    // `getAllMessages` (not implemented; not needed yet).
    const headerEnd = s.indexOf("\r\n\r\n");
    if (headerEnd === -1)
        return null;
    const headerSection = s.slice(0, headerEnd);
    const m = /^Content-Length:\s*(\d+)\s*$/im.exec(headerSection);
    if (!m)
        return null;
    const len = Number(m[1]);
    const body = s.slice(headerEnd + 4, headerEnd + 4 + len);
    if (body.length < len)
        return null;
    try {
        return JSON.parse(body);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=fake-stdio.js.map