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
import { promises as fs } from "node:fs";
import { ConfigLoadError } from "../loader.js";
/**
 * The CC hook events we know about. Mirrors the set in
 * `parseClaudeCodeConfig` (deepseek's `CLAUDE_EVENTS`
 * constant). Events not in this set are silently ignored
 * by the parser (the runtime doesn't know about them,
 * so surfacing them as warnings would be noise).
 */
const CC_EVENTS = [
    "PreToolUse",
    "PostToolUse",
    "PreCompact",
    "PostCompact",
    "SessionStart",
    "SessionEnd",
    "Stop",
    "SubagentStop",
    "UserPromptSubmit",
    "Notification",
    "PermissionRequest",
];
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
export async function parseClaudeCodeHooks(options) {
    const raw = await readCcFile(options.filePath);
    const parsed = parseCcJson(raw, options.filePath);
    const skipped = [];
    // Accept either a bare event map or a settings wrapper.
    const root = asObject(parsed);
    if (!root) {
        return { specs: [], skipped };
    }
    const hooksMap = asObject(root["hooks"]) ?? root;
    const specs = [];
    for (const event of CC_EVENTS) {
        const rawGroups = hooksMap[event];
        if (!Array.isArray(rawGroups))
            continue;
        for (const rawGroup of rawGroups) {
            const group = asObject(rawGroup);
            if (!group || !Array.isArray(group["hooks"]))
                continue;
            // The matcher's subject is the tool name (PreToolUse /
            // PostToolUse) or the event payload. CC's matcher
            // applies to all subjects; for the events we model
            // it's a regex against the tool name. The CC literal
            // form (e.g. `Bash|Edit`) is for the literal-match mode
            // CC uses when the pattern is purely alphanum + pipe;
            // we don't distinguish — `pattern` is always regex.
            const matcher = event === "Stop" || event === "UserPromptSubmit"
                ? undefined
                : typeof group["matcher"] === "string"
                    ? group["matcher"]
                    : undefined;
            // Validate the regex (a typo in the matcher would
            // otherwise explode at fire-time).
            if (matcher !== undefined) {
                try {
                    new RegExp(matcher);
                }
                catch (err) {
                    throw new ConfigLoadError(`invalid Claude Code matcher regex: ${options.filePath}: ` +
                        `event=${event}, matcher=${matcher}: ${err.message}`, options.filePath, err);
                }
            }
            for (const rawHook of group["hooks"]) {
                const hook = asObject(rawHook);
                if (!hook)
                    continue;
                // CC defaults to `command` when `type` is absent
                // (matches deepseek's behavior).
                const type = typeof hook["type"] === "string" ? hook["type"] : "command";
                if (type !== "command") {
                    skipped.push({ event, type });
                    continue;
                }
                if (typeof hook["command"] !== "string")
                    continue;
                // The `substituteCommand` signature uses
                // `exactOptionalPropertyTypes: true`, so we build
                // the vars object with conditional spreads to
                // avoid passing explicit `undefined` for absent
                // fields.
                const subVars = {};
                if (options.pluginRoot !== undefined) {
                    subVars.pluginRoot = options.pluginRoot;
                }
                if (options.projectDir !== undefined) {
                    subVars.projectDir = options.projectDir;
                }
                const substituted = substituteCommand(hook["command"], subVars);
                const spec = {
                    command: substituted,
                    event,
                };
                if (matcher !== undefined) {
                    spec.match = { pattern: matcher };
                }
                if (typeof hook["timeout"] === "number" && hook["timeout"] > 0) {
                    // CC's `timeout` is in SECONDS; envoy's `timeoutMs`
                    // is in MILLISECONDS. Convert at the boundary.
                    spec.timeoutMs = hook["timeout"] * 1000;
                }
                specs.push(spec);
            }
        }
    }
    return { specs, skipped };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Read the file. ENOENT is an error here (the bridge
 *  explicitly referenced it). */
async function readCcFile(filePath) {
    try {
        return await fs.readFile(filePath, "utf8");
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new ConfigLoadError(`Claude Code hooks file not found: ${filePath}`, filePath, err);
        }
        throw new ConfigLoadError(`failed to read Claude Code hooks file: ${filePath}: ${err.message}`, filePath, err);
    }
}
/** Parse the file as JSON. */
function parseCcJson(raw, filePath) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        throw new ConfigLoadError(`failed to parse Claude Code JSON: ${filePath}: ${err.message}`, filePath, err);
    }
    return parsed;
}
/** A plain (non-null, non-array) object, or `undefined`. */
function asObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
/**
 * Apply `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}`
 * substitution to a command string. A token whose variable
 * is unset stays verbatim (matches deepseek's lenient
 * behavior).
 */
function substituteCommand(command, vars) {
    let out = command;
    if (vars.pluginRoot !== undefined) {
        out = out.split("${CLAUDE_PLUGIN_ROOT}").join(vars.pluginRoot);
    }
    if (vars.projectDir !== undefined) {
        out = out.split("${CLAUDE_PROJECT_DIR}").join(vars.projectDir);
    }
    return out;
}
//# sourceMappingURL=claude-code.js.map