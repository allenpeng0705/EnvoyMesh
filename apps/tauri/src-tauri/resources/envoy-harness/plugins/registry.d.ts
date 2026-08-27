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
import { type CapabilityContext, type CapabilityModule, type Disposable } from "./types.js";
export declare class PluginRegistry {
    private readonly plugins;
    private nextOrder;
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
    register<Config = unknown>(module: CapabilityModule<Config>, config: Config, ctx: CapabilityContext): Disposable;
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
    dispose(name: string): boolean;
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
    disposeAll(): void;
    /** Number of registered plugins (for diagnostics). */
    size(): number;
    /** List the registered plugin names (registration order). */
    list(): ReadonlyArray<string>;
}
//# sourceMappingURL=registry.d.ts.map