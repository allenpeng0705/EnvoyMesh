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
import { type CapabilityModule } from "./types.js";
import { type ResolvedPluginAllowList } from "./allowlist.js";
/** The result of `loadPlugin`. The caller registers
 *  `(module, config)` on a `PluginRegistry`; the
 *  registry calls `module.apply(ctx, config)` once. */
export interface LoadedPlugin<Config = unknown> {
    /** The validated plugin module. */
    module: CapabilityModule<Config>;
    /** The module path the plugin was loaded from (for diagnostics). */
    modulePath: string;
}
/** Options for `loadPlugin`. */
export interface LoadPluginOptions {
    /** The module path to import. The path MUST be in the
     *  resolved allow-list (built-in samples + the
     *  user's `config.plugins.allow`); an unallowed
     *  path throws `PluginLoadError`. */
    modulePath: string;
    /**
     * The resolved allow-list (built-in ∪ configured).
     * The runner builds this once at startup via
     * `resolvePluginAllowList` and passes the same
     * instance to every `loadPlugin` call so all
     * plugins on a single run are gated by the same
     * set.
     */
    allowList: ResolvedPluginAllowList;
}
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
export declare function loadPlugin<Config = unknown>(options: LoadPluginOptions): Promise<LoadedPlugin<Config>>;
//# sourceMappingURL=loader.d.ts.map