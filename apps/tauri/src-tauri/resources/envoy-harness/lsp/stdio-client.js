/**
 * StdioLspClient — an `LspClient` that talks to a real
 * language server over stdio.
 *
 * **What this is:** the production `LspClient`. Speaks the
 * LSP protocol (JSON-RPC 2.0 over stdio with `Content-Length`
 * framing) against a child process. The host spawns the
 * server (e.g. `typescript-language-server --stdio`) and
 * hands the streams to this class.
 *
 * **Why take the streams as inputs:** the host owns the
 * process lifecycle. Spawning is F9.2+1 (auto-spawn by
 * extension). For v0, the host does:
 *
 * ```ts
 * const child = spawn("typescript-language-server", ["--stdio"]);
 * const client = new StdioLspClient({
 *   stdin: child.stdin,
 *   stdout: child.stdout,
 *   process: child,
 * });
 * await client.initialize({ rootUri: "file:///..." });
 * ```
 *
 * **JSON-RPC 2.0 + LSP framing:** each message is preceded
 * by a header section:
 *
 * ```
 * Content-Length: 123\r\n
 * \r\n
 * {"jsonrpc":"2.0","id":1,...}
 * ```
 *
 * The body length must match the `Content-Length` value.
 * We don't send `Content-Type` (LSP servers don't require
 * it; some ignore it).
 *
 * **Concurrency:** multiple requests can be in flight at
 * once. Each request gets a unique `id`; responses are
 * matched by `id`. We use a `Map<id, {resolve, reject}>`
 * for outstanding requests.
 *
 * **Server-initiated requests:** LSP servers can send
 * requests (not just notifications) that need a reply
 * (e.g. `client/registerCapability`,
 * `window/workDoneProgress/create`). For v0, we accept
 * them and reply with `null` (the LSP spec's "method not
 * supported" pattern). A future chunk can add a
 * `registerHandler(method, fn)` API.
 *
 * **Server-initiated notifications:** e.g.
 * `textDocument/publishDiagnostics` (the server pushes
 * diagnostics to us; we don't ask). We track them in a
 * `Map<file, LspDiagnostic[]>`; `diagnostics(file)` reads
 * the current map.
 *
 * **`initialize` / `initialized` handshake:** the LSP
 * spec REQUIRES:
 * 1. Client sends `initialize` request.
 * 2. Server replies with its capabilities.
 * 3. Client sends `initialized` notification.
 *
 * We do this in the constructor's `initialize()` method
 * (called explicitly by the host). Until `initialize()`
 * resolves, the 4 ops throw.
 *
 * **Stability:** the public surface is `StdioLspClient`
 * (class) + `StdioLspClientOptions` (interface) +
 * `LspProcess` (interface). Additive.
 */
import * as path from "node:path";
// ---------------------------------------------------------------------------
// StdioLspClient
// ---------------------------------------------------------------------------
/**
 * The production `LspClient`. Talks JSON-RPC 2.0 over stdio
 * to a child process. See module doc for the full protocol
 * summary.
 */
export class StdioLspClient {
    process;
    rootUri;
    clientCapabilities;
    log;
    requestTimeoutMs;
    nextId = 1;
    pending = new Map();
    diagnosticsMap = new Map();
    /** Resolvers waiting for the next publishDiagnostics per file. */
    diagnosticsWaiters = new Map();
    _initialized = false;
    /**
     * Set to `true` by `close()` once the shutdown/exit
     * dance is complete and the process is killed. New
     * requests throw via `assertOpen`. During the
     * shutdown/exit dance itself, `_closing` is true but
     * `_closed` is still false, so the in-flight
     * `sendRequest` / `sendNotification` calls don't hit
     * the `assertOpen` guard.
     */
    _closing = false;
    _closed = false;
    dataListener;
    buffer = Buffer.alloc(0);
    constructor(options) {
        this.process = options.process;
        this.rootUri = options.rootUri;
        this.clientCapabilities = options.clientCapabilities ?? {
            // The default capability set: we accept diagnostics
            // (via publishDiagnostics) and that's it. v0 doesn't
            // use workspace/config, window/workDoneProgress, etc.
            textDocument: {
                synchronization: { dynamicRegistration: false },
                publishDiagnostics: { relatedInformation: false },
            },
        };
        this.log = options.log ?? (() => { });
        this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
        this.dataListener = (chunk) => this.onData(chunk);
        this.process.stdout.on("data", this.dataListener);
    }
    // --- lifecycle ---
    /**
     * Send the `initialize` request + `initialized` notification.
     * Must be called once before any of the 4 ops. Returns the
     * server's capabilities (for future use; v0 ignores them).
     */
    async initialize() {
        this.assertOpen();
        const result = await this.sendRequest("initialize", {
            processId: process.pid,
            rootUri: this.rootUri,
            capabilities: this.clientCapabilities,
            workspaceFolders: null,
        });
        await this.sendNotification("initialized", {});
        this._initialized = true;
        this.log(`initialized; server capabilities=${JSON.stringify(result).slice(0, 200)}`);
        return (result ?? {});
    }
    async close() {
        if (this._closing || this._closed)
            return;
        this._closing = true;
        try {
            if (this._initialized) {
                try {
                    await this.sendRequest("shutdown", null);
                    await this.sendNotification("exit", null);
                }
                catch (e) {
                    // Server may already be dead; the shutdown /
                    // exit dance is best-effort.
                    this.log(`shutdown/exit failed: ${e.message}`);
                }
            }
            this.process.stdin.end();
        }
        finally {
            // Stop listening to the server's stdout AFTER
            // shutdown completes — we needed to receive the
            // shutdown response.
            this.process.stdout.off("data", this.dataListener);
            // Reject any outstanding requests so callers don't hang.
            for (const { reject } of this.pending.values()) {
                reject(new Error("StdioLspClient: closed"));
            }
            this.pending.clear();
            // Resolve any diagnostics waiters with whatever we have.
            for (const waiters of this.diagnosticsWaiters.values()) {
                for (const w of waiters) {
                    clearTimeout(w.timer);
                    w.resolve();
                }
            }
            this.diagnosticsWaiters.clear();
            this.process.kill();
            this._closed = true;
        }
    }
    // --- 4 ops ---
    async definition(file, line, column) {
        this.assertInitialized();
        const result = await this.sendRequest("textDocument/definition", {
            textDocument: { uri: pathToUri(file) },
            position: { line, character: column },
        });
        return normalizeLocations(result);
    }
    async references(file, line, column) {
        this.assertInitialized();
        const result = await this.sendRequest("textDocument/references", {
            textDocument: { uri: pathToUri(file) },
            position: { line, character: column },
            context: { includeDeclaration: true },
        });
        return normalizeLocations(result);
    }
    async hover(file, line, column) {
        this.assertInitialized();
        const result = (await this.sendRequest("textDocument/hover", {
            textDocument: { uri: pathToUri(file) },
            position: { line, character: column },
        }));
        if (!result)
            return null;
        return {
            file,
            line,
            column,
            contents: extractHoverContents(result.contents),
        };
    }
    async diagnostics(file) {
        this.assertInitialized();
        this.assertOpen();
        // Diagnostics are pushed by the server via
        // `textDocument/publishDiagnostics`. We don't request;
        // we read what the server has sent.
        return this.diagnosticsMap.get(normalizePath(file)) ?? [];
    }
    /**
     * Open a document (LSP `textDocument/didOpen`). Servers
     * publish diagnostics for opened documents; without this,
     * `diagnostics()` is always empty for files the server has
     * never seen.
     */
    async didOpen(file, text) {
        this.assertInitialized();
        this.assertOpen();
        const uri = pathToUri(file);
        await this.sendNotification("textDocument/didOpen", {
            textDocument: {
                uri,
                languageId: languageIdFromPath(file),
                version: 1,
                text,
            },
        });
    }
    /** Close a document (LSP `textDocument/didClose`). */
    async didClose(file) {
        this.assertInitialized();
        this.assertOpen();
        await this.sendNotification("textDocument/didClose", {
            textDocument: { uri: pathToUri(file) },
        });
        this.diagnosticsMap.delete(normalizePath(file));
    }
    /**
     * Wait for the server's next `publishDiagnostics` for `file`
     * (after a `didOpen`), resolving with the current diagnostics
     * when they arrive or after `timeoutMs` (default: the request
     * timeout). This makes the diagnostics tool actually usable:
     * open the file, wait for the push, read the map.
     */
    awaitDiagnostics(file, timeoutMs) {
        this.assertInitialized();
        this.assertOpen();
        const key = normalizePath(file);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                const waiters = this.diagnosticsWaiters.get(key) ?? [];
                const idx = waiters.findIndex((w) => w.timer === timer);
                if (idx !== -1)
                    waiters.splice(idx, 1);
                if (waiters.length === 0)
                    this.diagnosticsWaiters.delete(key);
                resolve(this.diagnosticsMap.get(key) ?? []);
            }, timeoutMs ?? this.requestTimeoutMs);
            const waiters = this.diagnosticsWaiters.get(key) ?? [];
            waiters.push({
                resolve: () => resolve(this.diagnosticsMap.get(key) ?? []),
                timer,
            });
            this.diagnosticsWaiters.set(key, waiters);
        });
    }
    // --- internals ---
    assertOpen() {
        if (this._closed) {
            throw new Error("StdioLspClient: method called after close()");
        }
    }
    assertInitialized() {
        if (!this._initialized) {
            throw new Error("StdioLspClient: call initialize() first");
        }
    }
    sendRequest(method, params) {
        this.assertOpen();
        const id = this.nextId++;
        const msg = { jsonrpc: "2.0", id, method, params };
        return new Promise((resolve, reject) => {
            // Time out requests that the server never answers so the
            // agent's tool call cannot hang forever.
            const timer = setTimeout(() => {
                const pending = this.pending.get(id);
                if (!pending)
                    return;
                this.pending.delete(id);
                pending.reject(new Error(`LSP request timed out after ${this.requestTimeoutMs}ms: ${method}`));
            }, this.requestTimeoutMs);
            // Keep the timer alive with the pending entry so close()
            // can clear it.
            this.pending.set(id, {
                resolve,
                reject: (e) => {
                    clearTimeout(timer);
                    reject(e);
                },
            });
            this.writeMessage(msg);
        });
    }
    sendNotification(method, params) {
        this.assertOpen();
        const msg = { jsonrpc: "2.0", method, params };
        this.writeMessage(msg);
        return Promise.resolve();
    }
    writeMessage(msg) {
        const body = JSON.stringify(msg);
        const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
        this.process.stdin.write(header + body);
    }
    onData(chunk) {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        this.buffer = Buffer.concat([this.buffer, buf]);
        this.drainBuffer();
    }
    /**
     * Parse as many complete LSP messages as possible from
     * the buffer. Headers and bodies are removed as consumed;
     * the buffer keeps any partial message.
     */
    drainBuffer() {
        while (true) {
            // Find the end of the header section.
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1)
                return;
            const headerSection = this.buffer
                .subarray(0, headerEnd)
                .toString("utf8");
            const contentLength = parseContentLength(headerSection);
            if (contentLength === null) {
                this.log(`StdioLspClient: bad header: ${headerSection.slice(0, 80)}`);
                // Drop the bad header and try again.
                this.buffer = this.buffer.subarray(headerEnd + 4);
                continue;
            }
            const totalLength = headerEnd + 4 + contentLength;
            if (this.buffer.length < totalLength)
                return; // wait for more
            const body = this.buffer
                .subarray(headerEnd + 4, totalLength)
                .toString("utf8");
            this.buffer = this.buffer.subarray(totalLength);
            try {
                this.handleMessage(JSON.parse(body));
            }
            catch (e) {
                this.log(`StdioLspClient: parse error: ${e.message}`);
            }
        }
    }
    handleMessage(msg) {
        if ("id" in msg && ("result" in msg || "error" in msg)) {
            // It's a response to one of our requests.
            const response = msg;
            const pending = this.pending.get(response.id);
            if (!pending) {
                this.log(`StdioLspClient: response for unknown id ${response.id}`);
                return;
            }
            this.pending.delete(response.id);
            if (response.error) {
                pending.reject(new Error(`LSP error ${response.error.code}: ${response.error.message}`));
            }
            else {
                pending.resolve(response.result);
            }
            return;
        }
        if ("id" in msg && "method" in msg) {
            // It's a server-initiated request. We don't support
            // any in v0; reply with a `null` result (LSP convention
            // for "method unknown / not supported").
            this.writeMessage({
                jsonrpc: "2.0",
                id: msg.id,
                result: null,
            });
            this.log(`StdioLspClient: ignoring server request ${msg.method}`);
            return;
        }
        if ("method" in msg) {
            // It's a server-initiated notification.
            this.handleNotification(msg);
        }
    }
    handleNotification(msg) {
        if (msg.method === "textDocument/publishDiagnostics") {
            const params = msg.params;
            const file = normalizePath(uriToPath(params.uri));
            const diags = params.diagnostics.map((d) => ({
                file,
                line: d.range.start.line,
                column: d.range.start.character,
                endLine: d.range.end.line,
                endColumn: d.range.end.character,
                severity: severityFromInt(d.severity),
                message: d.message,
                ...(d.code !== undefined ? { code: d.code } : {}),
                ...(d.source !== undefined ? { source: d.source } : {}),
            }));
            if (diags.length === 0) {
                this.diagnosticsMap.delete(file);
            }
            else {
                this.diagnosticsMap.set(file, diags);
            }
            // Wake any awaitDiagnostics waiters for this file.
            const waiters = this.diagnosticsWaiters.get(file);
            if (waiters && waiters.length > 0) {
                const copy = [...waiters];
                this.diagnosticsWaiters.delete(file);
                for (const w of copy) {
                    clearTimeout(w.timer);
                    w.resolve();
                }
            }
            return;
        }
        // Other notifications (window/logMessage, $/progress,
        // etc.) are ignored in v0.
        this.log(`StdioLspClient: ignoring notification ${msg.method}`);
    }
}
/** Normalize a path for diagnostics-map keys (both sides). */
function normalizePath(p) {
    return path.normalize(p);
}
/** A coarse languageId from the file extension (LSP servers accept this). */
function languageIdFromPath(p) {
    const idx = p.lastIndexOf(".");
    if (idx === -1)
        return "plaintext";
    return p.slice(idx + 1);
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Convert a file path to a `file://` URI. The host should
 * pass absolute paths; relative paths are resolved against
 * the LSP root (we don't track that here, so we just
 * forward).
 */
function pathToUri(file) {
    if (file.startsWith("file://"))
        return file;
    // Encode each path segment so spaces / unicode work.
    const encoded = file
        .split("/")
        .map((seg, i) => (i === 0 && seg === "" ? "" : encodeURIComponent(seg)))
        .join("/");
    return `file://${encoded}`;
}
/** Inverse of `pathToUri`. */
function uriToPath(uri) {
    if (!uri.startsWith("file://"))
        return uri;
    const path = uri.slice("file://".length);
    return path.split("/").map(decodeURIComponent).join("/");
}
/** Parse a `Content-Length: N` header. Returns null on bad input. */
function parseContentLength(headerSection) {
    for (const line of headerSection.split("\r\n")) {
        const m = /^Content-Length:\s*(\d+)\s*$/i.exec(line);
        if (m)
            return Number(m[1]);
    }
    return null;
}
/**
 * LSP `definition` / `references` return `Location[] | Location | null`.
 * Normalize to a uniform `LspLocation[]`.
 */
function normalizeLocations(raw) {
    if (raw == null)
        return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr
        .map((loc) => loc)
        .map((loc) => {
        const file = uriToPath(loc.uri);
        const start = loc.range?.start ?? { line: 0, character: 0 };
        const end = loc.range?.end;
        return {
            file,
            line: start.line,
            column: start.character,
            ...(end
                ? { endLine: end.line, endColumn: end.character }
                : {}),
        };
    });
}
/** LSP severity is 1=Error, 2=Warning, 3=Info, 4=Hint. */
function severityFromInt(n) {
    switch (n) {
        case 1: return "error";
        case 2: return "warning";
        case 3: return "info";
        case 4: return "hint";
        default: return "warning";
    }
}
/** Extract the human-readable contents from an LSP hover result. */
function extractHoverContents(c) {
    if (typeof c === "string")
        return c;
    if (Array.isArray(c)) {
        return c.map((item) => extractHoverContents(item)).join("\n\n");
    }
    if (c && typeof c === "object") {
        const obj = c;
        if (typeof obj.value === "string")
            return obj.value;
    }
    return JSON.stringify(c);
}
//# sourceMappingURL=stdio-client.js.map