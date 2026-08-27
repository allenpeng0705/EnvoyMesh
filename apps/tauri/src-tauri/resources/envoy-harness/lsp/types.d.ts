/**
 * LSP types (§22 of the design — F9.2 Phase 4 feature).
 *
 * **What is this module?** the public type surface for the
 * LSP integration. The agent gains 4 navigation tools
 * (`lsp_definition`, `lsp_references`, `lsp_hover`,
 * `lsp_diagnostics`) by wrapping an `LspClient` per file.
 *
 * **Why types-only here:** the implementations live in
 * sibling files (`noop-client.ts`, `mock-client.ts`,
 * `stdio-client.ts`, `static-manager.ts`). The types are
 * the wire contract; the implementations are interchangeable.
 *
 * **What this is NOT:**
 * - Not a full LSP protocol library. The full protocol
 *   (request cancellation, server-initiated requests that
 *   need a reply, workspace symbols, formatting, code
 *   actions, ...) is out of scope for v0. We expose 4 ops.
 * - Not a server-spawner. The host (Tauri, the CLI, a
 *   test) provides an `LspManager`; the harness consumes.
 *   F9.2+1 adds auto-spawn.
 *
 * **Stability:** additive. New ops on `LspClient` are
 * additive; new fields on `LspLocation` / `LspHover` /
 * `LspDiagnostic` are additive. Removing any is a major
 * version bump.
 *
 * **Line / column convention:** LSP uses 0-indexed lines
 * and columns; we mirror that. The model sees 1-indexed
 * line numbers in tool results; the tool args accept
 * 0-indexed numbers (LSP convention) and the tool
 * description tells the model this.
 */
/** A source location returned by `definition` / `references`. */
export interface LspLocation {
    /** Absolute path to the file. */
    file: string;
    /** 0-indexed line. */
    line: number;
    /** 0-indexed column. */
    column: number;
    /** 0-indexed end line (optional; some servers omit). */
    endLine?: number;
    /** 0-indexed end column (optional; some servers omit). */
    endColumn?: number;
}
/** A hover response (the symbol's type / docs). */
export interface LspHover {
    /** The human-readable contents (markdown / plain text). */
    contents: string;
    /** The file the symbol is in. */
    file: string;
    /** 0-indexed line. */
    line: number;
    /** 0-indexed column. */
    column: number;
}
/** A diagnostic (error / warning / info / hint). */
export interface LspDiagnostic {
    /** The file the diagnostic is for. */
    file: string;
    /** 0-indexed start line. */
    line: number;
    /** 0-indexed start column. */
    column: number;
    /** 0-indexed end line (optional). */
    endLine?: number;
    /** 0-indexed end column (optional). */
    endColumn?: number;
    severity: "error" | "warning" | "info" | "hint";
    /** Human-readable message. */
    message: string;
    /** Optional error / warning code from the server. */
    code?: string | number;
    /** Optional source (e.g. "ts", "eslint"). */
    source?: string;
}
/**
 * An LSP client. One per language server. The host provides
 * an `LspManager` that routes files to the right client.
 *
 * **v0 ops:** `definition`, `references`, `hover`, `diagnostics`,
 * plus `close` for cleanup. Future ops (document symbols,
 * formatting, code actions) are additive.
 *
 * **Error handling:** the methods throw on transport errors
 * (server crash, timeout). The 4 tools catch and convert to
 * `{ error: ... }` tool results so the model can recover.
 */
export interface LspClient {
    /** Go to definition. Returns 0+ locations. */
    definition(file: string, line: number, column: number): Promise<ReadonlyArray<LspLocation>>;
    /** Find all references (including declaration). */
    references(file: string, line: number, column: number): Promise<ReadonlyArray<LspLocation>>;
    /** Get hover info for the symbol at the position. Null if no hover. */
    hover(file: string, line: number, column: number): Promise<LspHover | null>;
    /** Get all current diagnostics for a file. */
    diagnostics(file: string): Promise<ReadonlyArray<LspDiagnostic>>;
    /**
     * Optional: wait for the server's next `publishDiagnostics`
     * for `file` (useful right after `didOpen`). When absent,
     * callers fall back to `diagnostics()`.
     */
    awaitDiagnostics?(file: string, timeoutMs?: number): Promise<ReadonlyArray<LspDiagnostic>>;
    /**
     * Open a document in the server (LSP `textDocument/didOpen`).
     * Servers publish diagnostics for opened documents; without
     * this, `diagnostics()` would always return [] for files the
     * server has never seen.
     */
    didOpen(file: string, text: string): Promise<void>;
    /** Close a document in the server (LSP `textDocument/didClose`). */
    didClose(file: string): Promise<void>;
    /** Release server resources. After `close`, all methods throw. */
    close(): Promise<void>;
}
/**
 * An LSP manager routes a file to the right `LspClient`.
 *
 * **Why an interface, not a class:** the host (Tauri, the
 * CLI, a test) decides how to map files to clients. The
 * simplest impl is `StaticLspManager` (a pre-configured
 * extension → client map). A future impl might auto-spawn
 * `typescript-language-server` on first use of a `.ts` file.
 */
export interface LspManager {
    /**
     * The `LspClient` for `file`, or null if no client is
     * available for that file's language. The 4 tools treat
     * null as "LSP not configured for this file" and return
     * a structured error.
     */
    forFile(file: string): LspClient | null;
    /**
     * F17.2.5: list the (language, rootUri) pairs for every
     * configured server. Used by `/lsp` to print the active
     * servers. Returns an empty array when no servers are
     * configured.
     */
    listServers(): ReadonlyArray<{
        language: string;
        rootUri: string;
    }>;
    /** Close all clients. Called when the agent finishes. */
    closeAll(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map