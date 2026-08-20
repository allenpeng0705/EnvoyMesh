/**
 * Phase 8 — `agent-runtime-envoy/` public surface.
 *
 * **Step 1 scope:** the registration call that wires the envoy-harness
 * runtime into EnvoyMesh's engine picker. The factory is a thin
 * wrapper around `createEnvoyHarnessAdapter` (see `./factory.ts`).
 *
 * **Where it's called from:** `apps/node/src/node-service-impl.ts`,
 * during the bootstrap path that builds the engine dispatch.
 * Step 1 doesn't auto-register (the node starts with
 * `isEnvoyHarnessReady() === false` regardless of whether the
 * registration ran); Step 5 (signal-based opt-in) is when the
 * registration becomes load-bearing.
 *
 * **Why a separate `registerEnvoyHarnessRuntime()` instead of
 * side-effect-on-import:** the registration takes a runtime config
 * (model, cwd, keys) that the host decides. Importing this module
 * from `node-service-impl` should not eagerly call the model
 * adapter picker — that would couple testability to global state.
 *
 * **Stability:** the public surface of `agent-runtime-envoy/` is
 * additive. New helpers in this directory don't break existing
 * callers; new exports from this `index.ts` are the only contract
 * the rest of `apps/node` depends on.
 */

export { createEnvoyHarnessAdapter } from "./factory.js";
export type { CreateEnvoyHarnessAdapterInput } from "./factory.js";

export {
  loadEnvoyHarnessRuntimeConfig,
  type EnvoyHarnessRuntimeConfig,
} from "./config.js";

export {
  resolveEnvoyHarnessProvider,
  type EnvoyHarnessProviderId,
} from "./model.js";

export { ENVOY_HARNESS_RUNTIME_SKILLS } from "./manifest.js";
