/**
 * Phase 60F — thin lab node factory (identity labels for the in-process lab).
 * Full libp2p nodes remain in phase13-e2e-harness / chain-three-home-smoke.
 */
import { createAgentNetworkLabRuntime, type AgentNetworkLabRuntime, type LabNode } from "./lab-runtime.js";

export type { LabNode, AgentNetworkLabRuntime };

export function createLabNodes(): AgentNetworkLabRuntime {
  return createAgentNetworkLabRuntime();
}
