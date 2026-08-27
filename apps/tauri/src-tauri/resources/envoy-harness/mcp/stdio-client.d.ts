/**
 * MCP stdio transport (T3.3.1) — `StdioMcpClient`.
 *
 * **What this is:** the concrete `McpClient` implementation
 * that talks to a real MCP server over stdio (JSON-RPC 2.0 +
 * `Content-Length` framing — the same framing the LSP client
 * uses). The host spawns the server (e.g.
 * `npx -y @modelcontextprotocol/server-github`) and hands the
 * streams in.
 *
 * **Protocol surface:**
 * - `initialize` handshake (protocolVersion + capabilities)
 * - `tools/list` → `McpTool[]` (JSON Schema converted to zod
 *   via `jsonSchemaToZod`)
 * - `tools/call` → `McpCallToolResult`
 * - `close` → `shutdown` + `exit` + kill
 *
 * **Request timeout:** each request/response round-trip has a
 * timeout (default 10s) so a hung server can't block the agent
 * turn forever.
 *
 * **Why JSON Schema → zod:** the `Tool` interface used for the
 * model's tool list requires a zod `parameters` schema. The MCP
 * server sends JSON Schema; `jsonSchemaToZod` converts the
 * common shapes (object/string/number/boolean/array/enum) and
 * falls back to `z.unknown()` for anything else.
 */
import { z } from "zod";
import type { McpCallToolOptions, McpCallToolResult, McpClient, McpTool } from "./types.js";
/** The minimum child-process surface `StdioMcpClient` needs. */
export interface McpStdioProcess {
    stdin: {
        write(chunk: string): void;
        end(): void;
    };
    stdout: {
        on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
        off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
    };
    kill(signal?: string): void;
}
/** Options for `StdioMcpClient`. */
export interface StdioMcpClientOptions {
    /** The server's display name (the registry key). */
    serverName: string;
    /** The child process streams. */
    process: McpStdioProcess;
    /** Request timeout in ms. Default 10_000. */
    requestTimeoutMs?: number;
    /** Optional wire logger. */
    log?: (msg: string) => void;
}
/** The MCP protocol version we advertise. */
export declare const MCP_PROTOCOL_VERSION = "2024-11-05";
/**
 * A `McpClient` that speaks JSON-RPC 2.0 over stdio.
 * The connection owns the child process; `close()` releases it.
 */
export declare class StdioMcpClient implements McpClient {
    readonly serverName: string;
    private readonly process;
    private readonly requestTimeoutMs;
    private readonly log;
    private nextId;
    private readonly pending;
    private buffer;
    private _initialized;
    private _closed;
    private progressListener;
    private readonly dataListener;
    constructor(options: StdioMcpClientOptions);
    /** Run the `initialize` handshake. Must be called once. */
    connect(): Promise<void>;
    listTools(): Promise<ReadonlyArray<McpTool>>;
    callTool(name: string, args: unknown, options?: McpCallToolOptions): Promise<McpCallToolResult>;
    close(): Promise<void>;
    private assertOpen;
    private assertInitialized;
    private sendRequest;
    /** Write a JSON-RPC notification (no id, no response expected). */
    private sendNotification;
    private onData;
    private drain;
    private handleMessage;
    private handleNotification;
}
/**
 * Convert a JSON Schema (from `tools/list`) into a zod schema
 * for the model's tool definitions. Handles the common MCP
 * shapes; anything unrecognized falls back to `z.unknown()` so
 * the tool list never breaks on an exotic schema.
 */
export declare function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny;
//# sourceMappingURL=stdio-client.d.ts.map