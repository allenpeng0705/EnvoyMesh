/**
 * Phase B / Item 15.2 — `registerHooksFromConfig`.
 *
 * **What this is:** a thin helper that takes a list of
 * `HookHandlerSpec` (the config-layer shape) and registers
 * each one on a `HookRegistry`. The runtime `HookHandler`
 * shape and the config `HookHandlerSpec` shape are the
 * same; the helper is the bridge that re-uses the runtime
 * registration machinery without forcing the schema to
 * depend on it.
 *
 * **Why a helper, not inline registration in the runner:**
 * the registration logic is testable in isolation (register
 * a spec, fire an event, assert the spec ran). The runner
 * already has 6+ inline `agentOptions.X = …` lines; a
 * named helper makes the call site readable.
 *
 * **Idempotency:** `registerHooksFromConfig` returns a
 * disposer that unregisters everything it registered. The
 * runner calls this in a `try/finally` so a re-registration
 * (e.g. on `loadConfigWithImport` retry) doesn't leak
 * handlers.
 *
 * **Stability:** the helper is part of the public hooks
 * surface. The signature is stable.
 */
import { HookRegistry } from "./registry.js";
/**
 * Register every spec in `specs` on `registry`. Returns a
 * disposer that unregisters them (call it in a `finally`
 * if you might re-register).
 *
 * **Event-name validation:** `HookHandlerSpec.event` is
 * already validated by the zod schema (it's an enum), so
 * we don't need a runtime check here.
 *
 * **Match-clause translation:** the spec's `match` is
 * already in the runtime `HookHandler.match` shape (same
 * field names). No translation needed.
 *
 * **timeoutMs default:** the runtime defaults to 5s. The
 * spec is `.optional()`; the registry's
 * `declarativeToFn` applies the default when the spec
 * doesn't set it.
 */
export function registerHooksFromConfig(registry, specs) {
    // Track every registration so the disposer can reverse
    // them. The order is the registration order, which is
    // the order the spec was passed in.
    const registered = [];
    for (const spec of specs) {
        // The runtime `HookHandler` shape uses `match?: { tool?:
        // string; pattern?: string }` (each property optional).
        // The `exactOptionalPropertyTypes: true` setting means
        // we can't pass an explicit `undefined` for an absent
        // field; we conditionally build the match object.
        const handler = {
            command: spec.command,
        };
        if (spec.match !== undefined) {
            const match = {};
            if (spec.match.tool !== undefined)
                match.tool = spec.match.tool;
            if (spec.match.pattern !== undefined)
                match.pattern = spec.match.pattern;
            handler.match = match;
        }
        if (spec.timeoutMs !== undefined) {
            handler.timeoutMs = spec.timeoutMs;
        }
        registry.on(spec.event, handler);
        // The registry stores by-reference for unregister; we
        // need a stable reference to pass to `unregister`.
        // Capture the handler object we just constructed.
        registered.push({ event: spec.event, handler });
    }
    return () => {
        for (const { event, handler } of registered) {
            registry.unregister(event, handler);
        }
    };
}
//# sourceMappingURL=register-from-config.js.map