/**
 * LSP tools — 4 tools that wrap the `LspManager`.
 *
 * **Design doc:** `docs/design.md` §22 (F9.2 Phase 4 feature).
 *
 * **What this module is:** the tool surface for the LSP
 * integration. The 4 tools (`lsp_definition`,
 * `lsp_references`, `lsp_hover`, `lsp_diagnostics`) are
 * registered with the `ToolRegistry` only when the host
 * provides an `LspManager` (via `AgentOptions.lspManager`).
 * No manager → no tools (the model's tool list doesn't
 * mention LSP at all).
 *
 * **Line / column convention:** LSP is 0-indexed; the
 * model sees 0-indexed in the tool args. Tool descriptions
 * say "0-indexed" explicitly so the model doesn't
 * subtract 1.
 *
 * **Error handling:** all 4 tools catch errors from the
 * `LspClient` (server crash, timeout) and return
 * `{ content: { error: "..." }, isError: true }`. The
 * model can recover. "No client for this file" returns
 * the same shape (not a throw) so the model can route
 * around it.
 *
 * **Stability:** the 4 tools are the public surface.
 * Additive; new fields on the params / content are
 * additive. Removing a tool is a major version.
 */
import type { LspManager } from "./types.js";
import type { Tool } from "../tools/types.js";
/** The 4 LSP tools, in registration order. */
export declare function makeLspTools(manager: LspManager): Tool[];
//# sourceMappingURL=tools.d.ts.map