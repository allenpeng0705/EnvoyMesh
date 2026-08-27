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
/** A single `--plugin-config` entry, parsed from
 *  one flag occurrence. */
export interface PluginConfigEntry {
    /** The plugin name (must match a `--plugin` entry
     *  on the same command line; the runner is
     *  responsible for that cross-check). */
    name: string;
    /** The config key. */
    key: string;
    /** The parsed config value (number, boolean,
     *  string, array, object, null, etc.). */
    value: unknown;
}
/** Thrown by `parsePluginConfigEntry` on a malformed
 *  spec. The argv parser catches this and rethrows
 *  as `ArgvError`. */
export declare class PluginConfigParseError extends Error {
    readonly name = "PluginConfigParseError";
    constructor(message: string);
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
export declare function parsePluginConfigEntry(spec: string): PluginConfigEntry;
/**
 * Merge a flat list of `PluginConfigEntry` into a
 * `Map<pluginName, Record<string, unknown>>`.
 * Multiple entries for the same plugin accumulate
 * (later entries overwrite earlier ones for the
 * same key).
 */
export declare function mergePluginConfigs(entries: ReadonlyArray<PluginConfigEntry>): Map<string, Record<string, unknown>>;
//# sourceMappingURL=config-parser.d.ts.map