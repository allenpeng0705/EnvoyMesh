/**
 * `--mcp` subcommand — run envoy-harness as an MCP stdio server.
 */
import { BUILTIN_TOOLS, InMemorySession, runStdioMcpServer, ToolRegistry, } from "../../index.js";
import { policyFromMode } from "../../permissions/policy.js";
import { makeEmptyRunResult } from "./helpers.js";
export async function runMcpServerDispatch(parsed, stdout) {
    const tools = new ToolRegistry();
    for (const t of BUILTIN_TOOLS)
        tools.register(t);
    const cwd = parsed.cwd ?? process.cwd();
    const session = new InMemorySession("mcp-server", {
        cwd,
        startedAt: new Date().toISOString(),
    });
    await runStdioMcpServer({
        tools,
        toolContext: {
            cwd,
            session,
            abortSignal: new AbortController().signal,
            sandboxPolicy: policyFromMode("danger-full-access", cwd),
        },
        input: process.stdin,
        output: stdout,
        serverInfo: { name: "envoy-harness", version: "0.0.0" },
    });
    return makeEmptyRunResult();
}
//# sourceMappingURL=mcp.js.map