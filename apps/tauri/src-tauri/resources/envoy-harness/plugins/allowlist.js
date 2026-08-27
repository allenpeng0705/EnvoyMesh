/**
 * Phase G / Item 3 (Review 3 / Medium 4): runtime plugin allow-list.
 *
 * **What this is:** the bridge between the in-binary
 * `PLUGIN_WHITELIST` (the 3 built-in samples) and the
 * user-configured `plugins.allow` list. The runner calls
 * `resolvePluginAllowList` once at startup, gets a merged
 * `ReadonlySet<string>`, and passes the set to
 * `loadPlugin`. The set is the security boundary: a name
 * not in the set is rejected by the loader with a clear
 * error message that tells the user how to add it.
 *
 * **Why a separate module (not in `whitelist.ts`):**
 * `whitelist.ts` is the source of truth for the in-binary
 * built-ins. The allow-list is the runtime union; the
 * user-configured half is data, not code. Splitting the
 * two keeps the build-time constant separate from the
 * request-time resolution.
 *
 * **Why a `ReadonlySet` for the result:** the loader
 * does membership checks; a Set is O(1) on `has()`. The
 * set is exposed as `ReadonlySet` so callers can't
 * accidentally mutate it (which would let a rogue plugin
 * expand its own allow-list).
 *
 * **Validation:** each configured entry must be a
 * non-empty string. We don't validate Node module
 * specifier shape (Node's own resolver handles
 * `@scope/pkg`, `./rel`, `file://...`, etc.); we just
 * reject empties and duplicates.
 */
import { isBuiltinPlugin, PLUGIN_WHITELIST } from "./whitelist.js";
/**
 * Build the runtime plugin allow-list from the in-binary
 * built-ins and the user-configured entries.
 *
 * **Dedup:** duplicate names (a built-in repeated in
 * the user's `allow`) collapse to one entry — `Set`
 * semantics. A user who puts `envoy-harness-plugin-audit-log`
 * in their `allow` list is harmless; the union is the
 * same as without it.
 *
 * **Order:** insertion order matters only for diagnostics.
 * The set is unordered for membership checks; the
 * loader iterates the user's `--plugin` list in argv
 * order, not the set.
 */
export function resolvePluginAllowList(options = {}) {
    const builtin = options.builtin ?? PLUGIN_WHITELIST;
    const allow = new Set(builtin);
    if (options.configured !== undefined) {
        for (const name of options.configured) {
            // Reject empty / whitespace-only entries. The
            // config schema already rejects empty strings
            // (`z.string().min(1)`); this is a defense in
            // depth in case a programmatic caller bypasses
            // the schema.
            if (typeof name !== "string" || name.trim().length === 0)
                continue;
            allow.add(name);
        }
    }
    return { allow, builtin };
}
/**
 * Is the given name loadable under the resolved
 * allow-list? Convenience wrapper around
 * `resolved.allow.has(name)`.
 */
export function isAllowedPlugin(name, resolved) {
    return resolved.allow.has(name);
}
/**
 * Is the given name a built-in (in-package sample)?
 * The loader uses this to short-circuit the dynamic
 * import path. Re-exported from `whitelist.ts` for
 * one-stop callers.
 */
export function isBuiltinPluginName(name) {
    return isBuiltinPlugin(name);
}
//# sourceMappingURL=allowlist.js.map