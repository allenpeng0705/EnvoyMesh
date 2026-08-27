/**
 * `--mcp` subcommand — run envoy-harness as an MCP stdio server.
 */
import type { ParsedArgs } from "../argv.js";
import type { RunResult } from "./types.js";
export declare function runMcpServerDispatch(parsed: Extract<ParsedArgs, {
    subcommand: "mcp";
}>, stdout: NodeJS.WritableStream): Promise<RunResult>;
//# sourceMappingURL=mcp.d.ts.map