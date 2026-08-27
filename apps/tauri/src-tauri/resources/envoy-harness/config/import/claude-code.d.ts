/**
 * Phase B / Item 15.2 — Claude Code `hooks.json` parser.
 *
 * **What this is:** a port of the relevant parts of
 * deepseek-harness's `@deepseek-ai/dsh-hooks-claude-code`
 * `parseClaudeCodeConfig` (the part that walks a CC
 * `hooks.json` / settings-file `hooks` value and produces
 * a per-event `MatcherGroup[]`).
 *
 * **Why a port, not an import:** the deepseek package is
 * cordis-coupled (it expects a Cordis `Context` +
 * `ctx.shell`). envoy-harness is cordis-free per the
 * gap-closure "do not adopt Cordis as a platform" rule.
 * The parsing logic is small and side-effect-free; porting
 * keeps the data shape + the substitution semantics without
 * pulling in Cordis.
 *
 * **What it produces:** a list of `HookHandlerSpec` (one per
 * `MatcherGroup`'s `command` entry). Each spec carries the
 * event name + the matched tool/pattern + the (substituted)
 * command + the timeout. The runtime `registerHooksFromConfig`
 * helper consumes the list directly.
 *
 * **What it does NOT do:** it doesn't spawn anything. The
 * runner does that. This is a pure parser.
 *
 * **Substitution variables:** `${CLAUDE_PLUGIN_ROOT}` and
 * `${CLAUDE_PROJECT_DIR}` are replaced with the values from
 * the bridge config (or left as-is when unset, matching
 * deepseek's lenient behavior).
 *
 * **Stability:** the public surface is `parseClaudeCodeHooks`.
 * The internal helpers (substitution, the matcher walker) are
 * not exported; they may change.
 */
import type { HookHandlerSpec } from "../schema.js";
/**
 * A hook that was parsed but NOT runnable (e.g. an `http`
 * or `prompt` CC hook — only `command` hooks are runnable
 * in envoy-harness). Surfaced so the importer can warn
 * about them.
 */
export interface SkippedCcHook {
    event: string;
    type: string;
}
/** Options for `parseClaudeCodeHooks`. */
export interface ParseClaudeCodeHooksOptions {
    /** The path to the CC `hooks.json` (or settings file).
     *  The file MUST exist; the user asked for THIS bridge. */
    filePath: string;
    /** Replacement for `${CLAUDE_PLUGIN_ROOT}` in command strings. */
    pluginRoot?: string;
    /** Replacement for `${CLAUDE_PROJECT_DIR}` in command strings. */
    projectDir?: string;
}
/** The result of parsing one CC config. */
export interface ParseClaudeCodeHooksResult {
    /** The runnable handler specs, in registration order. */
    specs: ReadonlyArray<HookHandlerSpec>;
    /** The hooks that were parsed but skipped (e.g. `http` hooks). */
    skipped: ReadonlyArray<SkippedCcHook>;
}
/**
 * Read a CC `hooks.json` (or settings file's `hooks` value)
 * and return the runnable handler specs + the skipped ones.
 *
 * **Accepts both shapes:**
 * - Bare event map: `{ "PreToolUse": [...], "Stop": [...] }`
 * - Settings-file wrapper: `{ "hooks": { "PreToolUse": [...], ... } }`
 *
 * **Matcher events** (`PreToolUse` / `PostToolUse`): the
 * CC `matcher` is mapped to `match.pattern` (envoy's
 * match is always regex).
 *
 * **Non-matcher events** (`Stop` / `UserPromptSubmit`): the
 * CC `matcher` is discarded (those events have no matcher
 * subject; envoy's runtime ignores the match for them too).
 *
 * **Hermetic:** the only I/O is reading the file. Pure
 * parser after that.
 *
 * @throws `ConfigLoadError` if the file is missing, not
 *   valid JSON, or a known field has the wrong type.
 */
export declare function parseClaudeCodeHooks(options: ParseClaudeCodeHooksOptions): Promise<ParseClaudeCodeHooksResult>;
//# sourceMappingURL=claude-code.d.ts.map