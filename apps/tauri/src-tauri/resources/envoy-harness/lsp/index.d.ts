/**
 * LSP public API (F9.2, §22 of the design).
 *
 * **What this module exports:** the LSP types + the test /
 * default implementations. The 4 LSP tools and the
 * `AgentOptions.lspManager` integration land in F9.2.3
 * (follow-up commit).
 *
 * **Exports:**
 * - Types: `LspClient`, `LspManager`, `LspLocation`,
 *   `LspHover`, `LspDiagnostic`.
 * - Implementations: `NoopLspClient` (default),
 *   `MockLspClient` (tests), `StaticLspManager`
 *   (production wiring).
 * - `StdioLspClient` (F9.2.2) is exported when added.
 *
 * **Stability:** the public surface is the union of the
 * above. Additive; new ops on `LspClient` are major version.
 */
export type { LspClient, LspManager, LspLocation, LspHover, LspDiagnostic, } from "./types.js";
export { NoopLspClient } from "./noop-client.js";
export { MockLspClient, type MockLspCall, type MockLspResponseTable, } from "./mock-client.js";
export { StaticLspManager, type LspClientMap, } from "./static-manager.js";
export { StdioLspClient, type LspProcess, type StdioLspClientOptions, } from "./stdio-client.js";
export { FakeStdio, frameLspMessage } from "./fake-stdio.js";
export { makeLspTools } from "./tools.js";
//# sourceMappingURL=index.d.ts.map