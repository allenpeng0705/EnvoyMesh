/**
 * Spawn stdio MCP servers from config and register bridge tools.
 */
import { spawn } from "node:child_process";
import { registerMcpTools } from "./bridge.js";
import { DefaultMcpClientRegistry } from "./registry.js";
import { StdioMcpClient } from "./stdio-client.js";
function childToStdioProcess(child) {
    const stdin = child.stdin;
    const stdout = child.stdout;
    if (stdin === null || stdout === null) {
        throw new Error("MCP child process missing stdin/stdout pipes");
    }
    return {
        stdin,
        stdout,
        kill(signal) {
            child.kill(signal);
        },
    };
}
/**
 * Connect every configured MCP server, register tools on `tools`,
 * and return a registry the Agent should own via `mcpClients`.
 */
export async function wireMcpClientsFromConfig(servers, tools) {
    if (servers === undefined || servers.length === 0) {
        return undefined;
    }
    const registry = new DefaultMcpClientRegistry();
    for (const spec of servers) {
        try {
            const child = spawn(spec.command, spec.args ?? [], {
                env: { ...process.env, ...(spec.env ?? {}) },
                stdio: ["pipe", "pipe", "pipe"],
            });
            const client = new StdioMcpClient({
                serverName: spec.name,
                process: childToStdioProcess(child),
            });
            await client.connect();
            registry.register(client);
        }
        catch (err) {
            // Per-server isolation: one bad server must not block others.
            console.warn(`envoy-harness: MCP server "${spec.name}" failed to start: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (registry.list().length === 0) {
        await registry.closeAll();
        return undefined;
    }
    const bridge = await registerMcpTools(tools, registry);
    for (const err of bridge.errors) {
        console.warn(`envoy-harness: MCP server "${err.server}" listTools failed: ${err.error}`);
    }
    return {
        registry,
        dispose: () => registry.closeAll(),
    };
}
//# sourceMappingURL=wire-from-config.js.map