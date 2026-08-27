/**
 * Phase B / Item 3.3 — per-plugin config parser.
 *
 * **What this is:** the small parser that turns a
 * `--plugin-config <name>.<key>=<value>` flag value
 * into a structured `PluginConfigEntry`. The runner
 * (in `cli/run/one-shot.ts`) collects every entry,
 * merges by plugin name via `mergePluginConfigs`,
 * and passes the right config to each plugin's
 * `register(module, config, ctx)` call.
 *
 * **Flag format:** `<name>.<key>=<value>`. The
 * first `.` separates the plugin name from the
 * config key; the first `=` separates the key
 * from the value. Plugin names in the v0
 * whitelist don't contain dots
 * (`envoy-harness-plugin-*`), so the FIRST dot
 * is unambiguously the separator.
 *
 * **Value parsing:** JSON-first, fall back to
 * string. `JSON.parse("2")` → `2` (number);
 * `JSON.parse("true")` → `true` (boolean);
 * `JSON.parse('"foo"')` → `"foo"` (string,
 * requires quotes); `JSON.parse("foo")` throws
 * → use the raw string `"foo"`. The JSON-first
 * approach lets users pass numbers, booleans,
 * arrays, and objects without quoting; only
 * strings with spaces or special characters
 * need quotes.
 *
 * **Why a separate module, not inline in argv.ts:**
 * the parser is the same logic the deepseek
 * reference uses; it deserves its own file for
 * clarity + testing. `argv.ts` only calls
 * `parsePluginConfigEntry` per flag value; the
 * runner calls `mergePluginConfigs` to build
 * the per-plugin `Map`.
 *
 * **Error class:** `PluginConfigParseError`. The
 * argv parser catches it and rethrows as
 * `ArgvError` (the runner's `run()` then converts
 * to `CliError(EXIT_USAGE)`). We don't import
 * `ArgvError` here to keep the import graph
 * acyclic (argv → config-parser would be a
 * cycle).
 */
/** Thrown by `parsePluginConfigEntry` on a malformed
 *  spec. The argv parser catches this and rethrows
 *  as `ArgvError`. */
export class PluginConfigParseError extends Error {
    name = "PluginConfigParseError";
    constructor(message) {
        super(message);
    }
}
/**
 * Parse a single `--plugin-config <spec>` value.
 *
 * **Throws** `PluginConfigParseError` when the spec
 * is malformed:
 * - Empty string.
 * - No `.` (the `<name>.` prefix is required).
 * - No `=` (the `<key>=<value>` is required).
 *
 * **Does not** validate the plugin name against
 * the whitelist (that's the runner's job, which
 * has the `PluginLoadError` plumbing).
 */
export function parsePluginConfigEntry(spec) {
    if (typeof spec !== "string" || spec.length === 0) {
        throw new PluginConfigParseError(`plugin config spec must be a non-empty string: ${JSON.stringify(spec)}`);
    }
    const dotIdx = spec.indexOf(".");
    if (dotIdx < 0) {
        throw new PluginConfigParseError(`plugin config spec must be '<name>.<key>=<value>': ${spec}`);
    }
    const eqIdx = spec.indexOf("=", dotIdx + 1);
    if (eqIdx < 0) {
        throw new PluginConfigParseError(`plugin config spec must be '<name>.<key>=<value>': ${spec}`);
    }
    const name = spec.slice(0, dotIdx);
    const key = spec.slice(dotIdx + 1, eqIdx);
    const rawValue = spec.slice(eqIdx + 1);
    return {
        name,
        key,
        value: parseConfigValue(rawValue),
    };
}
/**
 * Parse a config value as JSON-first, fall back
 * to string. `JSON.parse` accepts JSON literals
 * (numbers, booleans, null, arrays, objects, and
 * quoted strings). For unquoted strings, the
 * parse throws; we treat the raw value as a
 * string in that case.
 */
function parseConfigValue(raw) {
    // Empty string: explicit empty-string value.
    if (raw === "")
        return "";
    try {
        return JSON.parse(raw);
    }
    catch {
        // Not a valid JSON literal (e.g. `hello`); treat
        // the raw value as a string. The user can quote
        // with JSON if they need a string that contains
        // shell-meta characters.
        return raw;
    }
}
/**
 * Merge a flat list of `PluginConfigEntry` into a
 * `Map<pluginName, Record<string, unknown>>`.
 * Multiple entries for the same plugin accumulate
 * (later entries overwrite earlier ones for the
 * same key).
 */
export function mergePluginConfigs(entries) {
    const out = new Map();
    for (const entry of entries) {
        const existing = out.get(entry.name) ?? {};
        existing[entry.key] = entry.value;
        out.set(entry.name, existing);
    }
    return out;
}
//# sourceMappingURL=config-parser.js.map