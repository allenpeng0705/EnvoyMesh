/**
 * CLI error type — moved to its own file in T3.2
 * so the subcommand handlers (`one-shot.ts`,
 * `repl.ts`, `self-evolve.ts`, `team.ts`) can
 * throw without importing the full `cli/run.ts`
 * (which would re-import them — a cycle).
 *
 * The class is still re-exported from
 * `src/cli/index.ts` via `run.js` so the public
 * API is unchanged.
 */
import type { ExitCode } from "./types.js";
/** Error type thrown by the runner. Carries the exit code. */
export declare class CliError extends Error {
    exitCode: ExitCode;
    constructor(message: string, exitCode: ExitCode);
}
//# sourceMappingURL=errors.d.ts.map