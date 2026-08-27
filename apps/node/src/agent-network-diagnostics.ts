/**
 * Phase 60F — no-spend Agent Network diagnostics + simulation.
 */

import {
  createAgentNetworkSimulationId,
  redactAgentNetworkDiagnosticsJson,
  type AgentNetworkDiagnosticsSnapshot,
  type AgentNetworkSimulationParams,
  type AgentNetworkSimulationResult,
} from "@envoymesh/api";
import { LOCAL_AGENT_CARD_PROTOCOL_FEATURES } from "@envoymesh/protocol";
import type { ChainOrchestrationContext } from "./node-service-chain-orchestration.js";
import { findAgentNetworkWorkersRanked } from "./node-service-chain-orchestration.js";

const lastSimulationById = new Map<string, AgentNetworkSimulationResult>();

function readJoinEnabled(cfg: unknown): boolean {
  if (!cfg || typeof cfg !== "object") return false;
  const row = cfg as Record<string, unknown>;
  if (row.capabilityProviderEnabled === true) return true;
  if (row.agentNetworkJoinEnabled === true) return true;
  const nested = row.agentNetwork;
  if (nested && typeof nested === "object" && (nested as { joinEnabled?: unknown }).joinEnabled === true) {
    return true;
  }
  // Common persisted shape: agentNetworkProfile present + membership tags.
  if (row.agentNetworkProfile && typeof row.agentNetworkProfile === "object") {
    const mem = (row.agentNetworkProfile as { membership?: unknown }).membership;
    if (Array.isArray(mem) && mem.length > 0) return true;
  }
  return false;
}

export async function agentNetworkDiagnosticsSnapshotViaRuntime(
  deps: ChainOrchestrationContext,
): Promise<AgentNetworkDiagnosticsSnapshot> {
  const at = new Date().toISOString();
  const warnings: string[] = [];
  let joinEnabled = false;
  try {
    joinEnabled = readJoinEnabled(await deps.getNodeConfig());
  } catch {
    /* ignore */
  }
  if (!joinEnabled) {
    warnings.push("Join Agent Network is off — workers will not publish leases.");
  }

  const workers: AgentNetworkDiagnosticsSnapshot["workers"] = [];
  try {
    const index = deps.getAgentNetworkMembershipIndex();
    const leases = deps.getChainSideState().workerLeases;
    for (const worker of index.listWorkers()) {
      const availability = leases.getAvailability(worker.peerId);
      const leaseReady = availability.state === "ready";
      workers.push({
        peerId: worker.peerId,
        ownerId: worker.ownerId,
        membershipOk: Array.isArray(worker.membership) && worker.membership.length > 0,
        leaseReady,
        runtimeReady: leaseReady,
        exclusionReasons: leaseReady ? [] : [`lease_${availability.state}`],
      });
    }
  } catch {
    warnings.push("Could not read membership index.");
  }

  return {
    at,
    joinEnabled,
    localFeatures: [...LOCAL_AGENT_CARD_PROTOCOL_FEATURES],
    workers,
    warnings,
  };
}

export async function agentNetworkSimulateViaRuntime(
  deps: ChainOrchestrationContext,
  params: AgentNetworkSimulationParams,
): Promise<AgentNetworkSimulationResult> {
  const snapshot = await agentNetworkDiagnosticsSnapshotViaRuntime(deps);
  const simulationId = createAgentNetworkSimulationId();
  const at = new Date().toISOString();
  const warnings = [
    ...snapshot.warnings,
    "Simulation — no work sent, no model spend, no reputation changes.",
  ];

  let candidates: AgentNetworkSimulationResult["candidates"] = snapshot.workers.map((w) => ({
    peerId: w.peerId,
    exclusionReasons: w.exclusionReasons,
  }));
  let summary = "Readiness check complete.";
  let predictedFailover: AgentNetworkSimulationResult["predictedFailover"];
  let recovery: AgentNetworkSimulationResult["recovery"];

  if (params.mode === "dry-plan") {
    const strategyId = params.teamStrategyId ?? "balanced";
    const skillHint =
      params.goal?.trim().toLowerCase().includes("code")
        ? "coding"
        : params.goal?.trim().toLowerCase().includes("write")
          ? "writing"
          : "research";
    try {
      const ranked = await findAgentNetworkWorkersRanked(deps, skillHint, undefined, {
        strategyId,
      });
      candidates = ranked.map((w) => ({
        peerId: w.peerId,
        score: w.score,
        exclusionReasons: w.exclusionReason
          ? [w.exclusionReason]
          : w.online
            ? []
            : ["offline"],
      }));
      const ready = candidates.filter((c) => c.exclusionReasons.length === 0);
      summary = params.goal?.trim()
        ? `Dry-plan for “${params.goal.trim().slice(0, 80)}” — ranked ${ready.length}/${candidates.length} with strategy ${strategyId}.`
        : `Dry-plan — ranked ${ready.length}/${candidates.length} worker(s) with strategy ${strategyId}.`;
    } catch {
      const ready = candidates.filter((c) => c.exclusionReasons.length === 0);
      warnings.push("Ranking unavailable — fell back to lease readiness only.");
      summary = params.goal?.trim()
        ? `Dry-plan for “${params.goal.trim().slice(0, 80)}” — ${ready.length} ready worker(s).`
        : `Dry-plan — ${ready.length} ready worker(s).`;
    }
  } else if (params.mode === "failover") {
    const ready = candidates.filter((c) => c.exclusionReasons.length === 0);
    const from = ready[0]?.peerId;
    const to = ready[1]?.peerId ?? ready[0]?.peerId;
    predictedFailover = {
      fromPeerId: from,
      toPeerId: to,
      reason: params.injectFault ?? "worker_offline",
    };
    summary = from
      ? `Failover simulation (label only): would replace ${from.slice(0, 16)}… → ${to?.slice(0, 16) ?? "none"}…`
      : "Failover simulation (label only): no ready workers to replace.";
  } else if (params.mode === "verification") {
    summary = "Verification simulation: rule fixtures only (no model call).";
  } else if (params.mode === "recovery") {
    recovery = {
      phase: params.injectFault === "assigner_restarted" ? "RECOVERING" : "idle",
      note: "Synthetic checkpoint (label only) — real reconcile would query worker receipts without re-awarding.",
    };
    summary = `Recovery simulation (label only) phase=${recovery.phase}.`;
  } else {
    const ready = candidates.filter((c) => c.exclusionReasons.length === 0);
    summary = `Readiness: ${ready.length}/${candidates.length} workers ready.`;
  }

  const result: AgentNetworkSimulationResult = {
    simulationId,
    mode: params.mode,
    at,
    noSpend: true,
    summary,
    candidates,
    ...(predictedFailover ? { predictedFailover } : {}),
    ...(recovery ? { recovery } : {}),
    warnings,
  };
  lastSimulationById.set(simulationId, result);
  if (lastSimulationById.size > 32) {
    const oldest = lastSimulationById.keys().next().value;
    if (oldest) lastSimulationById.delete(oldest);
  }
  return result;
}

export async function agentNetworkExportDiagnosticsViaRuntime(params: {
  simulationId?: string;
}): Promise<{ json: string }> {
  if (params.simulationId) {
    const sim = lastSimulationById.get(params.simulationId);
    if (sim) return { json: redactAgentNetworkDiagnosticsJson(sim) };
    return { json: redactAgentNetworkDiagnosticsJson({ error: "simulation_not_found" }) };
  }
  return {
    json: redactAgentNetworkDiagnosticsJson({
      note: "Pass simulationId from agentNetworkSimulate, or call snapshot first from the UI.",
    }),
  };
}
