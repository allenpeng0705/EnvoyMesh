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
import { mcpToolName, } from "./types.js";
/** Render an MCP `tools/call` result as text for the model. */
export function formatMcpResult(result) {
    const parts = result.content.map((block) => {
        switch (block.type) {
            case "text":
                return block.text;
            case "image":
                return `[image ${block.mimeType} (${block.data.length} bytes base64)]`;
            case "resource":
                return block.text ?? `[resource ${block.uri}]`;
        }
    });
    return parts.join("\n");
}
/**
 * Register every MCP tool from every registered client into an envoy
 * tool registry. Duplicate server names (or duplicate tool names within a
 * server) throw via the registry's own duplicate checks.
 */
export async function registerMcpTools(tools, registry) {
    let registered = 0;
    const catalog = [];
    const errors = [];
    for (const serverName of registry.list()) {
        const client = registry.get(serverName);
        if (client === undefined)
            continue;
        let mcpTools;
        try {
            mcpTools = await client.listTools();
        }
        catch (err) {
            // Per-server isolation: a down/unresponsive server must not
            // prevent the other servers' tools from registering.
            errors.push({
                server: serverName,
                error: err instanceof Error ? err.message : String(err),
            });
            continue;
        }
        for (const tool of mcpTools) {
            const fullName = mcpToolName(serverName, tool.name);
            tools.register({
                name: fullName,
                description: tool.description,
                parameters: tool.inputSchema,
                async execute(args) {
                    try {
                        const result = await client.callTool(tool.name, args);
                        return { content: formatMcpResult(result) };
                    }
                    catch (err) {
                        return {
                            content: `mcp error (${fullName}): ${err instanceof Error ? err.message : String(err)}`,
                            isError: true,
                        };
                    }
                },
            });
            registered++;
            catalog.push(fullName);
        }
    }
    return { registered, catalog: catalog.sort().join("\n"), errors };
}
//# sourceMappingURL=bridge.js.map