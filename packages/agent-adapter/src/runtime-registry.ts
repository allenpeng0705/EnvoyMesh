/**
 * AdapterRegistry — process-level registry of `AgentAdapter` instances.
 *
 * **Why this exists:** the orchestrator dispatches to adapters by runtime
 * (`AgentRuntime`). It does not import concrete adapter classes; it only
 * imports the `AgentAdapter` interface from this package. At runtime, the
 * orchestrator asks the registry "give me the adapter for runtime X".
 *
 * **Registration pattern:** each adapter module (envoy-harness-adapter,
 * OpenClawAdapter, Pi adapter, ...) registers its adapter at module load:
 *
 * ```ts
 * // packages/envoy-harness-adapter/src/index.ts
 * import { defaultRegistry } from "@envoymesh/agent-adapter";
 * import { newEnvoyHarnessAdapter } from "./adapter.js";
 * defaultRegistry.register(newEnvoyHarnessAdapter());
 * ```
 *
 * The orchestrator then dispatches via `defaultRegistry.get(runtime)`.
 *
 * **Why a class and not module-level state:** tests need to create fresh
 * registries per test. Module-level state leaks between tests and is
 * notoriously hard to reset. The class-based design is the same shape
 * as a `Map<AgentRuntime, AgentAdapter>` with safety rails.
 *
 * **Why error on duplicate registration:** if two adapters register the
 * same runtime, the orchestrator cannot know which one to dispatch to.
 * Better to fail loudly at registration time than to silently shadow
 * one adapter with another.
 */

import type { AgentRuntime } from "@envoymesh/protocol";

import type { AgentAdapter } from "./agent-adapter.js";

/**
 * Thrown when an adapter is registered for a runtime that already has
 * an adapter. The message includes both runtime values so the operator
 * can find the duplicate.
 */
export class DuplicateAdapterError extends Error {
  constructor(
    public readonly runtime: AgentRuntime,
    public readonly existing: AgentAdapter,
  ) {
    super(
      `adapter for runtime '${runtime}' is already registered ` +
        `(existing adapter.runtime='${existing.runtime}')`,
    );
    this.name = "DuplicateAdapterError";
  }
}

/**
 * Process-level registry of `AgentAdapter` instances, indexed by runtime.
 *
 * The class is not thread-safe. Adapter registration is expected to
 * happen at module load (single-threaded) and lookup is expected to
 * happen during the orchestrator's run loop (also single-threaded for
 * the in-process mesh).
 */
export class AdapterRegistry {
  private readonly adapters = new Map<AgentRuntime, AgentAdapter>();

  /**
   * Register an adapter. Errors if an adapter is already registered for
   * the same runtime. To replace an adapter, call `unregister(runtime)`
   * first.
   *
   * @throws {DuplicateAdapterError} if the runtime is already registered.
   */
  register(adapter: AgentAdapter): this {
    const existing = this.adapters.get(adapter.runtime);
    if (existing) {
      throw new DuplicateAdapterError(adapter.runtime, existing);
    }
    this.adapters.set(adapter.runtime, adapter);
    return this;
  }

  /**
   * Unregister an adapter by runtime. Returns the unregistered adapter
   * (if any), or `undefined` if no adapter was registered. Idempotent.
   */
  unregister(runtime: AgentRuntime): AgentAdapter | undefined {
    const existing = this.adapters.get(runtime);
    if (existing) {
      this.adapters.delete(runtime);
    }
    return existing;
  }

  /**
   * Get an adapter by runtime. Returns `undefined` if no adapter is
   * registered. The orchestrator treats this as "this node cannot
   * run tasks for this runtime".
   */
  get(runtime: AgentRuntime): AgentAdapter | undefined {
    return this.adapters.get(runtime);
  }

  /**
   * Check whether a runtime has a registered adapter. Equivalent to
   * `get(runtime) !== undefined` but slightly clearer at call sites.
   */
  has(runtime: AgentRuntime): boolean {
    return this.adapters.has(runtime);
  }

  /**
   * List all registered runtimes. The order is insertion order. The
   * orchestrator may use this to enumerate available skills across
   * runtimes for diagnostics or routing.
   */
  list(): AgentRuntime[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters. The order is insertion order.
   */
  listAdapters(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Number of registered adapters. Useful for assertions in tests and
   * for diagnostics.
   */
  get size(): number {
    return this.adapters.size;
  }

  /**
   * Remove all registered adapters. Test-only utility; production code
   * should not call this in normal flow. Kept on the class so it works
   * on test instances too.
   */
  clear(): void {
    this.adapters.clear();
  }
}

/**
 * The default registry. Adapters register into this at module load.
 * The orchestrator looks up adapters from this at dispatch time.
 *
 * This is a process-level singleton. Tests should not use it; create
 * a local `new AdapterRegistry()` per test instead.
 */
export const defaultRegistry = new AdapterRegistry();
