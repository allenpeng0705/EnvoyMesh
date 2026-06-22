/**
 * Phase 43H — CSV export of chain cost breakdown.
 */

import type { ChainState } from "./chain-orchestrator.js";

export function chainCostsToCsv(state: ChainState): string {
  const rows: string[][] = [
    ["subtaskId", "workerPeerId", "workerOwnerId", "committedUsd", "status", "objective"],
  ];
  for (const [subtaskId, subtask] of state.subtasks.entries()) {
    const award = state.awards.get(subtaskId);
    const partial = state.partials.get(subtaskId);
    let status = "pending";
    if (state.cancelledSubtasks.has(subtaskId)) status = "cancelled";
    else if (partial?.partial.isFinal) status = "completed";
    else if (award) status = "running";
    else if ([...state.bids.keys()].some((k) => k.startsWith(`${subtaskId}::`))) status = "bidding";

    rows.push([
      subtaskId,
      award?.workerPeerId ?? "",
      award ? state.bids.get(`${subtaskId}::${award.workerPeerId}`)?.workerOwnerId ?? "" : "",
      award ? String(award.acceptedCostUsd) : "",
      status,
      subtask.objective.replace(/"/g, '""'),
    ]);
  }
  const snap = state.ledger.snapshot();
  rows.push([]);
  rows.push(["chainId", state.chainId]);
  rows.push(["budgetMaxUsd", String(snap.maxChainCostUsd)]);
  rows.push(["committedUsd", String(snap.committedUsd)]);
  rows.push(["reservedUsd", String(snap.reservedUsd)]);

  return rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
}
