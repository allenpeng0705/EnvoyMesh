import { type AskHandler, type ModelAdapter } from "../../index.js";
import type { ParsedArgs } from "../argv.js";
import type { RunOptions, RunResult } from "./types.js";
/** F-fix: default cost ceiling for the CLI (design §19: 5.00). */
export declare const DEFAULT_MAX_COST_USD = 5;
/**
 * Resolve the model adapter for the `run` subcommand. F7.5:
 *
 * - If `RunOptions.model` is provided, use it (programmatic
 *   injection takes precedence over the CLI).
 * - Else if `--provider <name>` is given, dispatch via
 *   `createProviderAdapter`, reading the matching env var.
 * - Else throw `CliError(EXIT_USAGE)` with a message that
 *   tells the user how to fix it.
 *
 * `createProviderAdapter` throws on unknown provider /
 * missing env var; we wrap as `CliError` so the bin
 * script's exit code is correct (USAGE, not ERROR).
 *
 * **Why shared with the team subcommand:** the
 * dispatch logic is identical (both read
 * `--provider` and env vars). The team subcommand
 * uses `resolveModelForTeam` (in `team.ts`) which
 * is the same body with a narrower type.
 */
export declare function resolveModel(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>, options: RunOptions): ModelAdapter;
/**
 * Resolve the default session directory.
 *
 * Order:
 * 1. `--session-dir <path>` (if set)
 * 2. `$ENVOY_HARNESS_SESSION_DIR` (if set)
 * 3. `~/.local/state/envoy-harness/sessions`
 */
export declare function defaultSessionDir(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>): string;
/** `true` if `p` exists and is a regular file. */
export declare function isFile(p: string): Promise<boolean>;
/**
 * Resolve the prompt. Three sources (in priority order):
 *
 * 1. `-` → read from stdin (allows `echo "do X" | envoy`).
 * 2. A positional that looks like a path AND is a file
 *    → read the file (allows `envoy prompt.md`).
 * 3. The positional string(s) joined by spaces.
 *
 * Returns `null` when there's no positional (the caller
 * decides what to do — `runAgent` throws `CliError`,
 * `runReplDispatch` ignores the result).
 */
export declare function resolvePrompt(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>): Promise<string | null>;
/** Empty `RunResult` for `--help` / `--version` exits. */
export declare function makeEmptyRunResult(): RunResult;
/** Help text — delegates to argv's `formatHelp` to keep one source. */
export declare function formatHelpText(): string;
/**
 * F9.1 default `askHandler` for the CLI runner. When the
 * agent loop hits a hook decision of `kind: "ask"`, the
 * runner writes a one-line "ask" record to stderr
 * (so the user can see what was asked) and returns
 * `deny` (safe default — the tool is blocked).
 *
 * **Why deny, not allow:** the bin script is the
 * headless context. There's no UI to show a prompt;
 * the user can't see it. Allowing would silently
 * grant the model any action that the hook flagged.
 * Denying ensures the user notices (the transcript
 * shows "denied by user: no ask handler configured").
 *
 * **Production hosts** (Tauri, web, etc.) inject a
 * real UI handler via `RunOptions.askHandler`. The
 * production handler returns whatever the user
 * picked. This default is for the v0 CLI.
 */
export declare const defaultAskHandler: AskHandler;
//# sourceMappingURL=helpers.d.ts.map