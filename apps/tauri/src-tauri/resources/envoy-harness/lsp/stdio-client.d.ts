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
import type { LspClient, LspDiagnostic, LspHover, LspLocation } from "./types.js";
/**
 * The minimum stdio surface a child process must expose
 * for `StdioLspClient` to talk to it.
 *
 * The host can pass `child.stdin` / `child.stdout` directly
 * (both implement `Writable` / `Readable`). For tests, a
 * `FakeStdio` pair implements this interface and lets the
 * test script the server's responses.
 */
export interface LspProcess {
    /** Writable stream to the server's stdin. */
    stdin: {
        write(chunk: string): void;
        end(): void;
    };
    /**
     * Readable stream from the server's stdout. The client
     * attaches a `data` listener; the host MUST NOT attach
     * one first (Node's EventEmitter would shadow the
     * listener).
     */
    stdout: {
        on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
        off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
    };
    /** Called by `close()` to terminate the child. */
    kill(signal?: string): void;
}
/** Options for `StdioLspClient`. */
export interface StdioLspClientOptions {
    /** The server process to talk to. */
    process: LspProcess;
    /**
     * The root URI of the workspace (e.g. `file:///home/user/proj`).
     * Sent in the `initialize` request.
     */
    rootUri: string;
    /**
     * Client capabilities (advertised in `initialize`). The
     * default advertises "we can receive diagnostics via
     * publishDiagnostics" and nothing else.
     */
    clientCapabilities?: Record<string, unknown>;
    /**
     * Optional logger for wire-level events (init, errors,
     * unexpected server messages). Off by default.
     */
    log?: (msg: string) => void;
    /**
     * Timeout for request/response round-trips, in ms.
     * Default: 15000. A server that never answers rejects
     * the pending request instead of hanging the tool call.
     */
    requestTimeoutMs?: number;
}
/**
 * The production `LspClient`. Talks JSON-RPC 2.0 over stdio
 * to a child process. See module doc for the full protocol
 * summary.
 */
export declare class StdioLspClient implements LspClient {
    private readonly process;
    private readonly rootUri;
    private readonly clientCapabilities;
    private readonly log;
    private readonly requestTimeoutMs;
    private nextId;
    private readonly pending;
    private readonly diagnosticsMap;
    /** Resolvers waiting for the next publishDiagnostics per file. */
    private readonly diagnosticsWaiters;
    private _initialized;
    /**
     * Set to `true` by `close()` once the shutdown/exit
     * dance is complete and the process is killed. New
     * requests throw via `assertOpen`. During the
     * shutdown/exit dance itself, `_closing` is true but
     * `_closed` is still false, so the in-flight
     * `sendRequest` / `sendNotification` calls don't hit
     * the `assertOpen` guard.
     */
    private _closing;
    private _closed;
    private readonly dataListener;
    private buffer;
    constructor(options: StdioLspClientOptions);
    /**
     * Send the `initialize` request + `initialized` notification.
     * Must be called once before any of the 4 ops. Returns the
     * server's capabilities (for future use; v0 ignores them).
     */
    initialize(): Promise<Record<string, unknown>>;
    close(): Promise<void>;
    definition(file: string, line: number, column: number): Promise<ReadonlyArray<LspLocation>>;
    references(file: string, line: number, column: number): Promise<ReadonlyArray<LspLocation>>;
    hover(file: string, line: number, column: number): Promise<LspHover | null>;
    diagnostics(file: string): Promise<ReadonlyArray<LspDiagnostic>>;
    /**
     * Open a document (LSP `textDocument/didOpen`). Servers
     * publish diagnostics for opened documents; without this,
     * `diagnostics()` is always empty for files the server has
     * never seen.
     */
    didOpen(file: string, text: string): Promise<void>;
    /** Close a document (LSP `textDocument/didClose`). */
    didClose(file: string): Promise<void>;
    /**
     * Wait for the server's next `publishDiagnostics` for `file`
     * (after a `didOpen`), resolving with the current diagnostics
     * when they arrive or after `timeoutMs` (default: the request
     * timeout). This makes the diagnostics tool actually usable:
     * open the file, wait for the push, read the map.
     */
    awaitDiagnostics(file: string, timeoutMs?: number): Promise<ReadonlyArray<LspDiagnostic>>;
    private assertOpen;
    private assertInitialized;
    private sendRequest;
    private sendNotification;
    private writeMessage;
    private onData;
    /**
     * Parse as many complete LSP messages as possible from
     * the buffer. Headers and bodies are removed as consumed;
     * the buffer keeps any partial message.
     */
    private drainBuffer;
    private handleMessage;
    private handleNotification;
}
//# sourceMappingURL=stdio-client.d.ts.map