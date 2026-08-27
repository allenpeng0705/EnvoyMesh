/**
 * CLI runner — the `envoy-harness` entry point.
 *
 * **T3.2 (split):** the four subcommand handlers
 * (`runAgent`, `runReplDispatch`, `runSelfEvolve`,
 * `runTeam`) live in `cli/run/{one-shot,repl,
 * self-evolve,team}.ts`. The shared helpers
 * (`resolveModel`, `defaultSessionDir`,
 * `resolvePrompt`, `isFile`, `makeEmptyRunResult`,
 * `formatHelpText`, `defaultAskHandler`) live
 * in `cli/run/helpers.ts`. The result types live
 * in `cli/run/types.ts`. The `CliError` class
 * lives in `cli/run/errors.ts`. The session
 * resolver (`resolveSession`) lives in
 * `session/resolve.ts`.
 *
 * This file is now a thin dispatcher: `run()`
 * parses argv, handles `--help` / `--version`,
 * and dispatches to the subcommand. The
 * public API re-exports (`run`, `CliError`,
 * `RunOptions`, `RunResult`, `SelfEvolveRunResult`,
 * `TeamRunResult`, `CliRunResult`, `ExitCode`,
 * `EXIT_OK`, `EXIT_ERROR`, `EXIT_USAGE`,
 * `EXIT_DATAERR`, `EXIT_NOINPUT`,
 * `defaultAskHandler`, `DEFAULT_MAX_COST_USD`)
 * is unchanged; consumers via
 * `src/cli/index.ts` see no difference.
 */
import { parseArgs } from "./argv.js";
import { CliError } from "./run/errors.js";
import { EXIT_USAGE } from "./run/types.js";
import { formatHelpText, makeEmptyRunResult } from "./run/helpers.js";
import { runAcpDispatch } from "./run/acp.js";
import { runDoctorDispatch } from "./run/doctor.js";
import { runMcpServerDispatch } from "./run/mcp.js";
import { runTuiDispatch } from "./run/tui.js";
import { runAgent } from "./run/one-shot.js";
import { runReplDispatch } from "./run/repl.js";
import { runSelfEvolve } from "./run/self-evolve.js";
import { runTeam } from "./run/team.js";
import { VERSION } from "../index.js";
// Re-exports — keep the public API stable.
export { CliError } from "./run/errors.js";
export { EXIT_DATAERR, EXIT_ERROR, EXIT_NOINPUT, EXIT_OK, EXIT_USAGE, } from "./run/types.js";
export { defaultAskHandler, DEFAULT_MAX_COST_USD } from "./run/helpers.js";
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
export async function run(options = {}) {
    const argv = options.argv ?? process.argv.slice(2);
    const stdout = options.stdout ?? process.stdout;
    const stderr = options.stderr ?? process.stderr;
    // 1. Parse argv.
    let parsed;
    try {
        parsed = parseArgs(argv);
    }
    catch (err) {
        throw new CliError(err.message, EXIT_USAGE);
    }
    // 2. Handle --help / --version (common to all subcommands).
    if (parsed.help) {
        stdout.write(formatHelpText() + "\n");
        return makeEmptyRunResult();
    }
    if (parsed.version) {
        stdout.write(`${VERSION}\n`);
        return makeEmptyRunResult();
    }
    // 3. Dispatch on subcommand.
    if (parsed.subcommand === "self-evolve") {
        return runSelfEvolve(parsed, options, stdout, stderr);
    }
    if (parsed.subcommand === "team") {
        return runTeam(parsed, options, stdout, stderr);
    }
    if (parsed.subcommand === "doctor") {
        return runDoctorDispatch(parsed, options, stdout);
    }
    if (parsed.subcommand === "mcp") {
        return runMcpServerDispatch(parsed, stdout);
    }
    if (parsed.subcommand === "tui") {
        return runTuiDispatch(parsed, argv);
    }
    // 3a. Phase E / G: --acp serves ACP JSON-RPC on stdio.
    if (parsed.subcommand === "run" && parsed.acp) {
        return runAcpDispatch(parsed, options, stdout, stderr);
    }
    // 3b. F17.1: --repl activates the interactive REPL. The
    //     REPL takes no positional prompt; a positional + --repl
    //     is a usage error.
    if (parsed.repl) {
        if (parsed.positional.length > 0) {
            throw new CliError("--repl takes no positional prompt; type into the REPL instead", EXIT_USAGE);
        }
        return runReplDispatch(parsed, options, stdout, stderr);
    }
    return runAgent(parsed, options, stdout, stderr);
}
//# sourceMappingURL=run.js.map