/**
 * @envoymesh/agent-adapter — public API.
 *
 * Exports:
 * - `AgentAdapter` (interface) — the canonical adapter contract.
 * - `BuildManifestInput`, `ExecuteInput`, `VerifyInput` — typed inputs
 *   for the three adapter methods.
 * - `AdapterRegistry` (class) — process-level registry of adapters.
 * - `defaultRegistry` — the singleton registry adapters register into.
 * - `DuplicateAdapterError` — thrown on duplicate registration.
 *
 * **No Zod schemas here.** The wire-format schemas live in
 * `@envoymesh/protocol` (this package depends on the protocol, not
 * the other way around). This package is the *interface* layer; the
 * protocol is the *contract* layer.
 */

export {
  AdapterRegistry,
  DuplicateAdapterError,
  defaultRegistry,
} from "./runtime-registry.js";

export { OpenClawAdapter, OPENCLAW_SKILLS } from "./openclaw-adapter.js";
export type { OpenClawAdapterInput } from "./openclaw-adapter.js";

export { PiAdapter, PI_SKILLS, PI_RESULT_SCHEMA_REF, PI_LOOP_THRESHOLD } from "./pi-adapter.js";
export type { PiAdapterInput, PiRunResult, PiTraceCall } from "./pi-adapter.js";
export {
  detectLoop,
  detectDestructiveCommand,
} from "./pi-adapter.js";

export {
  CrossAgentDisagreementVerifier,
  CROSS_AGENT_PASS_THRESHOLD,
  CROSS_AGENT_PARTIAL_THRESHOLD,
  defaultSemanticSimilarity,
  extractConclusion,
} from "./cross-agent-verifier.js";
export type { CrossAgentVerifyInput, SemanticSimilarityFn } from "./cross-agent-verifier.js";

export type {
  AgentAdapter,
  BuildManifestInput,
  ExecuteInput,
  VerifyInput,
} from "./agent-adapter.js";
