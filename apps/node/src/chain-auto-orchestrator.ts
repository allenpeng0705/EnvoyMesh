/**
 * Phase 43A/43C — Auto-evaluate bids and auto-complete chains when ready.
 */

import { derivePeerId } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/local-store";

import {
  evaluateBids,
  publishChainReport,
  sendChainAccept,
  synthesizeChain,
  type ChainOrchestratorHandlerDeps,
  type ChainState,
  type EvaluateBidsResult,
} from "./chain-orchestrator.js";

export function allActiveSubtasksHaveFinalPartials(state: ChainState): boolean {
  if (state.subtasks.size === 0) return false;
  for (const subtaskId of state.subtasks.keys()) {
    if (state.cancelledSubtasks.has(subtaskId)) continue;
    const partial = state.partials.get(subtaskId);
    if (!partial?.partial.isFinal) return false;
  }
  return true;
}

export function subtasksAwaitingAward(state: ChainState): string[] {
  const pending: string[] = [];
  for (const subtaskId of state.subtasks.keys()) {
    if (state.cancelledSubtasks.has(subtaskId)) continue;
    if (state.awards.has(subtaskId)) continue;
    const hasBid = [...state.bids.keys()].some((k) => k.startsWith(`${subtaskId}::`));
    if (hasBid) pending.push(subtaskId);
  }
  return pending;
}

export async function evaluateAndAcceptBestBid(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
  policy: "composite" | "cheapest" | "fastest" = "composite",
): Promise<EvaluateBidsResult> {
  const result = await evaluateBids(deps, state, { subtaskId, policy });
  if (!result.ok) return result;
  await sendChainAccept(deps, result.bid.workerPeerId, result.award);
  deps.audit.record({
    type: "chain.awarded",
    outcome: "allow",
    intent: "task.chain.accept",
    correlationId: state.chainId,
    summary: `subtask=${subtaskId} worker=${result.bid.workerPeerId} cost=${result.bid.proposedCostUsd}`,
  });
  return result;
}

export async function tryCompleteChainIfReady(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  profile: NodeProfile,
): Promise<{ ok: boolean; published: boolean }> {
  if (state.published || state.chainCancelled) {
    return { ok: false, published: false };
  }
  if (!allActiveSubtasksHaveFinalPartials(state)) {
    return { ok: false, published: false };
  }
  const synth = await synthesizeChain(deps, state, "concatenate");
  if (!synth.ok) return { ok: false, published: false };

  const ownerPeerId = derivePeerId(profile.device.publicKeyPem);
  const pub = await publishChainReport(deps, state, synth.report, ownerPeerId);
  return { ok: pub.ok, published: pub.ok };
}

export function chainBudgetWarningLevel(state: ChainState): "ok" | "warn" | "exceeded" {
  const snap = state.ledger.snapshot();
  const max = snap.maxChainCostUsd;
  if (max <= 0) return "ok";
  const spent = snap.committedUsd + snap.reservedUsd;
  if (spent >= max) return "exceeded";
  if (spent >= max * 0.8) return "warn";
  return "ok";
}
