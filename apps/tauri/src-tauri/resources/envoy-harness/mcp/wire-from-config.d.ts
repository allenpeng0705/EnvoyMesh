/**
 * Spawn stdio MCP servers from config and register bridge tools.
 */
import type { ConfigLayer } from "../config/schema.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { McpClientRegistry } from "./types.js";
export interface WiredMcpClients {
    registry: McpClientRegistry;
    dispose: () => Promise<void>;
}
/**
 * Connect every configured MCP server, register tools on `tools`,
 * and return a registry the Agent should own via `mcpClients`.
 */
export declare function wireMcpClientsFromConfig(servers: ConfigLayer["mcpServers"], tools: ToolRegistry): Promise<WiredMcpClients | undefined>;
//# sourceMappingURL=wire-from-config.d.ts.map