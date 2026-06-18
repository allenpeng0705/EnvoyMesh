/**
 * Phase 41G.4 — Chain cost summary CSV export.
 *
 * Writes a CSV with subtask, worker, cost, and duration columns
 * for a given chain. Usable via: npm run cli -- chain export-costs <chainId>
 *
 * @see docs/agent_network.md §13.2 (41G)
 */

import type { ChainState } from "./chain-orchestrator.js";

export interface CsvExportRow {
  subtaskId: string;
  capability: string;
  workerPeerId: string;
  costUsd: number;
  status: "pending" | "awarded" | "running" | "completed" | "cancelled" | "stalled";
  durationMs?: number;
  partialCount?: number;
}

/**
 * Extract CSV rows from a chain state snapshot.
 */
export function buildChainCsvRows(state: ChainState): CsvExportRow[] {
  const rows: CsvExportRow[] = [];

  for (const [subtaskId, subtask] of state.subtasks.entries()) {
    const award = state.awards.get(subtaskId);
    const partial = state.partials.get(subtaskId);
    const cancelled = state.cancelledSubtasks.has(subtaskId);
    const lastHb = state.lastHeartbeatAt.get(subtaskId);

    let status: CsvExportRow["status"] = "pending";
    if (cancelled) {
      status = "cancelled";
    } else if (partial) {
      status = "completed";
    } else if (award) {
      const now = Date.now();
      const stallMs = state.chainMandate.stallTimeoutMs ?? 120_000;
      if (lastHb !== undefined && now - lastHb > stallMs) {
        status = "stalled";
      } else {
        status = "running";
      }
    } else if (state.bids.has(subtaskId)) {
      status = "awarded";
    }

    rows.push({
      subtaskId,
      capability: subtask.requiredCapability,
      workerPeerId: award?.workerPeerId ?? "-",
      costUsd: award?.acceptedCostUsd ?? 0,
      status,
      durationMs: partial ? estimateDuration(partial.partial.createdAt) : undefined,
      partialCount: partial ? partial.partial.seq : 0,
    });
  }

  return rows.sort((a, b) => a.subtaskId.localeCompare(b.subtaskId));
}

/**
 * Format rows as a CSV string.
 */
export function formatCsv(rows: CsvExportRow[]): string {
  const header = "subtaskId,capability,workerPeerId,costUsd,status,durationMs,partialCount";
  const lines = [header];

  for (const row of rows) {
    lines.push([
      row.subtaskId,
      row.capability,
      row.workerPeerId,
      row.costUsd.toFixed(2),
      row.status,
      row.durationMs ?? "",
      row.partialCount ?? "",
    ].join(","));
  }

  return lines.join("\n");
}

function estimateDuration(etaAt?: string): number | undefined {
  if (!etaAt) return undefined;
  const ms = Date.parse(etaAt);
  if (!Number.isFinite(ms)) return undefined;
  return Math.max(0, ms - Date.now()); // rough estimate — real duration requires start time
}
