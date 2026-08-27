/**
 * MCP stdio server — expose envoy-harness tools to external MCP clients.
 *
 * Speaks JSON-RPC 2.0 + Content-Length framing (same as `StdioMcpClient`).
 * Implements `initialize`, `tools/list`, and `tools/call` against a
 * {@link ToolRegistry}.
 */
import type { Readable, Writable } from "node:stream";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
export declare const MCP_SERVER_PROTOCOL_VERSION = "2024-11-05";
export interface StdioMcpServerOptions {
    tools: ToolRegistry;
    /** Tool execution context (cwd + abort). */
    toolContext: Omit<ToolContext, "session"> & {
        session?: ToolContext["session"];
    };
    input?: Readable;
    output?: Writable;
    serverInfo?: {
        name: string;
        version: string;
    };
}
/** Run the MCP server until the input stream ends. */
export declare function runStdioMcpServer(options: StdioMcpServerOptions): Promise<void>;
//# sourceMappingURL=stdio-server.d.ts.map