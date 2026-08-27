/**
 * Phase B / Item 3.1 — plugin loader.
 *
 * **What this is:** a one-shot factory that takes a
 * module path, validates it against the resolved
 * allow-list, dynamically imports the module, validates
 * the default export against `CapabilityModule`, and
 * returns the module + a `Disposable`.
 *
 * **Why dynamic `import()`:** the module path is
 * host-supplied (from `--plugin <module>` on the CLI,
 * or from `cordis.yml` in a future chunk). Static
 * imports are resolved at compile time and don't
 * support user-supplied paths.
 *
 * **Why an allow-list:** `await import(modulePath)` is a
 * code-execution vector. The allow-list is the security
 * boundary: the user controls which plugin names are
 * loadable by enumerating them in `config.plugins.allow`
 * (or by relying on the in-binary built-in samples).
 *
 * **Why a factory, not a static constructor:** the
 * loader is the one-shot factory; the `PluginRegistry`
 * is the long-lived store. The factory validates the
 * module shape + the allow-list match; the registry
 * owns the lifecycle (apply + dispose).
 */
import { PluginLoadError, } from "./types.js";
import { isAllowedPlugin, } from "./allowlist.js";
import { getBuiltinPlugin, isBuiltinPlugin, } from "./whitelist.js";
/**
 * Load a plugin from the given module path.
 *
 * **Hermetic:** the only I/O is the dynamic import of
 * the module. No network, no file system (the path is
 * resolved by Node's module loader).
 *
 * **Errors:**
 * - Module path not in the allow-list → `PluginLoadError`
 *   (the message names the user's `plugins.allow` field
 *   so the fix is one config edit).
 * - Module has no default export → `PluginLoadError`.
 * - Default export is missing `name` or `apply` →
 *   `PluginLoadError` (with the specific field name).
 * - The module itself throws on load → `PluginLoadError`
 *   (the underlying error becomes `cause`).
 *
 * **Why no `apply` call here:** the loader is the
 * one-shot factory. The caller (the `PluginRegistry`)
 * calls `apply` with the agent's `CapabilityContext` —
 * NOT a synthetic one. The loader is module-loading,
 * not lifecycle.
 */
export async function loadPlugin(options) {
    const { modulePath, allowList } = options;
    if (!isAllowedPlugin(modulePath, allowList)) {
        throw new PluginLoadError(`plugin not in allow-list: ${modulePath} ` +
            `(add it to config.plugins.allow in your TOML config, ` +
            `or use one of the built-in samples: ${[...allowList.builtin].join(", ")})`, modulePath);
    }
    // Built-in samples ship INSIDE this package
    // (src/plugins/builtin/*.ts). The dynamic
    // `import(modulePath)` would fail because the
    // built-in names aren't valid module specifiers
    // (no `node_modules/envoy-harness-plugin-*`).
    // The `BUILTIN_PLUGINS` map in `whitelist.ts`
    // short-circuits the import for the built-in
    // names; the dynamic import is only used for
    // external (non-built-in) plugins.
    if (isBuiltinPlugin(modulePath)) {
        // The built-in map is populated at module load
        // time; the plugin module is a direct reference
        // (the built-in modules in `src/plugins/builtin/`
        // are statically imported by `whitelist.ts` so
        // they're already validated by the same TS
        // compiler pass that compiles this file).
        //
        // Cast: built-in plugins are typed against
        // specific Config types (e.g. `AuditLogConfig`),
        // but the loader's generic is caller-supplied.
        // The double cast erases the specific type to
        // the caller's `Config`. The chunk 3.4 schema
        // validation is what actually enforces the
        // shape at runtime.
        const builtIn = getBuiltinPlugin(modulePath);
        if (builtIn === undefined) {
            // Defensive: `isBuiltinPlugin` returned true
            // but the map lookup missed. This would be a
            // bug in `whitelist.ts` (inconsistent state).
            throw new PluginLoadError(`internal: built-in plugin '${modulePath}' is in the index but not in the map`, modulePath);
        }
        return {
            module: builtIn,
            modulePath,
        };
    }
    let mod;
    try {
        mod = (await import(modulePath));
    }
    catch (err) {
        throw new PluginLoadError(`failed to import plugin module: ${modulePath}: ${err.message}`, modulePath, err);
    }
    const def = mod["default"];
    if (def === undefined || def === null) {
        throw new PluginLoadError(`plugin module has no default export: ${modulePath}`, modulePath);
    }
    const module = validateModule(def, modulePath);
    return { module: module, modulePath };
}
/**
 * Validate that `value` matches the `CapabilityModule`
 * contract. Throws `PluginLoadError` with a specific
 * reason on the first failure.
 */
function validateModule(value, modulePath) {
    if (typeof value !== "object" || value === null) {
        throw new PluginLoadError(`plugin default export is not an object: ${modulePath}`, modulePath);
    }
    const obj = value;
    if (typeof obj["name"] !== "string" || obj["name"].length === 0) {
        throw new PluginLoadError(`plugin default export is missing 'name' (must be a non-empty string): ${modulePath}`, modulePath);
    }
    if (typeof obj["apply"] !== "function") {
        throw new PluginLoadError(`plugin default export is missing 'apply' (must be a function): ${modulePath}`, modulePath);
    }
    return obj;
}
//# sourceMappingURL=loader.js.map