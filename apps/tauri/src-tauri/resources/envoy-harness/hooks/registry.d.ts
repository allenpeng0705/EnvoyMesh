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
import type { HookDecision, HookEventName, HookFn, HookHandler } from "../types.js";
/** A middleware runs before handlers and can short-circuit. */
export type HookMiddleware = (eventName: HookEventName, payload: unknown) => Promise<HookDecision>;
export declare class HookRegistry {
    private handlers;
    private middlewares;
    /**
     * Register a handler for an event. Accepts either a `HookFn`
     * (function) or a `HookHandler` object (declarative). Handlers
     * run in registration order. Multiple handlers per event are
     * allowed; they compose.
     */
    on(eventName: HookEventName, handler: HookFn | HookHandler): this;
    /**
     * Unregister a handler. Returns `true` if the handler was found
     * and removed, `false` otherwise. Idempotent. The argument is
     * compared by reference against the original input passed to `on()`.
     */
    unregister(eventName: HookEventName, handler: HookFn | HookHandler): boolean;
    /**
     * F17.2.5: list the (event, handlerCount) pairs for every
     * event with at least one registered handler. Used by
     * `/hooks`. Returns events in registration order (the
     * order in which the first handler was registered).
     */
    list(): ReadonlyArray<{
        event: string;
        handlerCount: number;
    }>;
    /**
     * Add a middleware. Middlewares run before handlers and can
     * short-circuit by returning `block`. They cannot `modify` (no
     * payload to modify yet).
     */
    use(middleware: HookMiddleware): this;
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
    fire(eventName: HookEventName, payload: unknown): Promise<HookDecision>;
    /** List registered events (for diagnostics). */
    listEvents(): HookEventName[];
    /** Number of registered handlers (for diagnostics). */
    size(): number;
    /**
     * Remove all handlers and middlewares. Test-only utility;
     * production code should not call this in normal flow.
     */
    clear(): void;
    /**
     * Test if a handler's `match` clause matches the payload.
     * A handler with no `match` matches everything.
     */
    private matchHandler;
}
/**
 * The default registry. Handlers register into this at module load.
 * The orchestrator fires events through this at runtime.
 *
 * Tests should not use this; create a local `new HookRegistry()` per
 * test for isolation.
 */
export declare const defaultRegistry: HookRegistry;
//# sourceMappingURL=registry.d.ts.map