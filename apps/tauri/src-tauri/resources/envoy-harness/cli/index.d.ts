/**
 * @envoymesh/envoy-harness — CLI module.
 *
 * Public API:
 * - `parseArgs(argv)` — parse argv into a `ParsedArgs` object.
 * - `run(options)` — run the CLI; returns a `RunResult` or throws `CliError`.
 * - `formatHelp(version)` — render help text.
 * - `ArgvError`, `CliError` — error types.
 *
 * The actual binary lives in `bin/envoy-harness.ts`. The CLI is
 * split into its own module so it can be reused by other
 * entry points (e.g. a future `envoy doctor` subcommand) without
 * depending on the binary's argv.
 */
export { ArgvError, formatHelp, parseArgs, type ParsedArgs, type RunParsedArgs, type SelfEvolveParsedArgs, } from "./argv.js";
export { CliError, EXIT_DATAERR, EXIT_ERROR, EXIT_NOINPUT, EXIT_OK, EXIT_USAGE, defaultAskHandler, run, type CliRunResult, type ExitCode, type RunOptions, type RunResult, type SelfEvolveRunResult, } from "./run.js";
export { BUILTIN_COMMANDS, BUILTIN_INFO_COMMANDS, BUILTIN_TIER2_BATCH2_COMMANDS, BUILTIN_TIER2_BATCH3_COMMANDS, BUILTIN_TIER2_BATCH4_COMMANDS, BUILTIN_TIER2_COMMANDS, ReplCommandRegistry, dispatchCommand, parseCommandLine, runRepl, type DispatchResult, type LineReader, type ReplCommand, type ReplContext, type ReplOptions, type ReplProfile, type ReplProfileLoader, type ReplResult, type SubagentRegistry, } from "./repl/index.js";
//# sourceMappingURL=index.d.ts.map