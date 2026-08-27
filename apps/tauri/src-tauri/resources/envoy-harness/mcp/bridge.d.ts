/**
 * Phase G — MCP tool bridge: connect MCP servers to envoy's model-facing
 * tools.
 *
 * Every tool from every registered MCP client becomes an envoy `Tool`
 * named `mcp__<server>__<rawName>` (the same server-qualified convention
 * Codex, Claude Code, and deepseek's `dsh-mcp-client` use), so the whole
 * MCP ecosystem — not just one harness — is reusable through envoy's
 * existing tool registry, hooks, permissions, and sandbox.
 *
 * `registerMcpTools` is additive: it registers the bridge tools and
 * returns `{ registered, catalog }` for the host's bookkeeping / prompt
 * catalog. Call it after the registry is populated (or re-call to
 * re-sync after a server's tool list changes).
 */
import type { Tool } from "../tools/types.js";
import { type McpCallToolResult, type McpClientRegistry } from "./types.js";
export interface McpToolBridgeResult {
    /** Number of MCP tools registered as envoy tools. */
    registered: number;
    /** Sorted `mcp__<server>__<tool>` names (one per line) for catalogs. */
    catalog: string;
    /** Servers whose tool list could not be read (others still registered). */
    errors: ReadonlyArray<{
        server: string;
        error: string;
    }>;
}
/** Render an MCP `tools/call` result as text for the model. */
export declare function formatMcpResult(result: McpCallToolResult): string;
/**
 * Register every MCP tool from every registered client into an envoy
 * tool registry. Duplicate server names (or duplicate tool names within a
 * server) throw via the registry's own duplicate checks.
 */
export declare function registerMcpTools(tools: {
    register(tool: Tool): unknown;
}, registry: McpClientRegistry): Promise<McpToolBridgeResult>;
//# sourceMappingURL=bridge.d.ts.map