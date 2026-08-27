/**
 * Phase B / Item 3.1 + 3.2 — the curated plugin whitelist.
 *
 * **What this is:** a fixed list of plugin NAMES that
 * the loader accepts. The loader's `loadPlugin` takes
 * a name; it looks up the name in this set; on a hit,
 * it either returns the built-in module (chunk 3.2's
 * new path) or imports the module via Node's resolution
 * (typically the name IS the package name; Node's
 * `import()` resolves `@scope/plugin` to
 * `node_modules/@scope/plugin/index.js`).
 *
 * **Why a whitelist:** `await import(name)` is a
 * code-execution vector. The whitelist is the security
 * boundary: the host controls which plugin names are
 * loadable. v0 ships the three built-in samples
 * (`audit-log` from chunk 3.1 + `confirm-tool` +
 * `calculator` from chunk 3.2). Future chunks grow
 * the list as more samples land.
 *
 * **Why two structures (a `Set` for the whitelist, a
 * `Map` for the built-ins):** the whitelist is the
 * security boundary (a `Set` of accepted names). The
 * `BUILTIN_PLUGINS` map is the data for the names that
 * ALSO ship in this package (so the loader can return
 * them directly without a dynamic import). The
 * whitelist membership is the gate; the built-in map
 * is the shortcut. A name in the built-in map but NOT
 * in the whitelist would not be loadable.
 *
 * **Test-only mutability:** the set is exported as
 * `ReadonlySet` to consumers, but the tests need to
 * add temporary entries (a test plugin fixture) to
 * exercise the loader. The cast at the bottom of the
 * file (`as Set<string>`) is the only way the tests
 * can do this without breaking the read-only contract
 * for production callers. The cast is documented here
 * so the next reader doesn't think it's a bug.
 */
import type { CapabilityModule } from "./types.js";
/**
 * The read-only view of the whitelist. Production
 * callers use this. Tests cast to `Set<string>` to
 * add temporary entries.
 */
export declare const PLUGIN_WHITELIST: ReadonlySet<string>;
/**
 * Is the given name in the whitelist?
 *
 * v0: exact match. Future chunks may support prefix
 * matches for plugin families (e.g. allow any
 * `@my-org/envoy-harness-plugin-*`).
 */
export declare function isWhitelistedPlugin(name: string): boolean;
/**
 * Is the given name a built-in plugin? Built-ins
 * ship in this package; the loader can return them
 * directly without a dynamic import.
 */
export declare function isBuiltinPlugin(name: string): boolean;
/**
 * Get a built-in plugin's module by name. Returns
 * `undefined` when the name is not a built-in.
 * Used by `loadPlugin` after `isBuiltinPlugin`
 * confirms the name is built-in.
 */
export declare function getBuiltinPlugin(name: string): CapabilityModule | undefined;
//# sourceMappingURL=whitelist.d.ts.map