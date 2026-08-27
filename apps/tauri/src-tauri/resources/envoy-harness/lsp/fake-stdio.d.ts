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
import type { LspProcess } from "./stdio-client.js";
/**
 * A scripted-by-test `LspProcess`. Constructor wires
 * the pair; tests feed via `feedFromServer` and inspect
 * `writesToServer`.
 */
export declare class FakeStdio implements LspProcess {
    /** Each entry is a UTF-8 string the client wrote. */
    readonly writesToServer: string[];
    /** Kill signal calls; each entry is the signal (or undefined). */
    readonly killCalls: (string | undefined)[];
    /** Whether `stdin.end()` was called. */
    stdinEnded: boolean;
    private readonly listeners;
    private _stdinOpen;
    stdin: {
        write: (chunk: string) => void;
        end: () => void;
    };
    stdout: {
        on: (_event: "data", listener: (chunk: Buffer | string) => void) => void;
        off: (_event: "data", listener: (chunk: Buffer | string) => void) => void;
    };
    kill(signal?: string): void;
    /** Push a chunk from the "server" to the client. */
    feedFromServer(chunk: string | Buffer): void;
    /** Get all messages the client wrote, as parsed JSON. */
    get messagesToServer(): unknown[];
    /**
     * Convenience: write a single message to the client as
     * if it came from the server. Takes care of
     * Content-Length framing.
     */
    sendFromServer(message: unknown): void;
}
/**
 * Frame a JSON-RPC message per the LSP spec:
 * `Content-Length: N\r\n\r\n<body>`.
 */
export declare function frameLspMessage(message: unknown): string;
//# sourceMappingURL=fake-stdio.d.ts.map