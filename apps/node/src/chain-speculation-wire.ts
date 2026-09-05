/**
 * Phase 60E — dual-award / cancel-loser wire path for speculative attempts.
 *
 * Kept out of `chain-orchestrator.ts` (module-size allowlist) so award/partial
 * seams stay thin call sites.
 */

import {
  resolveChainTeamStrategy,
  type ChainTeamStrategyId,
} from "@envoymesh/api";
import {
  ChainSubtaskAwardSchema,
  type ChainSubtaskAward,
  type TaskChainPartialPayload,
} from "@envoymesh/protocol";
import type {
  ChainAttemptState,
  ChainOrchestratorHandlerDeps,
  ChainState,
} from "./chain-orchestrator.js";
import {
  prepareSubtaskPropose,
  mergeProposeInputArtifacts,
  sendChainAccept,
  sendChainCancel,
  reassignStalledSubtask,
  isFailedWorkerFinalPartial,
} from "./chain-orchestrator.js";
import {
  buildJobInputFileArtifacts,
  jobInputsReadyForAward,
} from "./chain-input-delivery-runtime.js";
import {
  buildIntermediateFileArtifacts,
  intermediateArtifactsReadyForAward,
  preferDeliveredFileArtifacts,
} from "./chain-artifact-transfer.js";
import {
  createSpeculativeAttempt,
  decideSpeculationForSubtask,
  selectAmongSpeculativeFinals,
  classifySpeculativeFinalSelection,
  autoResolveSpeculativeDisagreement,
  speculativeLedgerKey,
  type SpeculativeFinalsContext,
} from "./chain-speculation.js";
import type { NamedArtifact, Verdict } from "@envoymesh/protocol";

/** How long to wait for a speculative sibling after the first final before selecting alone. */
export const SPECULATIVE_SIBLING_WAIT_MS = 60_000;

/** Build per-attempt verification context for speculative final selection. */
export function speculativeFinalsContext(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
): SpeculativeFinalsContext {
  return {
    verificationPassed: ({ attempt, partial }) => {
      if (!partial?.partial.isFinal) return false;
      if (isFailedWorkerFinalPartial(partial)) return false;
      const verdict = deps.chainVerify?.getVerdictForWorker?.(
        state.chainId,
        subtaskId,
        attempt.workerPeerId,
      );
      if (verdict !== undefined) {
        return verdict.kind === "pass" || verdict.kind === "partial";
      }
      return true;
    },
  };
}

/** Phase 61B — balanced + high criticality uses verify-only (one worker + verifier). */
export function requiresVerifyOnlyForSubtask(
  state: ChainState,
  subtaskId: string,
): boolean {
  const strategyId = resolveStrategyId(state);
  const strategy = resolveChainTeamStrategy(strategyId);
  const workers = state.workersBySubtask.get(subtaskId) ?? [];
  if (workers.length < 2) return false;
  const sensitivity = state.chainMandate.maxSensitivity ?? "public";
  const disclosureAllowed = sensitivity === "public" || sensitivity === "friends";
  const decision = decideSpeculationForSubtask({
    state,
    strategyId,
    maxAttemptsPerStep: strategy.constraints.maxAttemptsPerStep,
    independentWorkerCount: workers.length,
    disclosureAllowed,
  });
  return decision.ok && decision.mode === "verify_only";
}

/** Verify-only strategy unlocks dependents only after an explicit pass verdict. */
export function verifyOnlyAllowsAdvance(verdict: Verdict | undefined): boolean {
  return verdict?.kind === "pass";
}

export function resolveStrategyId(state: ChainState): ChainTeamStrategyId {
  const fromMandate = state.chainMandate.teamStrategyId;
  if (
    fromMandate === "balanced" ||
    fromMandate === "fastest" ||
    fromMandate === "cheapest" ||
    fromMandate === "highest-confidence" ||
    fromMandate === "privacy-local" ||
    fromMandate === "diverse-model"
  ) {
    return fromMandate;
  }
  return "balanced";
}

export function findAttemptForWorker(
  state: ChainState,
  subtaskId: string,
  workerPeerId: string,
  opts?: { includeTerminal?: boolean },
): ChainAttemptState | undefined {
  return [...state.attempts.values()].find((a) => {
    if (a.subtaskId !== subtaskId || a.workerPeerId !== workerPeerId) return false;
    if (opts?.includeTerminal) return true;
    return a.state !== "cancelled" && a.state !== "rejected" && a.state !== "lost";
  });
}

/**
 * Cancel in-flight speculative sibling (reassign / timeout / cleanup).
 * Clears `speculativeAwards`, marks attempts terminal, releases ledger key.
 */
export async function clearSpeculativeSibling(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
  reason: string,
): Promise<string[]> {
  const cancelled: string[] = [];
  const speculativeAward = state.speculativeAwards.get(subtaskId);
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  for (const a of state.attempts.values()) {
    if (a.subtaskId !== subtaskId || a.role !== "speculative") continue;
    if (a.state === "cancelled" || a.state === "lost" || a.state === "selected") continue;
    a.state = "cancelled";
    a.lastReason = reason;
    a.updatedAt = nowIso;
    state.journalEvent?.("attempt.state_changed", {
      attemptId: a.attemptId,
      subtaskId,
      state: "cancelled",
      reason,
    });
    cancelled.push(a.workerPeerId);
    await sendChainCancel(deps, a.workerPeerId, {
      chainId: state.chainId,
      subtaskId,
      reason,
      cancelledBy: "orchestrator",
      notifyWorkerPeerIds: [a.workerPeerId],
      createdAt: nowIso,
    });
  }
  if (speculativeAward && !cancelled.includes(speculativeAward.workerPeerId)) {
    cancelled.push(speculativeAward.workerPeerId);
    await sendChainCancel(deps, speculativeAward.workerPeerId, {
      chainId: state.chainId,
      subtaskId,
      reason,
      cancelledBy: "orchestrator",
      notifyWorkerPeerIds: [speculativeAward.workerPeerId],
      createdAt: nowIso,
    });
  }
  state.speculativeAwards.delete(subtaskId);
  state.hedgeSchedule.delete(subtaskId);
  await state.ledger.release(speculativeLedgerKey(subtaskId), reason);
  return cancelled;
}

function pickSpeculativeWorker(
  state: ChainState,
  primaryAward: ChainSubtaskAward,
  strategyId: ChainTeamStrategyId,
  opts?: { modelFamilyByPeer?: ReadonlyMap<string, string> },
): string | undefined {
  const subtaskId = primaryAward.subtaskId;
  const workers = state.workersBySubtask.get(subtaskId) ?? [];
  const candidates = workers.filter((w) => w !== primaryAward.workerPeerId);
  if (candidates.length === 0) return undefined;
  let speculativeWorker = candidates[0]!;
  if (strategyId === "diverse-model" && opts?.modelFamilyByPeer) {
    const primaryFamily = opts.modelFamilyByPeer.get(primaryAward.workerPeerId);
    if (primaryFamily) {
      const diverse = candidates.find((w) => {
        const fam = opts.modelFamilyByPeer!.get(w);
        return fam && fam !== primaryFamily;
      });
      if (diverse) speculativeWorker = diverse;
    }
  }
  return speculativeWorker;
}

async function launchSpeculativeSiblingAward(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  primaryAward: ChainSubtaskAward,
  speculativeWorker: string,
): Promise<
  | { launched: true; speculativeAward: ChainSubtaskAward; attemptId: string }
  | { launched: false; reason: string }
> {
  const subtaskId = primaryAward.subtaskId;
  const now = deps.now?.() ?? new Date();
  const costCeiling =
    state.subtasks.get(subtaskId)?.costCeilingUsd ??
    state.chainMandate.costCeilingUsd ??
    primaryAward.acceptedCostUsd;
  const acceptedCostUsd = Math.max(0, Math.min(costCeiling, primaryAward.acceptedCostUsd || costCeiling));

  const ledgerKey = speculativeLedgerKey(subtaskId);
  const reserved = await state.ledger.reserve(ledgerKey, speculativeWorker, acceptedCostUsd);
  if (!reserved.ok) {
    return { launched: false, reason: `budget_${reserved.reason}` };
  }

  const attempt = createSpeculativeAttempt(state, {
    subtaskId,
    workerPeerId: speculativeWorker,
    acceptedCostUsd,
    now,
  });

  const award = ChainSubtaskAwardSchema.parse({
    version: "0.1",
    subtaskId,
    chainId: state.chainId,
    workerPeerId: speculativeWorker,
    negotiationRound: primaryAward.negotiationRound,
    acceptedCostUsd,
    deadlineAt: primaryAward.deadlineAt,
    createdAt: now.toISOString(),
    attemptId: attempt.attemptId,
  });

  if (deps.onAwardAccepted) {
    try {
      await deps.onAwardAccepted(state, subtaskId, speculativeWorker);
    } catch (err) {
      console.warn(
        `[chain.speculation] onAwardAccepted failed for ${state.chainId}/${subtaskId}:`,
        err,
      );
    }
  }
  const inputsReady = jobInputsReadyForAward(state, subtaskId, speculativeWorker);
  if (!inputsReady.ok) {
    await state.ledger.release(ledgerKey, inputsReady.reason);
    attempt.state = "lost";
    attempt.lastReason = inputsReady.reason;
    attempt.updatedAt = now.toISOString();
    return { launched: false, reason: inputsReady.reason };
  }
  const artsReady = intermediateArtifactsReadyForAward(
    state,
    subtaskId,
    speculativeWorker,
  );
  if (!artsReady.ok) {
    await state.ledger.release(ledgerKey, artsReady.reason);
    attempt.state = "lost";
    attempt.lastReason = artsReady.reason;
    attempt.updatedAt = now.toISOString();
    return { launched: false, reason: artsReady.reason };
  }

  const subtask = state.subtasks.get(subtaskId);
  if (!subtask) {
    await state.ledger.release(ledgerKey, "no_subtask");
    attempt.state = "lost";
    attempt.lastReason = "no_subtask";
    return { launched: false, reason: "no_subtask" };
  }

  const prepared = prepareSubtaskPropose(state, subtask);
  const interArts = buildIntermediateFileArtifacts(
    state,
    subtaskId,
    speculativeWorker,
  );
  const preferred = preferDeliveredFileArtifacts(prepared.inputArtifacts, interArts);
  const jobArts = buildJobInputFileArtifacts(state, subtaskId, speculativeWorker) as NamedArtifact[];
  const inputArtifacts = mergeProposeInputArtifacts(preferred, jobArts);
  const sent = await sendChainAccept(deps, speculativeWorker, award, prepared.subtask, inputArtifacts);
  if (!sent) {
    await state.ledger.release(ledgerKey, "speculative_accept_send_failed");
    attempt.state = "lost";
    attempt.lastReason = "speculative_accept_send_failed";
    attempt.updatedAt = now.toISOString();
    return { launched: false, reason: "send_failed" };
  }

  await state.ledger.tryCommit(ledgerKey);
  state.speculativeAwards.set(subtaskId, award);
  state.hedgeSchedule.delete(subtaskId);
  state.journalEvent?.("transport.accept_sent", {
    subtaskId,
    workerPeerId: speculativeWorker,
    attemptId: attempt.attemptId,
    role: "speculative",
    ok: true,
  });
  deps.audit.record({
    type: "chain.awarded",
    outcome: "allow",
    intent: "task.chain.accept",
    correlationId: state.chainId,
    remotePeerId: speculativeWorker,
    summary:
      `speculative_dual subtask=${subtaskId.slice(0, 12)}` +
      ` worker=${speculativeWorker.slice(0, 14)} attempt=${attempt.attemptId.slice(0, 16)}`,
  });
  return { launched: true, speculativeAward: award, attemptId: attempt.attemptId };
}

export function cancelHedgedSpeculation(state: ChainState, subtaskId: string): void {
  state.hedgeSchedule.delete(subtaskId);
}

/**
 * Phase 61A — schedule a hedged sibling when `fastest` gates pass.
 * The sibling is launched later by `maybeLaunchDueHedgedAwards`.
 */
export function scheduleHedgedSpeculation(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  primaryAward: ChainSubtaskAward,
  opts?: { predictedP75LatencyMs?: number },
): void {
  const subtaskId = primaryAward.subtaskId;
  if (state.speculativeAwards.has(subtaskId)) return;
  if (state.speculationLocked.has(subtaskId)) return;
  if (state.hedgeSchedule.has(subtaskId)) return;

  const strategyId = resolveStrategyId(state);
  const strategy = resolveChainTeamStrategy(strategyId);
  const workers = state.workersBySubtask.get(subtaskId) ?? [];
  const candidates = workers.filter((w) => w !== primaryAward.workerPeerId);
  if (candidates.length === 0) return;

  const sensitivity = state.chainMandate.maxSensitivity ?? "public";
  const disclosureAllowed = sensitivity === "public" || sensitivity === "friends";

  const decision = decideSpeculationForSubtask({
    state,
    strategyId,
    maxAttemptsPerStep: strategy.constraints.maxAttemptsPerStep,
    independentWorkerCount: 1 + candidates.length,
    disclosureAllowed,
    predictedP75LatencyMs: opts?.predictedP75LatencyMs,
  });
  if (!decision.ok || decision.mode !== "hedged" || decision.hedgeAfterMs == null) {
    return;
  }

  const nowMs = (deps.now?.() ?? new Date()).getTime();
  state.hedgeSchedule.set(subtaskId, {
    primaryAward,
    hedgeAfterMs: decision.hedgeAfterMs,
    scheduledAtMs: nowMs,
  });
  state.journalEvent?.("speculation.hedge_scheduled", {
    subtaskId,
    hedgeAfterMs: decision.hedgeAfterMs,
    scheduledAtMs: nowMs,
  });
}

/** Phase 61A — launch hedged siblings whose delay has elapsed. */
export async function maybeLaunchDueHedgedAwards(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  opts?: { modelFamilyByPeer?: ReadonlyMap<string, string> },
): Promise<Array<{ subtaskId: string; launched: boolean; reason?: string }>> {
  const results: Array<{ subtaskId: string; launched: boolean; reason?: string }> = [];
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  for (const [subtaskId, row] of [...state.hedgeSchedule.entries()]) {
    if (state.cancelledSubtasks.has(subtaskId)) {
      state.hedgeSchedule.delete(subtaskId);
      continue;
    }
    if (state.partials.has(subtaskId)) {
      state.hedgeSchedule.delete(subtaskId);
      continue;
    }
    if (state.speculativeAwards.has(subtaskId)) {
      state.hedgeSchedule.delete(subtaskId);
      continue;
    }
    if (nowMs - row.scheduledAtMs < row.hedgeAfterMs) continue;

    state.hedgeSchedule.delete(subtaskId);
    const strategyId = resolveStrategyId(state);
    const speculativeWorker = pickSpeculativeWorker(state, row.primaryAward, strategyId, opts);
    if (!speculativeWorker) {
      results.push({ subtaskId, launched: false, reason: "no_backup_worker" });
      continue;
    }
    const launched = await launchSpeculativeSiblingAward(
      deps,
      state,
      row.primaryAward,
      speculativeWorker,
    );
    results.push({
      subtaskId,
      launched: launched.launched,
      reason: launched.launched ? undefined : launched.reason,
    });
  }
  return results;
}

/** Best-effort immediate dual + hedged schedule after a primary accept. */
export async function maybeScheduleSpeculationAfterAward(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  primaryAward: ChainSubtaskAward,
  opts?: { modelFamilyByPeer?: ReadonlyMap<string, string>; predictedP75LatencyMs?: number },
): Promise<void> {
  await maybeLaunchImmediateDualAward(deps, state, primaryAward, opts).catch((err) => {
    console.warn(
      `[chain.speculation] dual award failed for ${state.chainId}/${primaryAward.subtaskId}:`,
      err,
    );
  });
  scheduleHedgedSpeculation(deps, state, primaryAward, opts);
}

/**
 * After a primary accept is on the wire, optionally award a second independent
 * worker as `role: speculative` (immediate_dual only).
 */
export async function maybeLaunchImmediateDualAward(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  primaryAward: ChainSubtaskAward,
  opts?: { modelFamilyByPeer?: ReadonlyMap<string, string> },
): Promise<
  | { launched: true; speculativeAward: ChainSubtaskAward; attemptId: string }
  | { launched: false; reason: string }
> {
  const subtaskId = primaryAward.subtaskId;
  if (state.speculativeAwards.has(subtaskId)) {
    return { launched: false, reason: "already_speculating" };
  }
  if (state.speculationLocked.has(subtaskId)) {
    return { launched: false, reason: "selection_locked" };
  }

  const strategyId = resolveStrategyId(state);
  const strategy = resolveChainTeamStrategy(strategyId);
  const workers = state.workersBySubtask.get(subtaskId) ?? [];
  const candidates = workers.filter((w) => w !== primaryAward.workerPeerId);
  if (candidates.length === 0) {
    return { launched: false, reason: "no_backup_worker" };
  }

  const sensitivity = state.chainMandate.maxSensitivity ?? "public";
  const disclosureAllowed = sensitivity === "public" || sensitivity === "friends";

  const decision = decideSpeculationForSubtask({
    state,
    strategyId,
    maxAttemptsPerStep: strategy.constraints.maxAttemptsPerStep,
    independentWorkerCount: 1 + candidates.length,
    disclosureAllowed,
  });
  if (!decision.ok || decision.mode !== "immediate_dual") {
    return {
      launched: false,
      reason: decision.ok ? `mode_${decision.mode}` : decision.reason,
    };
  }

  const speculativeWorker = pickSpeculativeWorker(state, primaryAward, strategyId, opts);
  if (!speculativeWorker) {
    return { launched: false, reason: "no_backup_worker" };
  }

  return launchSpeculativeSiblingAward(deps, state, primaryAward, speculativeWorker);
}

/**
 * Route a partial onto the matching attempt. When selection is already locked,
 * late finals are retained in `partialsByAttempt` without replacing the selected
 * `state.partials` artifact.
 */
export function ingestSpeculativePartial(
  state: ChainState,
  payload: TaskChainPartialPayload,
  now = new Date(),
): {
  attempt?: ChainAttemptState;
  blockedLateOverwrite: boolean;
} {
  const subtaskId = payload.partial.subtaskId;
  const attempt =
    findAttemptForWorker(state, subtaskId, payload.partial.workerPeerId) ??
    findAttemptForWorker(state, subtaskId, payload.partial.workerPeerId, {
      includeTerminal: true,
    });
  if (attempt) {
    state.partialsByAttempt.set(attempt.attemptId, payload);
    if (attempt.state !== "cancelled" && attempt.state !== "rejected" && attempt.state !== "lost") {
      const nextState = payload.partial.isFinal ? "final_received" : "running";
      // Preserve first final_received timestamp so sibling wait timeout does not reset.
      if (attempt.state !== nextState) {
        attempt.state = nextState;
        attempt.updatedAt = now.toISOString();
      } else if (nextState !== "final_received") {
        attempt.updatedAt = now.toISOString();
      }
      attempt.lastPartialSeq = payload.partial.seq;
      state.journalEvent?.("attempt.partial_received", {
        attemptId: attempt.attemptId,
        subtaskId: attempt.subtaskId,
        workerPeerId: payload.partial.workerPeerId,
        seq: payload.partial.seq,
        isFinal: payload.partial.isFinal,
        confidence: payload.partial.confidence,
        role: attempt.role,
      });
    } else {
      attempt.lastPartialSeq = payload.partial.seq;
      state.journalEvent?.("attempt.late_final_retained", {
        attemptId: attempt.attemptId,
        subtaskId: attempt.subtaskId,
        workerPeerId: payload.partial.workerPeerId,
        seq: payload.partial.seq,
      });
    }
  }

  const locked = state.speculationLocked.has(subtaskId);
  if (locked) {
    return { attempt, blockedLateOverwrite: true };
  }

  state.partials.set(subtaskId, payload);
  if (attempt) {
    const openSpeculative = [...state.attempts.values()].some(
      (a) =>
        a.subtaskId === subtaskId &&
        a.role === "speculative" &&
        (a.state === "awarded" || a.state === "running" || a.state === "final_received"),
    );
    if (!openSpeculative || attempt.role === "primary") {
      state.selectedAttemptBySubtask.set(subtaskId, attempt.attemptId);
    }
  }
  return { attempt, blockedLateOverwrite: false };
}

function earliestFinalMs(attempts: ChainAttemptState[]): number | undefined {
  let min: number | undefined;
  for (const a of attempts) {
    if (a.state !== "final_received" && a.state !== "selected") continue;
    const t = Date.parse(a.updatedAt);
    if (!Number.isFinite(t)) continue;
    if (min === undefined || t < min) min = t;
  }
  return min;
}

/**
 * When ≥1 final exists and no open speculative race remains (or both finals
 * arrived), select deterministically and cancel losers on the wire.
 */
export async function maybeFinalizeSpeculativeSelection(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
): Promise<{
  selectedAttemptId?: string;
  reason: string;
  cancelledWorkerPeerIds: string[];
  nextWorkerPeerId?: string;
}> {
  if (state.speculationLocked.has(subtaskId)) {
    return { reason: "already_locked", cancelledWorkerPeerIds: [] };
  }

  const attempts = [...state.attempts.values()].filter((a) => a.subtaskId === subtaskId);
  let speculativeOpen = attempts.some(
    (a) =>
      a.role === "speculative" &&
      (a.state === "awarded" || a.state === "running"),
  );
  const finals = attempts.filter((a) => a.state === "final_received" || a.state === "selected");
  if (finals.length === 0) {
    return { reason: "no_finals", cancelledWorkerPeerIds: [] };
  }

  if (speculativeOpen && state.speculativeAwards.has(subtaskId)) {
    const waitMs =
      state.chainMandate.stallTimeoutMs ?? SPECULATIVE_SIBLING_WAIT_MS;
    const firstFinalMs = earliestFinalMs(attempts);
    const nowMs = (deps.now?.() ?? new Date()).getTime();
    if (firstFinalMs !== undefined && nowMs - firstFinalMs >= waitMs) {
      await clearSpeculativeSibling(deps, state, subtaskId, "speculative_sibling_timeout");
      speculativeOpen = false;
    } else {
      return { reason: "waiting_sibling", cancelledWorkerPeerIds: [] };
    }
  }

  const finalsCtx = speculativeFinalsContext(deps, state, subtaskId);
  const selection = selectAmongSpeculativeFinals(state, subtaskId, finalsCtx);
  if (!selection.selectedAttemptId) {
    // Phase 63 — when the owner opted into auto-resolve (the default
    // when speculation is on), the orchestrator picks a winner itself
    // rather than blocking the chain on the owner.
    const onDisagreement = state.chainMandate.speculationOnDisagreement ?? "auto";
    if (onDisagreement === "auto") {
      const classified = classifySpeculativeFinalSelection(state, subtaskId, finalsCtx);
      const selectionReason =
        classified.reason === "disagree_needs_verify" || classified.reason === "none_pass"
          ? classified.reason
          : "disagree_needs_verify";
      const auto = autoResolveSpeculativeDisagreement({
        state,
        subtaskId,
        selectionReason,
      });
      if (auto.ok && auto.action === "auto_pick" && auto.selectedAttemptId) {
        return applySpeculativeSelection(
          deps,
          state,
          subtaskId,
          auto.selectedAttemptId,
          auto.reason,
        );
      }
      if (auto.ok && auto.action === "auto_reassign") {
        const resolvedFinalCount = attempts.filter(
          (a) => a.state === "final_received" || a.state === "selected",
        ).length;
        if (resolvedFinalCount < 2) {
          return { reason: "waiting_sibling", cancelledWorkerPeerIds: [] };
        }
        await clearSpeculativeSibling(deps, state, subtaskId, "auto_reassign_none_pass");
        const reassigned = await reassignStalledSubtask(deps, state, subtaskId);
        if (!reassigned.ok) {
          state.journalEvent?.("speculation.disagree", {
            subtaskId,
            reason: "auto_reassign_failed",
          });
          return { reason: "none_pass", cancelledWorkerPeerIds: [] };
        }
        return {
          reason: "auto_reassigned",
          nextWorkerPeerId: reassigned.nextWorkerPeerId,
          cancelledWorkerPeerIds: [],
        };
      }
      // fall through to the original block behavior when the
      // auto-resolver cannot pick (e.g. no verified finals).
    }
    // Disagreement / none_pass: do not lock; do not cancel — caller must not advance.
    state.journalEvent?.("speculation.disagree", {
      subtaskId,
      reason: selection.reason,
    });
    return { reason: selection.reason, cancelledWorkerPeerIds: [] };
  }

  return applySpeculativeSelection(
    deps,
    state,
    subtaskId,
    selection.selectedAttemptId,
    selection.reason,
  );
}

/** Lock a speculative winner, cancel losers on the wire, and unblock dependents. */
export async function applySpeculativeSelection(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
  selectedAttemptId: string,
  reason: string,
): Promise<{
  selectedAttemptId: string;
  reason: string;
  cancelledWorkerPeerIds: string[];
}> {
  const attempts = [...state.attempts.values()].filter((a) => a.subtaskId === subtaskId);
  const selected = state.attempts.get(selectedAttemptId);
  if (!selected || selected.subtaskId !== subtaskId) {
    return { selectedAttemptId, reason: "invalid_attempt", cancelledWorkerPeerIds: [] };
  }
  selected.state = "selected";
  selected.updatedAt = (deps.now?.() ?? new Date()).toISOString();
  const selectedPartial = state.partialsByAttempt.get(selected.attemptId);
  if (selectedPartial) {
    state.partials.set(subtaskId, selectedPartial);
  }
  state.selectedAttemptBySubtask.set(subtaskId, selectedAttemptId);
  state.speculationLocked.add(subtaskId);
  state.journalEvent?.("attempt.state_changed", {
    attemptId: selectedAttemptId,
    subtaskId,
    state: "selected",
    reason,
  });

  const primaryAward = state.awards.get(subtaskId);
  const speculativeAward = state.speculativeAwards.get(subtaskId);
  if (selected.role === "speculative" && speculativeAward) {
    state.awards.set(subtaskId, speculativeAward);
    state.awardedAt.set(subtaskId, speculativeAward.createdAt);
  } else if (primaryAward) {
    state.awards.set(subtaskId, primaryAward);
  }

  const cancelledWorkerPeerIds: string[] = [];
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  for (const a of attempts) {
    if (a.attemptId === selectedAttemptId) continue;
    if (a.state === "cancelled" || a.state === "lost") continue;
    a.state = "cancelled";
    a.lastReason = "speculative_not_selected";
    a.updatedAt = nowIso;
    state.journalEvent?.("attempt.state_changed", {
      attemptId: a.attemptId,
      subtaskId,
      state: "cancelled",
      reason: "speculative_not_selected",
    });
    cancelledWorkerPeerIds.push(a.workerPeerId);
    await sendChainCancel(deps, a.workerPeerId, {
      chainId: state.chainId,
      subtaskId,
      reason: "speculative_not_selected",
      cancelledBy: "orchestrator",
      notifyWorkerPeerIds: [a.workerPeerId],
      createdAt: nowIso,
    });
    if (a.role === "speculative") {
      await state.ledger.release(speculativeLedgerKey(subtaskId), "speculative_not_selected");
    }
  }

  state.speculativeAwards.delete(subtaskId);
  state.journalEvent?.("speculation.selected", {
    subtaskId,
    selectedAttemptId,
    reason,
    cancelledWorkerPeerIds,
  });
  deps.audit.record({
    type: "chain.partial_received",
    outcome: "allow",
    intent: "task.chain.partial",
    correlationId: state.chainId,
    summary:
      `speculation_selected subtask=${subtaskId.slice(0, 12)}` +
      ` attempt=${selectedAttemptId.slice(0, 16)} reason=${reason}`,
  });

  return { selectedAttemptId, reason, cancelledWorkerPeerIds };
}

/** Owner picks one final when automatic selection returns disagree_needs_verify. */
export async function ownerPickSpeculativeAttempt(
  deps: ChainOrchestratorHandlerDeps,
  state: ChainState,
  subtaskId: string,
  attemptId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (state.speculationLocked.has(subtaskId)) {
    return { ok: false, reason: "already_locked" };
  }
  const attempt = state.attempts.get(attemptId);
  if (!attempt || attempt.subtaskId !== subtaskId) {
    return { ok: false, reason: "invalid_attempt" };
  }
  if (attempt.state !== "final_received" && attempt.state !== "selected") {
    return { ok: false, reason: "not_final" };
  }
  await applySpeculativeSelection(deps, state, subtaskId, attemptId, "owner_picked");
  return { ok: true };
}
