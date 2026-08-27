/**
 * NoopLspClient — an LspClient that returns empty results.
 *
 * **Why this exists:** the default `LspManager` (when the
 * host doesn't provide one) is a `NoopLspManager` that
 * returns this client for every file. The 4 LSP tools see
 * a real `LspClient` and behave normally; the model gets
 * `{ locations: [] }` (or similar) and decides what to do
 * without any "LSP not configured" special case.
 *
 * **Why a class and not `const noop: LspClient = {...}`:**
 * the class can be subclassed in tests (e.g. to override
 * a single method), and it satisfies the `LspClient` shape
 * without depending on the implementation details.
 *
 * **Stability:** the public surface is `NoopLspClient`
 * (class). Additive; methods match `LspClient`.
 */
/**
 * An `LspClient` that returns empty results. `close()`
 * is a no-op.
 */
export class NoopLspClient {
    async definition(_file, _line, _column) {
        return [];
    }
    async references(_file, _line, _column) {
        return [];
    }
    async hover(_file, _line, _column) {
        return null;
    }
    async diagnostics(_file) {
        return [];
    }
    async didOpen(_file, _text) {
        // no-op
    }
    async didClose(_file) {
        // no-op
    }
    async close() {
        // no-op
    }
}
//# sourceMappingURL=noop-client.js.map