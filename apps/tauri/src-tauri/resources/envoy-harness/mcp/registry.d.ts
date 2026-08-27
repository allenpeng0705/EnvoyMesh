/**
 * The default `McpClientRegistry` implementation.
 *
 * v0: a thin wrapper over a `Map` + a
 * `closeAll()` that fans out to every client.
 * The transport (stdio child process + JSON-RPC
 * state machine) lands in a follow-up sub-chunk;
 * today the host injects pre-built `McpClient`
 * instances.
 *
 * **Why a class:** the registry owns the
 * lifecycle. A bare `Map<string, McpClient>`
 * would leak the child processes when the
 * agent is destroyed. `closeAll()` is the
 * single chokepoint.
 */
import type { McpClient, McpClientRegistry, McpTool } from "./types.js";
export declare class DefaultMcpClientRegistry implements McpClientRegistry {
    private readonly clients;
    register(client: McpClient): void;
    unregister(serverName: string): Promise<void>;
    get(serverName: string): McpClient | undefined;
    list(): ReadonlyArray<string>;
    /**
     * Collect every tool from every client. The
     * tool name in the returned list is the bare
     * name (the agent prepends `mcp__<server>__`
     * when registering with the model). We return
     * the serverName alongside so the caller can
     * build the namespaced name.
     */
    collectTools(): Promise<ReadonlyArray<McpTool & {
        readonly serverName: string;
    }>>;
    closeAll(): Promise<void>;
}
//# sourceMappingURL=registry.d.ts.map