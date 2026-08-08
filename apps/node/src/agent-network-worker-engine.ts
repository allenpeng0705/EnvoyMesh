/**
 * Node-local Agent Network worker engine (docs/agent-network-engine.md Step 2).
 *
 * The home-node owner chooses Built-in OpenClaw vs Ext Agent for Team-job
 * execution on THIS node. The Team job creator / Assigner never picks engines.
 */

export const AGENT_NETWORK_WORKER_ENGINES = ["openclaw", "ext"] as const;
export type AgentNetworkWorkerEngine = (typeof AGENT_NETWORK_WORKER_ENGINES)[number];

export const DEFAULT_AGENT_NETWORK_WORKER_ENGINE: AgentNetworkWorkerEngine = "openclaw";

export function coerceAgentNetworkWorkerEngine(
  raw: unknown,
): AgentNetworkWorkerEngine {
  if (raw === "ext") return "ext";
  return "openclaw";
}
