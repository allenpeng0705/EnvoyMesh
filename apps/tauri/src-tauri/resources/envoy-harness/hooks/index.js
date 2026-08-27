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
export { HookRegistry, defaultRegistry, } from "./registry.js";
export { runShellHandler, runModuleHandler } from "./runner.js";
// Phase B / Item 15.2: register a list of `HookHandlerSpec`
// from the config layer. Used by the one-shot runner to
// wire up hooks loaded from `--import-config`.
export { registerHooksFromConfig } from "./register-from-config.js";
//# sourceMappingURL=index.js.map