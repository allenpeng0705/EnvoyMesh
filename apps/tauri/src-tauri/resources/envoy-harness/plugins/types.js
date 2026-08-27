/**
 * Phase B / Item 3.1 — plugin system types.
 *
 * **What this is:** the structural types for the
 * capability-module seam. A plugin is a TypeScript module
 * with a default export matching `CapabilityModule`; the
 * host loads it via `loadPlugin`, then registers it on a
 * `PluginRegistry`. The registry calls `apply(ctx, config)`
 * once at registration time (the plugin registers hooks,
 * tools, fragments on `ctx`); the registry calls
 * `dispose()` when the plugin is unregistered or the
 * agent is destroyed.
 *
 * **Reference:** deepseek's `apply(ctx, config)` shape
 * (port the SHAPE, not the runtime; we don't take Cordis
 * as a dep). The CapabilityContext exposes narrow
 * facets (hooks, tools, cwd, logger) — not the full
 * Agent — so a plugin can only extend, not override.
 *
 * **Stability:** the public surface is the `CapabilityModule`,
 * `CapabilityContext`, `PluginLogger`, and `Disposable`
 * interfaces. New methods on the context are additive.
 */
/**
 * An error thrown by `loadPlugin` or `PluginRegistry`.
 * Distinct from `ConfigLoadError` (which is config-side)
 * and `HookError` (which is runtime-side) so the CLI
 * can distinguish "couldn't load the plugin" from
 * "the plugin loaded but threw at apply-time".
 */
export class PluginLoadError extends Error {
    modulePath;
    cause;
    name = "PluginLoadError";
    constructor(message, modulePath, cause) {
        super(message);
        this.modulePath = modulePath;
        this.cause = cause;
    }
}
/**
 * Phase B / Item 3.4 — an error thrown by
 * `validatePluginConfig` when the parsed config
 * fails the plugin's `configSchema` validation.
 *
 * Distinct from `PluginLoadError` (which is
 * module-side: couldn't load the module) so the CLI
 * can format a clear "config is invalid" message
 * with the zod issue path + message.
 */
export class PluginConfigError extends Error {
    pluginName;
    issues;
    name = "PluginConfigError";
    constructor(pluginName, issues) {
        // Format the issues into a one-line message.
        // The full issue list is on the `issues` field
        // for callers that want the structured form.
        const summary = issues
            .map((i) => `${formatPath(i.path)}: ${i.message}`)
            .join("; ");
        super(`plugin '${pluginName}' config is invalid: ${summary}`);
        this.pluginName = pluginName;
        this.issues = issues;
    }
}
/** Format a zod issue path as a dotted string. */
function formatPath(path) {
    if (path.length === 0)
        return "<root>";
    return path.map((p) => String(p)).join(".");
}
//# sourceMappingURL=types.js.map