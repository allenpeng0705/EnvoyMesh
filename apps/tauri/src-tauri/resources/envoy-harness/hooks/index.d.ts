/**
 * @envoymesh/envoy-harness — hook system.
 *
 * Public API:
 * - `HookRegistry` (class) — register handlers per event.
 * - `HookMiddleware` (type) — pre-handler middleware.
 * - `defaultRegistry` (singleton) — adapters register into this.
 * - `runShellHandler` — execute a shell command handler.
 * - `runModuleHandler` — execute a TS module handler.
 * - `registerHooksFromConfig` — register a list of
 *   `HookHandlerSpec` (the config-layer shape) on a
 *   registry. Phase B / Item 15.2.
 *
 * The 12 hook events live in `../types.js` (design §5.4) and are
 * re-exported from `@envoymesh/envoy-harness` (the root index).
 */
export { HookRegistry, defaultRegistry, type HookMiddleware, } from "./registry.js";
export { runShellHandler, runModuleHandler } from "./runner.js";
export { registerHooksFromConfig } from "./register-from-config.js";
export type { HookDecision } from "../types.js";
//# sourceMappingURL=index.d.ts.map