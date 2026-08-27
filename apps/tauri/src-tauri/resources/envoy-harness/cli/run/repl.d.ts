import type { ParsedArgs } from "../argv.js";
import type { RunOptions, RunResult } from "./types.js";
export declare function runReplDispatch(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>, options: RunOptions, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<RunResult>;
//# sourceMappingURL=repl.d.ts.map