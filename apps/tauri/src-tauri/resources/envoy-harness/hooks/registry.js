/**
 * HookRegistry — the in-memory store of hook handlers.
 *
 * **Design doc:** `docs/design.md` §8.2.
 *
 * **Three layers of composition (in order):**
 *
 * 1. **Middlewares** (added via `use()`). Run first; can short-circuit
 *    by returning `block`. Useful for cross-cutting concerns:
 *    audit logging, rate limiting, debug traces.
 *
 * 2. **Handlers** (added via `on()`). Matched against the event payload
 *    by `matchHandler`. Matched handlers run in registration order.
 *    First `block` wins; otherwise, all `add-context` are concatenated;
 *    otherwise, last `modify` wins (PostToolUse only); otherwise,
 *    `continue`.
 *
 * 3. **Default** — if no handler fires, return `continue`. The
 *    orchestrator proceeds.
 *
 * **`on()` accepts two forms:**
 * - A function (`HookFn`) — in-process handler. Most common.
 * - A `HookHandler` object — declarative; runs a shell command or
 *   imports a TS module. Useful for config-driven hooks.
 *
 * **Stability:** the public API is `on`, `use`, `fire`, `unregister`,
 * `clear`. New decision kinds require a schema version bump; new
 * matchers are additive.
 */
/** Decide if a value is a function (`HookFn`) or a declarative object. */
function isHookFn(value) {
    return typeof value === "function";
}
/**
 * Convert a declarative `HookHandler` (shell command or module path)
 * into a `HookFn`. The returned function delegates to
 * `runShellHandler` / `runModuleHandler` lazily (imported on first
 * call) so the registry tree-shakes unused runners.
 *
 * **Synchronous wrapper, async body:** the returned `HookFn` is a
 * closure that captures the handler's command/module/timeoutMs.
 * The first invocation triggers the dynamic import; subsequent
 * invocations reuse the cached module reference.
 */
function declarativeToFn(handler) {
    if (handler.command) {
        return async (event) => {
            const { runShellHandler } = await import("./runner.js");
            return runShellHandler(handler.command, event.name, event.payload, handler.timeoutMs ?? 5000);
        };
    }
    if (handler.module) {
        return async (event) => {
            const { runModuleHandler } = await import("./runner.js");
            return runModuleHandler(handler.module, event.name, event.payload);
        };
    }
    // No command or module — return continue. Misconfigured handlers
    // are no-ops, not errors, so the orchestrator can keep running.
    return async () => ({ kind: "continue" });
}
export class HookRegistry {
    handlers = new Map();
    middlewares = [];
    /**
     * Register a handler for an event. Accepts either a `HookFn`
     * (function) or a `HookHandler` object (declarative). Handlers
     * run in registration order. Multiple handlers per event are
     * allowed; they compose.
     */
    on(eventName, handler) {
        const stored = isHookFn(handler)
            ? { input: handler, match: undefined, run: handler }
            : {
                input: handler,
                match: handler.match,
                run: declarativeToFn(handler),
            };
        const existing = this.handlers.get(eventName) ?? [];
        existing.push(stored);
        this.handlers.set(eventName, existing);
        return this;
    }
    /**
     * Unregister a handler. Returns `true` if the handler was found
     * and removed, `false` otherwise. Idempotent. The argument is
     * compared by reference against the original input passed to `on()`.
     */
    unregister(eventName, handler) {
        const existing = this.handlers.get(eventName);
        if (!existing)
            return false;
        const idx = existing.findIndex((s) => s.input === handler);
        if (idx === -1)
            return false;
        existing.splice(idx, 1);
        return true;
    }
    /**
     * F17.2.5: list the (event, handlerCount) pairs for every
     * event with at least one registered handler. Used by
     * `/hooks`. Returns events in registration order (the
     * order in which the first handler was registered).
     */
    list() {
        const out = [];
        for (const [event, handlers] of this.handlers.entries()) {
            if (handlers.length === 0)
                continue;
            out.push({ event, handlerCount: handlers.length });
        }
        return out;
    }
    /**
     * Add a middleware. Middlewares run before handlers and can
     * short-circuit by returning `block`. They cannot `modify` (no
     * payload to modify yet).
     */
    use(middleware) {
        this.middlewares.push(middleware);
        return this;
    }
    /**
     * Fire an event. Returns the composed decision.
     *
     * Composition rules (in order):
     * - First `block` (from middleware or handler) short-circuits.
     * - All `add-context` are concatenated with `\n\n`.
     * - Last `modify` wins (PostToolUse only; for other events, `modify`
     *   is treated as `continue` since there's no payload to modify
     *   before the model sees it).
     * - Otherwise, `continue`.
     */
    async fire(eventName, payload) {
        // Middlewares first. They can short-circuit.
        for (const middleware of this.middlewares) {
            let decision;
            try {
                decision = await middleware(eventName, payload);
            }
            catch (err) {
                // A throwing middleware is a hook failure, not a runtime
                // crash. Convert to a block so the agent loop can react.
                return {
                    kind: "block",
                    reason: `hook middleware threw: ${err.message}`,
                };
            }
            if (decision.kind === "block")
                return decision;
        }
        // Matched handlers, in registration order.
        const handlers = this.handlers.get(eventName) ?? [];
        const matched = handlers.filter((h) => this.matchHandler(h, payload));
        let lastModify = null;
        let lastAsk = null;
        const contexts = [];
        for (const handler of matched) {
            let decision;
            try {
                decision = await handler.run({ name: eventName, payload });
            }
            catch (err) {
                // Inline HookFn handlers can throw (module/shell runners
                // already convert to block). A throw is a hook failure —
                // surface it as a block instead of crashing the run.
                return {
                    kind: "block",
                    reason: `hook threw: ${err.message}`,
                };
            }
            if (decision.kind === "block")
                return decision;
            if (decision.kind === "modify") {
                if (eventName === "PostToolUse" || eventName === "PreToolUse") {
                    // PostToolUse modifies the result; PreToolUse modifies the
                    // tool call's args (the agent re-validates against the
                    // tool's zod schema).
                    lastModify = decision;
                }
                // For other events, treat modify as continue (no payload to
                // modify before the model sees it).
            }
            if (decision.kind === "add-context") {
                contexts.push(decision.content);
            }
            if (decision.kind === "ask") {
                // F9.1: ask is PreToolUse only. Stash the last ask;
                // if no block came first, return the ask at the end
                // (after the loop) so multiple handlers compose: a
                // block wins; otherwise the last ask wins.
                if (eventName === "PreToolUse") {
                    lastAsk = decision;
                }
            }
        }
        // Precedence for PreToolUse: an `ask` (approval) must not be
        // suppressed by a concurrent `add-context` from another handler
        // (add-context isn't actionable at PreToolUse anyway). A
        // `modify` is returned for the agent to apply.
        if (lastAsk)
            return lastAsk;
        if (contexts.length > 0) {
            return { kind: "add-context", content: contexts.join("\n\n") };
        }
        if (lastModify)
            return lastModify;
        return { kind: "continue" };
    }
    /** List registered events (for diagnostics). */
    listEvents() {
        return Array.from(this.handlers.keys());
    }
    /** Number of registered handlers (for diagnostics). */
    size() {
        let n = 0;
        for (const list of this.handlers.values())
            n += list.length;
        return n;
    }
    /**
     * Remove all handlers and middlewares. Test-only utility;
     * production code should not call this in normal flow.
     */
    clear() {
        this.handlers.clear();
        this.middlewares = [];
    }
    /**
     * Test if a handler's `match` clause matches the payload.
     * A handler with no `match` matches everything.
     */
    matchHandler(handler, payload) {
        if (!handler.match)
            return true;
        const p = payload;
        if (handler.match.tool && p.tool !== handler.match.tool)
            return false;
        if (handler.match.pattern) {
            const re = new RegExp(handler.match.pattern);
            if (!re.test(JSON.stringify(payload)))
                return false;
        }
        return true;
    }
}
/**
 * The default registry. Handlers register into this at module load.
 * The orchestrator fires events through this at runtime.
 *
 * Tests should not use this; create a local `new HookRegistry()` per
 * test for isolation.
 */
export const defaultRegistry = new HookRegistry();
//# sourceMappingURL=registry.js.map