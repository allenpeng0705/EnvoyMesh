/**
 * MCP (Model Context Protocol) — types and
 * constants.
 *
 * **Design:** §11 (MCP), invariant #4 (#8) —
 * MCP is bidirectional. envoy-harness is both
 * an MCP client (consumes other people's
 * servers; their tools appear as `mcp__*`
 * tools) and an MCP server (its tools are
 * exposed to other MCP clients).
 *
 * **v0 scope (T3.3):** this file ships the
 * **type seam** only. The stdio JSON-RPC
 * transport (the actual protocol
 * implementation) lands in a follow-up
 * sub-chunk. Today the registry is empty by
 * default; the host injects a pre-populated
 * registry via `AgentOptions.mcpClients` (or
 * the future T3.3.1 will populate it from the
 * `mcp_servers` TOML config block).
 *
 * **Why ship the seam first:** the registry is
 * the public surface. Once the types are on
 * disk, the host (REPL, Tauri, mesh) can wire
 * MCP server configs without waiting for the
 * transport. The transport then drops in as a
 * back-end detail (the interface doesn't
 * change).
 *
 * **Why an interface, not a class:** a real MCP
 * client owns a child process (or HTTP
 * connection) and a JSON-RPC state machine. The
 * shape varies by transport. v0 ships the
 * interface; the impl lands per-transport.
 */
import type { z } from "zod";
/**
 * One MCP tool, as exposed by a connected MCP
 * server. The name is `mcp__<server>__<tool>` in
 * the model's tool list; the args are passed
 * through to the server's `tools/call`.
 */
export interface McpTool {
    /** The bare tool name (without the `mcp__<server>__` prefix). */
    name: string;
    /** Human-readable description for the model's tool list. */
    description: string;
    /** JSON Schema for the tool's input, as a zod schema. */
    inputSchema: z.ZodTypeAny;
}
/**
 * One MCP client connection (to one MCP server).
 * The connection owns its transport (stdio child
 * process, HTTP+SSE, etc.) and a JSON-RPC state
 * machine.
 *
 * **Lifecycle:** `connect()` establishes the
 * transport and runs the `initialize` handshake.
 * `listTools()` calls `tools/list`. `callTool()`
 * calls `tools/call`. `close()` releases the
 * transport.
 */
/** Optional callbacks for an in-flight `tools/call`. */
export interface McpCallToolOptions {
    /** MCP `notifications/progress` / `notifications/message` text. */
    onProgress?: (text: string) => void;
}
export interface McpClient {
    /** The server's display name (matches the config key in TOML). */
    readonly serverName: string;
    /** The tools the server exposes. Populated by `listTools()`. */
    listTools(): Promise<ReadonlyArray<McpTool>>;
    /**
     * Call a tool by its bare name (not the
     * `mcp__<server>__` prefix). Returns the
     * server's `content` array (text or image
     * blocks, per the MCP spec).
     */
    callTool(name: string, args: unknown, options?: McpCallToolOptions): Promise<McpCallToolResult>;
    /** Release the transport. Idempotent. */
    close(): Promise<void>;
}
/** The result of `tools/call`. Mirrors the MCP spec. */
export interface McpCallToolResult {
    /** The server's content blocks (text or image). */
    content: ReadonlyArray<{
        type: "text";
        text: string;
    } | {
        type: "image";
        data: string;
        mimeType: string;
    } | {
        type: "resource";
        uri: string;
        text?: string;
    }>;
    /** If true, the tool call failed (per the MCP spec). */
    isError?: boolean;
}
/**
 * The registry that owns all live MCP client
 * connections for one `Agent` instance. Long-lived
 * (one per agent); the underlying connections
 * outlive a single agent turn.
 *
 * **Why a class, not a plain `Map`:** the
 * registry owns the lifecycle (open on
 * `register`, close on `closeAll`). A bare map
 * would leak child processes.
 */
export interface McpClientRegistry {
    /** Register a client. The registry owns it from now on. */
    register(client: McpClient): void;
    /** Unregister + close a client by server name. */
    unregister(serverName: string): Promise<void>;
    /** Get a client by server name. */
    get(serverName: string): McpClient | undefined;
    /** List all registered server names. */
    list(): ReadonlyArray<string>;
    /**
     * Collect every tool from every registered
     * client, prefixed with `mcp__<server>__`.
     * Called by the agent loop to build the
     * `ModelAdapter.complete({ tools })` payload.
     */
    collectTools(): Promise<ReadonlyArray<McpTool & {
        readonly serverName: string;
    }>>;
    /** Close all clients. Idempotent. */
    closeAll(): Promise<void>;
}
/**
 * The prefix added to MCP tool names in the
 * model's tool list. `mcp__<server>__<tool>` is
 * the convention codex / claw-code use; we
 * match it so the model doesn't have to learn
 * a new convention.
 */
export declare const MCP_TOOL_PREFIX = "mcp__";
/**
 * Build the namespaced tool name that the
 * model sees in its tool list.
 *
 * ```ts
 * mcpToolName("github", "create_issue")
 * // => "mcp__github__create_issue"
 * ```
 */
export declare function mcpToolName(serverName: string, toolName: string): string;
/**
 * Parse a model-side tool name back into
 * `(serverName, toolName)`. Returns `null` for
 * non-MCP tool names (so the agent can route
 * non-MCP calls to its own tool registry).
 */
export declare function parseMcpToolName(fullName: string): {
    serverName: string;
    toolName: string;
} | null;
//# sourceMappingURL=types.d.ts.map