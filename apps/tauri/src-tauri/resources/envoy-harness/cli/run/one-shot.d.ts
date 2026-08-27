import type { ParsedArgs } from "../argv.js";
import type { RunOptions, RunResult } from "./types.js";
export declare function runAgent(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>, options: RunOptions, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<RunResult>;
//# sourceMappingURL=one-shot.d.ts.map