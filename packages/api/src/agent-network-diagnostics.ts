/**
 * Phase 60F — Agent Network diagnostics + no-spend simulation types.
 *
 * Design: docs/agent-network-next-generation-design.md §11
 */

import type { ChainTeamStrategyId } from "./chain-team-strategy.js";

export type AgentNetworkSimulationMode =
  | "readiness"
  | "dry-plan"
  | "failover"
  | "verification"
  | "recovery";

export type AgentNetworkDiagnosticsWorker = {
  peerId: string;
  ownerId?: string;
  membershipOk: boolean;
  leaseReady: boolean;
  runtimeReady: boolean;
  exclusionReasons: string[];
};

export type AgentNetworkDiagnosticsSnapshot = {
  at: string;
  joinEnabled: boolean;
  localFeatures: string[];
  workers: AgentNetworkDiagnosticsWorker[];
  warnings: string[];
};

export type AgentNetworkSimulationParams = {
  mode: AgentNetworkSimulationMode;
  goal?: string;
  teamStrategyId?: ChainTeamStrategyId;
  /** Synthetic fault labels for failover/recovery modes. */
  injectFault?:
    | "worker_offline"
    | "relay_unavailable"
    | "runtime_down"
    | "assigner_restarted";
};

export type AgentNetworkSimulationResult = {
  simulationId: string;
  mode: AgentNetworkSimulationMode;
  at: string;
  /** Always true for this API — no envelopes, model calls, or reputation writes. */
  noSpend: true;
  summary: string;
  candidates: Array<{
    peerId: string;
    score?: number;
    exclusionReasons: string[];
  }>;
  predictedFailover?: { fromPeerId?: string; toPeerId?: string; reason: string };
  recovery?: { phase: string; note: string };
  warnings: string[];
};

export function createAgentNetworkSimulationId(): string {
  return `an_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Redact peer ids for export (keep short suffix). */
export function redactAgentNetworkDiagnosticsJson(snapshot: unknown): string {
  const raw = JSON.stringify(snapshot, null, 2);
  return raw.replace(/envoy_[a-z0-9_]{12,}/gi, (m) => `${m.slice(0, 14)}…`);
}
