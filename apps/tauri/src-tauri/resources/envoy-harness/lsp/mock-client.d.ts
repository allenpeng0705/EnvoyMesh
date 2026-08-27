/**
 * MockLspClient — a scriptable `LspClient` for tests.
 *
 * **Why this exists:** the 4 LSP tools need an `LspClient`
 * to test against, but `StdioLspClient` requires a real
 * language server (slow, flaky, hard to script). `MockLspClient`
 * accepts pre-configured response tables and an optional
 * per-call recorder so tests can assert on what the tools
 * asked for.
 *
 * **Three response tables, one per op:**
 * - `definitions` — keyed by `${file}:${line}:${column}`.
 * - `references` — same key.
 * - `hovers` — same key, value is `LspHover | null`.
 * - `diagnostics` — keyed by file (no position; diagnostics
 *   cover a range).
 *
 * Unmatched keys → empty array / null (silent no-op).
 *
 * **`calls` recorder:** every method call appends a record
 * `{ op, file, line, column }` so tests can assert on
 * "the tool called hover with these args". `calls` is
 * append-only; clear with `clearCalls()`.
 *
 * **Stability:** the public surface is `MockLspClient`
 * (class) + `MockLspResponseTable` (type). Additive.
 */
import type { LspClient, LspDiagnostic, LspHover, LspLocation } from "./types.js";
/** The position key for `definition` / `references` / `hover`. */
type PosKey = string;
/** A recorded call: which op, with which args. */
export interface MockLspCall {
    op: "definition" | "references" | "hover" | "diagnostics" | "didOpen" | "didClose";
    file: string;
    line?: number;
    column?: number;
}
/** Response tables: keyed by file/position. */
export interface MockLspResponseTable {
    /** Keyed by `${file}:${line}:${column}` → locations. */
    definitions?: Map<PosKey, ReadonlyArray<LspLocation>>;
    /** Keyed by `${file}:${line}:${column}` → locations. */
    references?: Map<PosKey, ReadonlyArray<LspLocation>>;
    /** Keyed by `${file}:${line}:${column}` → hover (or null). */
    hovers?: Map<PosKey, LspHover | null>;
    /** Keyed by `file` → diagnostics. */
    diagnostics?: Map<string, ReadonlyArray<LspDiagnostic>>;
}
/**
 * A scriptable `LspClient`. Construct with a response table;
 * call any method; the response table is consulted by key.
 */
export declare class MockLspClient implements LspClient {
    private readonly responses;
    private readonly _calls;
    private _closed;
    constructor(responses?: MockLspResponseTable);
    definition(file: string, line: number, column: number): Promise<ReadonlyArray<LspLocation>>;
    references(file: string, line: number, column: number): Promise<ReadonlyArray<LspLocation>>;
    hover(file: string, line: number, column: number): Promise<LspHover | null>;
    diagnostics(file: string): Promise<ReadonlyArray<LspDiagnostic>>;
    awaitDiagnostics(file: string): Promise<ReadonlyArray<LspDiagnostic>>;
    didOpen(file: string, _text: string): Promise<void>;
    didClose(file: string): Promise<void>;
    close(): Promise<void>;
    /** All recorded calls. Append-only. */
    get calls(): ReadonlyArray<MockLspCall>;
    /** Clear the calls list. Useful when re-using a client. */
    clearCalls(): void;
    private assertOpen;
}
export {};
//# sourceMappingURL=mock-client.d.ts.map