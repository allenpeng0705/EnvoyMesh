/**
 * Phase B / Item 3.1 — the `PluginRegistry`.
 *
 * **What this is:** the harness-side store for active
 * plugins. The lifecycle:
 * 1. Host calls `registry.register(module, config, ctx)`.
 * 2. The registry calls `module.apply(ctx, config)` and
 *    stashes the returned `Disposable` (or a no-op).
 * 3. Later, the host calls `registry.dispose(name)` or
 *    `registry.disposeAll()` (typically when the agent
 *    is destroyed). The registry runs the `Disposable`
 *    in reverse-registration order.
 *
 * **Why a registry, not a list:** the registry owns
 * the lifecycle (apply + dispose). The loader is a
 * one-shot factory; the registry is the long-lived
 * store. A plugin can be disposed + re-registered
 * without re-importing.
 *
 * **Why a class, not a free function:** the registry
 * holds state (the map of `name → Disposable`). A class
 * makes the state ownership explicit; the methods are
 * the surface.
 *
 * **Why no auto-call on register:** v0 lets the host
 * control when plugins run. The runner calls
 * `register(...)` for every `--plugin` entry in order;
 * each call invokes `apply` synchronously. The registry
 * itself is passive (the host drives it).
 */
import { PluginLoadError, } from "./types.js";
export class PluginRegistry {
    plugins = new Map();
    nextOrder = 0;
    /**
     * Register a plugin. Calls `module.apply(ctx, config)`
     * with the supplied context. Returns the plugin's
     * `Disposable` (or a no-op) so the caller can run
     * individual cleanup.
     *
     * **Duplicate names throw.** The registry keys by
     * `module.name`; a second register with the same
     * name is a programmer error (caller forgot to
     * dispose the first one). The CLI runner creates
     * a fresh registry per `run()` invocation, so this
     * rarely fires in practice.
     *
     * **Apply errors throw.** If `module.apply` throws,
     * the plugin is NOT registered (the registry doesn't
     * keep a broken plugin around). The `Disposable` from
     * a successful prior call is also NOT run — the
     * `apply` didn't run, so there's nothing to clean up.
     */
    register(module, config, ctx) {
        if (this.plugins.has(module.name)) {
            throw new PluginLoadError(`plugin '${module.name}' is already registered ` +
                `(call dispose('${module.name}') first)`, module.name);
        }
        const applyResult = module.apply(ctx, config);
        // Coerce `void` / `undefined` to a no-op disposer.
        // We do this via a wrapper so `disposeAll` doesn't
        // have to special-case the `void` form.
        const dispose = typeof applyResult === "function" ? applyResult : () => undefined;
        this.plugins.set(module.name, {
            module,
            dispose,
            order: this.nextOrder++,
        });
        return dispose;
    }
    /**
     * Dispose a single plugin by name. Returns `true` if
     * a plugin was disposed, `false` if the name was not
     * registered. Idempotent (a second call returns
     * `false`).
     *
     * **Throws** the underlying error when the plugin's
     * `dispose()` throws. The record is already removed
     * from the map before the call, so a re-dispose
     * after a throw is idempotent.
     */
    dispose(name) {
        const record = this.plugins.get(name);
        if (!record)
            return false;
        this.plugins.delete(name);
        // Re-throw the original error (not a
        // `PluginLoadError` — that's a load-side concept;
        // dispose is a runtime teardown concern). The
        // caller can `instanceof Error` or `instanceof
        // <PluginSpecificError>` to introspect.
        record.dispose();
        return true;
    }
    /**
     * Dispose every registered plugin, in reverse-
     * registration order (the last-registered plugin is
     * the first to dispose, matching typical stack-like
     * teardown semantics).
     *
     * **Errors are aggregated.** If plugin A's dispose
     * throws, plugins B and C still get their chance.
     * The first error is re-thrown after all disposes
     * have run (so the caller sees the failure but the
     * other plugins aren't leaked).
     */
    disposeAll() {
        // Sort by reverse order, copy to an array (we
        // mutate the map during the loop).
        const records = Array.from(this.plugins.values()).sort((a, b) => b.order - a.order);
        this.plugins.clear();
        let firstErr = undefined;
        for (const record of records) {
            try {
                record.dispose();
            }
            catch (err) {
                if (firstErr === undefined)
                    firstErr = err;
            }
        }
        if (firstErr !== undefined) {
            throw firstErr;
        }
    }
    /** Number of registered plugins (for diagnostics). */
    size() {
        return this.plugins.size;
    }
    /** List the registered plugin names (registration order). */
    list() {
        return Array.from(this.plugins.values())
            .sort((a, b) => a.order - b.order)
            .map((r) => r.module.name);
    }
}
//# sourceMappingURL=registry.js.map