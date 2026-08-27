import type { CliRunResult } from "./run/types.js";
export { CliError } from "./run/errors.js";
export { EXIT_DATAERR, EXIT_ERROR, EXIT_NOINPUT, EXIT_OK, EXIT_USAGE, } from "./run/types.js";
export { defaultAskHandler, DEFAULT_MAX_COST_USD } from "./run/helpers.js";
export type { CliRunResult, ExitCode, RunOptions, RunResult, SelfEvolveRunResult, TeamRunResult, } from "./run/types.js";
/**
 * Run the CLI. Returns a `CliRunResult` on success, or throws
 * `CliError` on usage / runtime errors. The bin script catches
 * the error and sets the exit code.
 *
 * **Dispatch:**
 * 1. `parseArgs(argv)` — discriminated union by subcommand.
 * 2. `--help` → print help + return empty.
 * 3. `--version` → print version + return empty.
 * 4. `self-evolve` subcommand → `runSelfEvolve`.
 * 5. `team` subcommand → `runTeam`.
 * 6. `run` + `--acp` → `runAcpDispatch` (stdio ACP server).
 * 7. `run` + `--repl` (no positional) → `runReplDispatch`.
 * 8. `run` (default) → `runAgent`.
 */
export declare function run(options?: import("./run/types.js").RunOptions): Promise<CliRunResult>;
//# sourceMappingURL=run.d.ts.map