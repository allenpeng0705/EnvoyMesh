/**
 * Phase E / G — `--acp` stdio server dispatch.
 *
 * Serves the ACP dialect on stdin/stdout with Content-Length
 * JSON-RPC framing. Hosts (TUI, EnvoyMesh Tauri) attach as
 * clients; stdout is reserved for frames (status → stderr).
 */
import type { ParsedArgs } from "../argv.js";
import { type RunOptions, type RunResult } from "./types.js";
/**
 * Run until the JSON-RPC input stream ends (or the connection
 * closes). Returns an empty run result.
 */
export declare function runAcpDispatch(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>, options: RunOptions, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<RunResult>;
//# sourceMappingURL=acp.d.ts.map