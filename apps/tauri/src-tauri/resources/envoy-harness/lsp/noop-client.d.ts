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
import type { LspClient, LspDiagnostic, LspHover, LspLocation } from "./types.js";
/**
 * An `LspClient` that returns empty results. `close()`
 * is a no-op.
 */
export declare class NoopLspClient implements LspClient {
    definition(_file: string, _line: number, _column: number): Promise<ReadonlyArray<LspLocation>>;
    references(_file: string, _line: number, _column: number): Promise<ReadonlyArray<LspLocation>>;
    hover(_file: string, _line: number, _column: number): Promise<LspHover | null>;
    diagnostics(_file: string): Promise<ReadonlyArray<LspDiagnostic>>;
    didOpen(_file: string, _text: string): Promise<void>;
    didClose(_file: string): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=noop-client.d.ts.map