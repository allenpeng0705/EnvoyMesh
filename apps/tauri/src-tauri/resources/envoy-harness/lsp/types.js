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
export {};
//# sourceMappingURL=types.js.map