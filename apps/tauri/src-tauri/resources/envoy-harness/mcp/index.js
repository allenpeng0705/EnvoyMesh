/**
 * MCP (Model Context Protocol) — public API.
 *
 * **T3.3 + T3.3.1 scope:** the type seam + a default
 * registry + the stdio transport (`StdioMcpClient`).
 *
 * Re-exports the types, the helpers, and the
 * default registry.
 */
export { MCP_TOOL_PREFIX, mcpToolName, parseMcpToolName, } from "./types.js";
export { DefaultMcpClientRegistry } from "./registry.js";
export { jsonSchemaToZod, MCP_PROTOCOL_VERSION, StdioMcpClient, } from "./stdio-client.js";
export { formatMcpResult, registerMcpTools, } from "./bridge.js";
export { wireMcpClientsFromConfig, } from "./wire-from-config.js";
export { runStdioMcpServer, MCP_SERVER_PROTOCOL_VERSION, } from "./stdio-server.js";
//# sourceMappingURL=index.js.map