import type { ParsedArgs } from "../argv.js";
import type { RunOptions, TeamRunResult } from "./types.js";
export declare function runTeam(parsed: Extract<ParsedArgs, {
    subcommand: "team";
}>, options: RunOptions, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<TeamRunResult>;
//# sourceMappingURL=team.d.ts.map