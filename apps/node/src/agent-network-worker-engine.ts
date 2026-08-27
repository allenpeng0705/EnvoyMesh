/**
 * Node-local Agent Network worker engine (docs/agent-network-engine.md Step 2).
 *
 * The home-node owner chooses OpenClaw, Ext Agent, or Envoy Harness for Team-job
 * execution on THIS node. The Team job creator / Assigner never picks engines.
 *
 * Phase 8 — `envoy-harness` joins the picker. The runtime lives in a
 * sibling monorepo and is wired in via `@envoymesh/envoy-harness-adapter`
 * (see `apps/node/src/agent-runtime-envoy/`). Q3 D: the Tauri user-prompt
 * default is still OpenClaw; the home-node owner has to opt into
 * envoy-harness explicitly via this picker (Step 5 — signal-based
 * opt-in — comes later). The live adapter executes through the same MAP
 * result and verification contracts as the other runtimes.
 */

export const AGENT_NETWORK_WORKER_ENGINES = [
  "openclaw",
  "ext",
  "envoy-harness",
] as const;
export type AgentNetworkWorkerEngine = (typeof AGENT_NETWORK_WORKER_ENGINES)[number];

export const DEFAULT_AGENT_NETWORK_WORKER_ENGINE: AgentNetworkWorkerEngine = "openclaw";

export function coerceAgentNetworkWorkerEngine(
  raw: unknown,
): AgentNetworkWorkerEngine {
  if (raw === "ext") return "ext";
  // Phase 8 — accept the new literal; coerce to openclaw only if the
  // persisted config is from a version that didn't know about it.
  if (raw === "envoy-harness") return "envoy-harness";
  return "openclaw";
}
