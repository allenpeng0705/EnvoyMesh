/**
 * ToolRegistry — the in-memory store of tools the agent can call.
 *
 * **Design doc:** `docs/design.md` §10.
 *
 * **Why a registry instead of a plain object?** Tool lookup is
 * hot (the agent calls it on every tool_call in the model's
 * response). A `Map` gives O(1) lookup; a plain object would
 * also work but loses the discipline of a single API.
 *
 * **Why a class instead of free functions?** Test isolation. A
 * fresh `new ToolRegistry()` per test avoids the "passes in
 * isolation, fails in suite" trap of module-level state. (Per
 * `agent-memory` rule: fire-and-forget tests need reset hooks.
 * Classes give us a natural reset by re-instantiating.)
 *
 * **Stability:** the public API is `register`, `get`, `has`,
 * `list`, `unregister`, `clear`. All additive; no schema break.
 */
import { z } from "zod";
import type { Tool } from "./types.js";
/** Thrown when registering a tool with a name that's already taken. */
export declare class DuplicateToolError extends Error {
    constructor(name: string);
}
export declare class ToolRegistry {
    private tools;
    /**
     * Register a tool. Throws `DuplicateToolError` if a tool with
     * the same name is already registered. The `name` on the tool
     * is the source of truth — the caller can't register it under
     * a different key.
     *
     * **Type erasure:** we accept any `Tool<TParams>`. The
     * registry stores them as `Tool<z.ZodTypeAny>`; the type-narrowed
     * schema is preserved on the tool instance for `safeParse` at
     * dispatch time. This lets us store heterogeneous tools in one
     * Map without the union breaking `register`.
     */
    register(tool: Tool<z.ZodTypeAny>): this;
    /**
     * Look up a tool by name. Returns `undefined` if not found.
     * The agent uses this to dispatch model-emitted tool calls.
     */
    get(name: string): Tool | undefined;
    /** Check if a tool is registered. */
    has(name: string): boolean;
    /** List all registered tool names (for diagnostics). */
    names(): string[];
    /** List all registered tools (for the system prompt's tool list). */
    list(): Tool[];
    /** Number of registered tools. */
    size(): number;
    /**
     * Unregister a tool by name. Returns `true` if removed, `false`
     * if not found. Idempotent. Useful for tests and for runtime
     * capability reconfiguration.
     */
    unregister(name: string): boolean;
    /** Remove all tools. Test-only utility. */
    clear(): void;
}
//# sourceMappingURL=registry.d.ts.map