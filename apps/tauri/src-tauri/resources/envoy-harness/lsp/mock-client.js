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
const posKey = (file, line, column) => `${file}:${line}:${column}`;
/**
 * A scriptable `LspClient`. Construct with a response table;
 * call any method; the response table is consulted by key.
 */
export class MockLspClient {
    responses;
    _calls = [];
    _closed = false;
    constructor(responses = {}) {
        this.responses = {
            definitions: responses.definitions ?? new Map(),
            references: responses.references ?? new Map(),
            hovers: responses.hovers ?? new Map(),
            diagnostics: responses.diagnostics ?? new Map(),
        };
    }
    async definition(file, line, column) {
        this.assertOpen();
        this._calls.push({ op: "definition", file, line, column });
        return this.responses.definitions.get(posKey(file, line, column)) ?? [];
    }
    async references(file, line, column) {
        this.assertOpen();
        this._calls.push({ op: "references", file, line, column });
        return this.responses.references.get(posKey(file, line, column)) ?? [];
    }
    async hover(file, line, column) {
        this.assertOpen();
        this._calls.push({ op: "hover", file, line, column });
        return this.responses.hovers.get(posKey(file, line, column)) ?? null;
    }
    async diagnostics(file) {
        this.assertOpen();
        this._calls.push({ op: "diagnostics", file });
        return this.responses.diagnostics.get(file) ?? [];
    }
    async awaitDiagnostics(file) {
        return this.diagnostics(file);
    }
    async didOpen(file, _text) {
        this.assertOpen();
        this._calls.push({ op: "didOpen", file });
    }
    async didClose(file) {
        this.assertOpen();
        this._calls.push({ op: "didClose", file });
    }
    async close() {
        this._closed = true;
    }
    // --- test helpers ---
    /** All recorded calls. Append-only. */
    get calls() {
        return this._calls;
    }
    /** Clear the calls list. Useful when re-using a client. */
    clearCalls() {
        this._calls.length = 0;
    }
    assertOpen() {
        if (this._closed) {
            throw new Error("MockLspClient: method called after close()");
        }
    }
}
//# sourceMappingURL=mock-client.js.map