import type { ParsedArgs } from "../argv.js";
import type { RunOptions, SelfEvolveRunResult } from "./types.js";
export declare function runSelfEvolve(parsed: Extract<ParsedArgs, {
    subcommand: "self-evolve";
}>, options: RunOptions, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<SelfEvolveRunResult>;
//# sourceMappingURL=self-evolve.d.ts.map