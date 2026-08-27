/**
 * The prefix added to MCP tool names in the
 * model's tool list. `mcp__<server>__<tool>` is
 * the convention codex / claw-code use; we
 * match it so the model doesn't have to learn
 * a new convention.
 */
export const MCP_TOOL_PREFIX = "mcp__";
/**
 * Build the namespaced tool name that the
 * model sees in its tool list.
 *
 * ```ts
 * mcpToolName("github", "create_issue")
 * // => "mcp__github__create_issue"
 * ```
 */
export function mcpToolName(serverName, toolName) {
    return `${MCP_TOOL_PREFIX}${serverName}__${toolName}`;
}
/**
 * Parse a model-side tool name back into
 * `(serverName, toolName)`. Returns `null` for
 * non-MCP tool names (so the agent can route
 * non-MCP calls to its own tool registry).
 */
export function parseMcpToolName(fullName) {
    if (!fullName.startsWith(MCP_TOOL_PREFIX))
        return null;
    const rest = fullName.slice(MCP_TOOL_PREFIX.length);
    const sep = rest.indexOf("__");
    if (sep < 0)
        return null;
    return {
        serverName: rest.slice(0, sep),
        toolName: rest.slice(sep + 2),
    };
}
//# sourceMappingURL=types.js.map