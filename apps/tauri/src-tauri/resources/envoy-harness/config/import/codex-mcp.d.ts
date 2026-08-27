/**
 * Codex / envoy `mcp_servers` table parser → `ConfigLayer.mcpServers`.
 */
import type { ConfigLayer } from "../schema.js";
type McpServerConfig = NonNullable<ConfigLayer["mcpServers"]>[number];
/**
 * Accept codex array tables (`[[mcp_servers]]`) or map form
 * (`[mcp_servers.github]`).
 */
export declare function parseCodexMcpServers(raw: unknown, sourcePath: string): McpServerConfig[];
export {};
//# sourceMappingURL=codex-mcp.d.ts.map