/**
 * Shared helpers for the CLI subcommand handlers.
 * Extracted in T3.2 so each subcommand file
 * (`one-shot.ts`, `repl.ts`, `self-evolve.ts`,
 * `team.ts`) can import what it needs without
 * duplicating the logic.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { EXIT_USAGE, createProviderAdapter, formatHelp, VERSION, } from "../../index.js";
import { CliError } from "./errors.js";
/** F-fix: default cost ceiling for the CLI (design §19: 5.00). */
export const DEFAULT_MAX_COST_USD = 5.0;
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
export function resolveModel(parsed, options) {
    if (options.model)
        return options.model;
    if (!parsed.provider) {
        throw new CliError("no model configured: pass one via RunOptions.model, or use --provider <openai|anthropic|deepseek|ollama> with the matching *_API_KEY env var", EXIT_USAGE);
    }
    try {
        return createProviderAdapter({
            provider: parsed.provider,
            ...(parsed.model !== undefined ? { model: parsed.model } : {}),
        });
    }
    catch (err) {
        throw new CliError(err.message, EXIT_USAGE);
    }
}
/**
 * Resolve the default session directory.
 *
 * Order:
 * 1. `--session-dir <path>` (if set)
 * 2. `$ENVOY_HARNESS_SESSION_DIR` (if set)
 * 3. `~/.local/state/envoy-harness/sessions`
 */
export function defaultSessionDir(parsed) {
    if (parsed.sessionDir)
        return parsed.sessionDir;
    const env = process.env["ENVOY_HARNESS_SESSION_DIR"];
    if (env && env.length > 0)
        return env;
    return `${process.env["HOME"] ?? os.homedir()}/.local/state/envoy-harness/sessions`;
}
/** `true` if `p` exists and is a regular file. */
export async function isFile(p) {
    try {
        const s = await fs.stat(p);
        return s.isFile();
    }
    catch {
        return false;
    }
}
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
export async function resolvePrompt(parsed) {
    if (parsed.positional.length === 0)
        return null;
    const first = parsed.positional[0];
    if (first === undefined)
        return null;
    if (first === "-") {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString("utf8").trim();
    }
    if ((first.startsWith("/") || first.startsWith("./") || first.startsWith("../")) &&
        await isFile(first)) {
        return (await fs.readFile(first, "utf8")).trim();
    }
    return parsed.positional.join(" ");
}
/** Empty `RunResult` for `--help` / `--version` exits. */
export function makeEmptyRunResult() {
    return {
        subcommand: "run",
        content: "",
        stopReason: "end_turn",
        sessionId: "",
        iterations: 0,
        toolCalls: 0,
    };
}
/** Help text — delegates to argv's `formatHelp` to keep one source. */
export function formatHelpText() {
    return formatHelp(VERSION);
}
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
export const defaultAskHandler = async (req) => {
    process.stderr.write(`envoy-harness: ask: ${req.tool}(${JSON.stringify(req.args)}) — denied (no UI handler in v0 CLI)\n`);
    return { kind: "deny", reason: "no ask handler configured" };
};
//# sourceMappingURL=helpers.js.map