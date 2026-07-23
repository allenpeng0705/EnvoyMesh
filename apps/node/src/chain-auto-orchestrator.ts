/**
 * Phase 43A/43C — Auto-evaluate bids and auto-complete chains when ready.
 * Phase 47 — outer iteration (B) + optional intra-round extend (A).
 */

import { derivePeerId } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/local-store";

import {
  allOpenRoundHaveFinalPartials,
  beginNextIterationRound,
  buildIterationPlanGoal,
  canExtendOpenRound,
  canStartNextRound,
  isExtendEnabled,
  isIterationEnabled,
  openRoundIdsOrAll,
  recordDraft,
  resolveIterationJudge,
  sealOpenRound,
  type ExtendStepInput,
  type IterationStopReason,
} from "./chain-iteration.js";
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
  // When iteration tracks an open round, only that round gates completion.
  if (state.iteration && state.iteration.openRoundSubtaskIds.length > 0) {
    return allOpenRoundHaveFinalPartials(state);
  }
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

export type TryCompleteChainOpts = {
  /**
   * Called when judge says continue and another outer round is allowed.
   * Must plan+launch new open-round subtasks (Assigner). Return ok=false to
   * fall through to terminal publish.
   */
  onContinueRound?: (state: ChainState) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Phase 47B — before seal/synth, Assigner may append capped dependent steps.
   * Return `{ extended: true }` after appending + launching; otherwise decline.
   */
  onMaybeExtend?: (
    state: ChainState,
  ) => Promise<{ ok: boolean; extended: boolean; error?: string; steps?: ExtendStepInput[] }>;
  /** Optional judge override (tests / LLM adapter). */
  judge?: (prompt: string) => Promise<string | null>;
};

function withIterationDraftSections<T extends { executiveSummary: string; sections?: Array<{ heading: string; bodyMarkdown: string; citations?: unknown[] }> }>(
  report: T,
  drafts: Array<{ round: number; summary: string }>,
): T {
  if (drafts.length <= 1) return report;
  const draftSections = drafts.map((d, i) => ({
    heading: i === drafts.length - 1 ? `Final (round ${d.round})` : `Draft ${d.round}`,
    bodyMarkdown: d.summary,
    citations: [] as Array<{ subtaskId: string; snippet: string }>,
  }));
  return {
    ...report,
    sections: [...draftSections, ...(report.sections ?? [])],
  };
}

export async function tryCompleteChainIfReady(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  profile: NodeProfile,
  opts: TryCompleteChainOpts = {},
): Promise<{
  ok: boolean;
  published: boolean;
  continued?: boolean;
  extended?: boolean;
  awaitingOwner?: boolean;
}> {
  if (state.published || state.chainCancelled) {
    return { ok: false, published: false };
  }
  if (state.iteration?.waitingForOwner) {
    return { ok: true, published: false, awaitingOwner: true };
  }
  if (!allActiveSubtasksHaveFinalPartials(state)) {
    return { ok: false, published: false };
  }

  // 47B — intra-round extend before synthesize/seal.
  if (isExtendEnabled(state) && canExtendOpenRound(state).ok && opts.onMaybeExtend) {
    const ext = await opts.onMaybeExtend(state);
    if (ext.ok && ext.extended) {
      deps.audit.record({
        type: "chain.iteration.extend",
        outcome: "record",
        intent: "task.chain.propose",
        correlationId: state.chainId,
        summary: `extendsInRound=${state.iteration?.extendsInRound ?? 0}/${state.iteration?.maxExtendsInRound ?? 0}`,
      });
      return { ok: true, published: false, extended: true };
    }
  }

  const roundIds = openRoundIdsOrAll(state);
  const synth = await synthesizeChain(deps, state, "concatenate", { subtaskIds: roundIds });
  if (!synth.ok) return { ok: false, published: false };

  // One-shot (default): publish immediately.
  if (!isIterationEnabled(state)) {
    const ownerPeerId = derivePeerId(profile.device.publicKeyPem);
    const pub = await publishChainReport(deps, state, synth.report, ownerPeerId);
    return { ok: pub.ok, published: pub.ok };
  }

  const it = state.iteration!;
  const draft = recordDraft(state, {
    summary: synth.report.executiveSummary,
    report: synth.report,
  });
  sealOpenRound(state);
  deps.audit.record({
    type: "chain.iteration.sealed",
    outcome: "record",
    intent: "task.chain.merge",
    correlationId: state.chainId,
    summary: `round=${draft.round}/${it.maxRounds} subtasks=${roundIds.length}`,
  });

  const judged = await resolveIterationJudge({
    state,
    draftSummary: draft.summary,
    judge: opts.judge,
  });
  draft.judge = { decision: judged.decision, reason: judged.reason };
  deps.audit.record({
    type: "chain.iteration.judge",
    outcome: "record",
    intent: "task.chain.merge",
    correlationId: state.chainId,
    summary: `decision=${judged.decision} reason=${judged.reason}`,
  });

  const gate = canStartNextRound(state);
  const wantContinue = judged.decision === "continue" && gate.ok;

  if (wantContinue && opts.onContinueRound) {
    const cont = await opts.onContinueRound(state);
    if (cont.ok) {
      deps.audit.record({
        type: "chain.iteration.round_started",
        outcome: "record",
        intent: "task.chain.propose",
        correlationId: state.chainId,
        summary: `round=${state.iteration?.round ?? "?"}/${it.maxRounds}`,
      });
      return { ok: true, published: false, continued: true };
    }
    it.stopReason = "no_workers";
  } else if (wantContinue && !opts.onContinueRound) {
    it.stopReason = "judge_stop";
  } else if (judged.decision === "ask_owner") {
    it.stopReason = "ask_owner";
    it.waitingForOwner = true;
    deps.audit.record({
      type: "chain.iteration.judge",
      outcome: "record",
      intent: "task.chain.merge",
      correlationId: state.chainId,
      summary: "awaiting_owner",
    });
    return { ok: true, published: false, awaitingOwner: true };
  } else if (judged.decision === "stop") {
    it.stopReason = "judge_stop";
  } else if (!gate.ok) {
    it.stopReason = gate.reason;
  } else {
    it.stopReason = "judge_stop";
  }

  const finalReport = withIterationDraftSections(
    it.drafts.at(-1)?.report ?? synth.report,
    it.drafts,
  );
  const ownerPeerId = derivePeerId(profile.device.publicKeyPem);
  const pub = await publishChainReport(deps, state, finalReport, ownerPeerId);
  if (pub.ok) {
    it.waitingForOwner = false;
    deps.audit.record({
      type: "chain.iteration.stopped",
      outcome: "record",
      intent: "task.chain.report",
      correlationId: state.chainId,
      summary: `stopReason=${it.stopReason ?? "judge_stop"} drafts=${it.drafts.length}`,
    });
  }
  return { ok: pub.ok, published: pub.ok, continued: false };
}

/** Phase 47C — owner resolves ask_owner hold. */
export async function resolveIterationOwnerDecision(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  profile: NodeProfile,
  decision: "stop" | "continue",
  opts: { onContinueRound?: TryCompleteChainOpts["onContinueRound"] } = {},
): Promise<{ ok: boolean; published?: boolean; continued?: boolean; error?: string }> {
  const it = state.iteration;
  if (!it?.waitingForOwner) {
    return { ok: false, error: "not_awaiting_owner" };
  }
  it.waitingForOwner = false;
  if (decision === "continue") {
    const gate = canStartNextRound(state);
    if (!gate.ok) {
      it.stopReason = gate.reason;
      const report = withIterationDraftSections(
        it.drafts.at(-1)?.report!,
        it.drafts,
      );
      const ownerPeerId = derivePeerId(profile.device.publicKeyPem);
      const pub = await publishChainReport(deps, state, report, ownerPeerId);
      return { ok: pub.ok, published: pub.ok, error: gate.reason };
    }
    if (!opts.onContinueRound) {
      return { ok: false, error: "continue_unavailable" };
    }
    const cont = await opts.onContinueRound(state);
    if (!cont.ok) return { ok: false, error: cont.error ?? "continue_failed" };
    return { ok: true, continued: true };
  }
  it.stopReason = "owner_stop";
  const report = withIterationDraftSections(it.drafts.at(-1)?.report!, it.drafts);
  const ownerPeerId = derivePeerId(profile.device.publicKeyPem);
  const pub = await publishChainReport(deps, state, report, ownerPeerId);
  return { ok: pub.ok, published: pub.ok };
}

/** Helper for Assigner continue-round: enriched goal for plan+assign. */
export function iterationReplanGoal(state: ChainState): string {
  const it = state.iteration;
  if (!it) return "";
  // Prompt should describe the *next* round number.
  const forPrompt = { ...it, round: Math.min(it.round + 1, it.maxRounds) };
  return buildIterationPlanGoal(it.goal, forPrompt);
}

export function markIterationRoundOpened(state: ChainState, newSubtaskIds: string[]): void {
  beginNextIterationRound(state, newSubtaskIds);
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

export type { IterationStopReason, ExtendStepInput };
