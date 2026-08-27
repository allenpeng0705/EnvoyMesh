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
  resolveEnvoyHarnessHostModel,
  resolveEnvoyHarnessHostConfig,
  type EnvoyHarnessHostConfig,
  type EnvoyHarnessProviderId,
} from "./model.js";

export { ENVOY_HARNESS_RUNTIME_SKILLS } from "./manifest.js";

// Phase 8 Step 2 — the host-side `LocalRuntimeBridge`
// implementation. The envoy-harness adapter's
// `LocalCrossRuntimeSubmitter` calls back through this
// when a sub-agent targets a different local runtime
// (Built-in OpenClaw today; future runtimes slot in).
export {
  LocalRuntimeRegistry,
  type CreateLocalRuntimeRegistryOptions,
} from "./local-runtime-registry.js";

// Phase 8 Step 2 / b3 — the real `askEnvoyHarness`
// runtime. Constructs the full envoy-harness stack
// (ModelAdapter + LocalMeshSubmitter + LocalRuntimeRegistry
// + LocalCrossRuntimeSubmitter + EnvoyHarnessAdapter) and
// returns a text-in/text-out `ask` closure. The host's
// `NodeServiceImpl.askEnvoyHarness` uses this in place of
// the Step 1 stub that threw `envoy_harness_stub_phase_8_step_1`.
export {
  createRealEnvoyHarnessRuntime,
  parseProviderHint,
  type CreateRealEnvoyHarnessRuntimeOptions,
  type RealEnvoyHarnessAskOptions,
  type RealEnvoyHarnessRuntime,
} from "./runtime.js";

export {
  ACP_SAFE_TOOLS,
  isAcpSafeTool,
  shouldAskAcpTool,
  type PiAutoRunPolicy,
} from "./acp-policy.js";

// Phase 8 Step 2 / b2 — the OpenClaw → envoy-harness
// bridge skill. The host's AN engine dispatch (or a
// future Step 5 signal-based router) can swap
// `askOpenClaw` with this skill when the OpenClaw side
// decides to delegate to envoy-harness. v0 exposes the
// seam; the wiring into OpenClaw's actual ask path
// lands in Step 5.
export {
  createBridgeToEnvoyHarnessSkill,
  type BridgeToEnvoyHarnessSkillAskOptions,
  type CreateBridgeToEnvoyHarnessSkillOptions,
  type OpenClawToEnvoyHarnessBridge,
} from "./bridge-to-envoy-harness-skill.js";

// Phase G / 12b — ACP host for Tauri + interactive sessions
export {
  createEnvoyHarnessAcpHost,
  resolveEnvoyHarnessAcpCommand,
  type AcpPermissionDecision,
  type AcpPermissionRequest,
  type AcpTranscriptUpdate,
  type EnvoyHarnessAcpHost,
  type EnvoyHarnessAcpHostOptions,
} from "./acp-host.js";
