/**
 * Phase 47 — Team job iteration: outer loop (B) + intra-round extend (A).
 *
 * Naming: iterationRound — never overload negotiationRound / bid rounds.
 */

import { randomUUID } from "node:crypto";
import {
  ChainSubtaskSchema,
  type ChainReport,
  type ChainSubtask,
} from "@envoymesh/protocol";

import { extractJson } from "./chain-decomposer.js";
import type { ChainState } from "./chain-orchestrator.js";

export type IterationJudgeDecision = "continue" | "stop" | "ask_owner" | "extend";

export type IterationStopReason =
  | "max_rounds"
  | "judge_stop"
  | "owner_stop"
  | "budget"
  | "deadline"
  | "no_workers"
  | "ask_owner";

export type IterationJudgeMode = "llm" | "always_stop" | "owner";
export type IterationCarryMode = "summary" | "full_draft" | "structured";

export type ExtendRejectReason =
  | "no_iteration"
  | "round_sealed"
  | "cap_exceeded"
  | "no_final_partial"
  | "invalid_depends_on"
  | "depends_on_sealed"
  | "depends_on_incomplete"
  | "depth_exceeded"
  | "empty_steps"
  | "budget"
  | "deadline";

export interface IterationDraft {
  round: number;
  summary: string;
  artifactRef?: string;
  confidence?: number;
  /** Full report retained for terminal publish (no mid-loop publish). */
  report?: ChainReport;
  judge?: {
    decision: IterationJudgeDecision;
    reason: string;
    suggestedExtendObjectives?: string[];
  };
}

export interface ChainIterationState {
  round: number;
  maxRounds: number;
  /** Steps appended via A so far in the open round. */
  extendsInRound: number;
  /** Cap on total A steps per open round (`extendMaxStepsPerRound`). */
  maxExtendsInRound: number;
  extendMaxDepth: number;
  extendOnlyAfterPartial: boolean;
  sealedByRound: Record<number, string[]>;
  openRoundSubtaskIds: string[];
  drafts: IterationDraft[];
  judgeMode: IterationJudgeMode;
  carryMode: IterationCarryMode;
  stopReason?: IterationStopReason;
  /** Owner goal₀ (immutable) for replans. */
  goal: string;
  /** Phase 47C — judge asked the owner; do not publish until resolved. */
  waitingForOwner?: boolean;
}

export interface CreateIterationStateInput {
  goal: string;
  maxRounds: number;
  openRoundSubtaskIds: string[];
  maxExtendsInRound?: number;
  extendMaxDepth?: number;
  extendOnlyAfterPartial?: boolean;
  judgeMode?: IterationJudgeMode;
  carryMode?: IterationCarryMode;
}

export function createIterationState(input: CreateIterationStateInput): ChainIterationState {
  const maxRounds = Math.max(1, Math.min(10, Math.floor(input.maxRounds)));
  return {
    round: 1,
    maxRounds,
    extendsInRound: 0,
    maxExtendsInRound: Math.max(0, Math.floor(input.maxExtendsInRound ?? 2)),
    extendMaxDepth: Math.max(1, Math.min(3, Math.floor(input.extendMaxDepth ?? 3))),
    extendOnlyAfterPartial: input.extendOnlyAfterPartial !== false,
    sealedByRound: {},
    openRoundSubtaskIds: [...input.openRoundSubtaskIds],
    drafts: [],
    judgeMode: input.judgeMode ?? "llm",
    carryMode: input.carryMode ?? "summary",
    goal: input.goal,
  };
}

export function isIterationEnabled(state: ChainState): boolean {
  return (state.iteration?.maxRounds ?? 1) > 1;
}

export function isExtendEnabled(state: ChainState): boolean {
  return (state.iteration?.maxExtendsInRound ?? 0) > 0;
}

export function sealedSubtaskIdSet(iteration: ChainIterationState): Set<string> {
  const ids = new Set<string>();
  for (const list of Object.values(iteration.sealedByRound)) {
    for (const id of list) ids.add(id);
  }
  return ids;
}

export function isSubtaskSealed(state: ChainState, subtaskId: string): boolean {
  if (!state.iteration) return false;
  return sealedSubtaskIdSet(state.iteration).has(subtaskId);
}

/** Subtask IDs that must finish before the current round can seal. */
export function openRoundIdsOrAll(state: ChainState): string[] {
  if (state.iteration && state.iteration.openRoundSubtaskIds.length > 0) {
    return state.iteration.openRoundSubtaskIds;
  }
  return [...state.subtasks.keys()].filter((id) => !state.cancelledSubtasks.has(id));
}

export function allOpenRoundHaveFinalPartials(state: ChainState): boolean {
  const ids = openRoundIdsOrAll(state);
  if (ids.length === 0) return false;
  for (const id of ids) {
    if (state.cancelledSubtasks.has(id)) continue;
    const partial = state.partials.get(id);
    if (!partial?.partial.isFinal) return false;
  }
  return true;
}

export function openRoundHasFinalPartial(state: ChainState): boolean {
  for (const id of openRoundIdsOrAll(state)) {
    if (state.cancelledSubtasks.has(id)) continue;
    if (state.partials.get(id)?.partial.isFinal) return true;
  }
  return false;
}

export function remainingExtendSlots(state: ChainState): number {
  const it = state.iteration;
  if (!it) return 0;
  return Math.max(0, it.maxExtendsInRound - it.extendsInRound);
}

export function remainingBudgetUsd(state: ChainState): number {
  const snap = state.ledger.snapshot();
  return Math.max(0, snap.maxChainCostUsd - snap.committedUsd - snap.reservedUsd);
}

export function deadlinePassed(state: ChainState, now = new Date()): boolean {
  const raw = state.chainMandate.deadlineAt;
  if (!raw) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t) && now.getTime() > t;
}

/** Heuristic headroom before starting another plan+execute+synthesize. */
export function budgetAllowsContinue(state: ChainState, minReserveUsd = 0.5): boolean {
  return remainingBudgetUsd(state) >= minReserveUsd;
}

export function canStartNextRound(
  state: ChainState,
  now = new Date(),
): { ok: true } | { ok: false; reason: IterationStopReason } {
  const it = state.iteration;
  if (!it) return { ok: false, reason: "judge_stop" };
  if (it.round >= it.maxRounds) return { ok: false, reason: "max_rounds" };
  if (deadlinePassed(state, now)) return { ok: false, reason: "deadline" };
  if (!budgetAllowsContinue(state)) return { ok: false, reason: "budget" };
  return { ok: true };
}

/**
 * Whether the Assigner may append steps before sealing the open round.
 * Requires the open round to be idle (all current open IDs final).
 */
export function canExtendOpenRound(
  state: ChainState,
  now = new Date(),
): { ok: true; remaining: number } | { ok: false; reason: ExtendRejectReason } {
  const it = state.iteration;
  if (!it) return { ok: false, reason: "no_iteration" };
  if (it.openRoundSubtaskIds.length === 0) return { ok: false, reason: "round_sealed" };
  if (it.maxExtendsInRound <= 0) return { ok: false, reason: "cap_exceeded" };
  const remaining = remainingExtendSlots(state);
  if (remaining <= 0) return { ok: false, reason: "cap_exceeded" };
  if (!allOpenRoundHaveFinalPartials(state)) {
    return { ok: false, reason: "depends_on_incomplete" };
  }
  if (it.extendOnlyAfterPartial && !openRoundHasFinalPartial(state)) {
    return { ok: false, reason: "no_final_partial" };
  }
  if (deadlinePassed(state, now)) return { ok: false, reason: "deadline" };
  if (!budgetAllowsContinue(state, 0.25)) return { ok: false, reason: "budget" };
  return { ok: true, remaining };
}

export interface ExtendStepInput {
  objective: string;
  requiredSkill?: string;
  /** Must reference open-round IDs that already have final partials. */
  dependsOn: string[];
  depth?: number;
  preferredWorkerPeerId?: string;
  constraints?: string[];
  requestedResult?: string;
}

export type AppendExtendResult =
  | { ok: true; subtasks: ChainSubtask[] }
  | { ok: false; reason: ExtendRejectReason; detail?: string };

/**
 * Append dependent steps to the open round (A). Finished steps stay immutable;
 * sealed IDs cannot be depended on or rewritten.
 */
export function appendExtendSteps(
  state: ChainState,
  steps: readonly ExtendStepInput[],
  opts: { now?: Date } = {},
): AppendExtendResult {
  const gate = canExtendOpenRound(state, opts.now ?? new Date());
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (steps.length === 0) return { ok: false, reason: "empty_steps" };

  const it = state.iteration!;
  if (steps.length > gate.remaining) {
    return {
      ok: false,
      reason: "cap_exceeded",
      detail: `requested=${steps.length} remaining=${gate.remaining}`,
    };
  }

  const openSet = new Set(it.openRoundSubtaskIds);
  const sealed = sealedSubtaskIdSet(it);
  const created: ChainSubtask[] = [];
  const nowIso = (opts.now ?? new Date()).toISOString();

  for (const step of steps) {
    const objective = step.objective?.trim() ?? "";
    if (!objective) {
      return { ok: false, reason: "empty_steps", detail: "blank objective" };
    }
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return { ok: false, reason: "invalid_depends_on", detail: "extend steps must dependOn parents" };
    }
    for (const dep of step.dependsOn) {
      if (sealed.has(dep)) {
        return { ok: false, reason: "depends_on_sealed", detail: dep };
      }
      if (!openSet.has(dep)) {
        return { ok: false, reason: "invalid_depends_on", detail: `not_open:${dep}` };
      }
      if (!state.partials.get(dep)?.partial.isFinal) {
        return { ok: false, reason: "depends_on_incomplete", detail: dep };
      }
    }

    const parentDepths = step.dependsOn.map((id) => state.subtasks.get(id)?.depth ?? 1);
    const minParent = Math.max(1, ...parentDepths);
    const depth = Math.max(
      1,
      Math.min(it.extendMaxDepth, Math.floor(step.depth ?? Math.min(it.extendMaxDepth, minParent + 1))),
    );
    if (depth > it.extendMaxDepth) {
      return { ok: false, reason: "depth_exceeded", detail: `depth=${depth}` };
    }

    const subtask = ChainSubtaskSchema.parse({
      version: "0.1",
      subtaskId: `subtask_${randomUUID()}`,
      chainId: state.chainId,
      chainMandateId: state.chainMandate.chainMandateId,
      depth,
      requiredSkill: step.requiredSkill?.trim() || "task.execute",
      objective,
      requestedResult: step.requestedResult?.trim() || "extended result",
      constraints: step.constraints?.slice(0, 8) ?? [],
      dependsOn: step.dependsOn,
      preferredWorkerPeerId: step.preferredWorkerPeerId,
      createdAt: nowIso,
      deadlineAt: state.chainMandate.deadlineAt,
      costCeilingUsd: state.chainMandate.costCeilingUsd,
    });
    created.push(subtask);
  }

  for (const s of created) {
    state.subtasks.set(s.subtaskId, s);
    it.openRoundSubtaskIds.push(s.subtaskId);
  }
  it.extendsInRound += created.length;
  return { ok: true, subtasks: created };
}

export function sealOpenRound(state: ChainState): void {
  const it = state.iteration;
  if (!it) return;
  const ids = [...it.openRoundSubtaskIds];
  it.sealedByRound[it.round] = ids;
  it.openRoundSubtaskIds = [];
  it.extendsInRound = 0;
}

export function recordDraft(
  state: ChainState,
  input: {
    summary: string;
    report?: ChainReport;
    confidence?: number;
    artifactRef?: string;
  },
): IterationDraft {
  const it = state.iteration;
  if (!it) {
    throw new Error("recordDraft requires state.iteration");
  }
  const draft: IterationDraft = {
    round: it.round,
    summary: input.summary,
    report: input.report,
    confidence: input.confidence,
    artifactRef: input.artifactRef,
  };
  it.drafts.push(draft);
  return draft;
}

export function normalizeJudgeDecision(
  decision: IterationJudgeDecision,
  opts: { sealed: boolean; canContinue: boolean },
): IterationJudgeDecision {
  if (opts.sealed && decision === "extend") {
    return opts.canContinue ? "continue" : "stop";
  }
  // No budget / rounds left: continue and ask_owner must terminalize.
  if (!opts.canContinue && (decision === "continue" || decision === "ask_owner")) {
    return "stop";
  }
  return decision;
}

export function parseIterationJudge(rawText: string): {
  decision: IterationJudgeDecision;
  reason: string;
  suggestedExtendObjectives?: string[];
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const decisionRaw = typeof o.decision === "string" ? o.decision.trim() : "";
  const allowed: IterationJudgeDecision[] = ["continue", "stop", "ask_owner", "extend"];
  if (!allowed.includes(decisionRaw as IterationJudgeDecision)) return null;
  const reason =
    typeof o.reason === "string" && o.reason.trim().length > 0
      ? o.reason.trim()
      : "no reason";
  const suggested = Array.isArray(o.suggestedExtendObjectives)
    ? o.suggestedExtendObjectives.filter((x): x is string => typeof x === "string").slice(0, 4)
    : undefined;
  return {
    decision: decisionRaw as IterationJudgeDecision,
    reason,
    suggestedExtendObjectives: suggested,
  };
}

export function buildIterationJudgePrompt(input: {
  goal: string;
  draftSummary: string;
  round: number;
  maxRounds: number;
  remainingBudgetUsd: number;
  deadlineAt?: string;
}): string {
  return [
    "You are judging a Team job draft for EnvoyMesh.",
    "Decide whether refinement should stop or continue with a full replan.",
    "Return ONLY JSON: { \"decision\": \"stop\"|\"continue\"|\"ask_owner\", \"reason\": string }",
    "Prefer stop when the draft adequately meets the goal.",
    "Prefer continue only for clear global gaps and when rounds remain.",
    "Do not emit markdown or chain-of-thought.",
    "",
    `iterationRound: ${input.round}/${input.maxRounds}`,
    `remainingBudgetUsd: ${input.remainingBudgetUsd}`,
    input.deadlineAt ? `deadlineAt: ${input.deadlineAt}` : "",
    `goal: ${JSON.stringify(input.goal)}`,
    `draft: ${JSON.stringify(input.draftSummary)}`,
  ]
    .filter((l) => l.length > 0)
    .join("\n");
}

export function buildIterationPlanGoal(goal: string, iteration: ChainIterationState): string {
  const last = iteration.drafts.at(-1);
  if (!last) return goal;
  const carry =
    iteration.carryMode === "full_draft" || iteration.carryMode === "structured"
      ? last.summary
      : last.summary.slice(0, 4_000);
  return [
    goal,
    "",
    `[iterationRound ${iteration.round}/${iteration.maxRounds}]`,
    "Prior draft (consume this; do not redo solved work unless critique requires):",
    carry,
    last.judge?.reason ? `Critique: ${last.judge.reason}` : "",
    "Prefer steps that refine or extend the prior draft.",
  ]
    .filter((l) => l.length > 0)
    .join("\n");
}

export type ResolveJudgeInput = {
  state: ChainState;
  draftSummary: string;
  now?: Date;
  /** Optional LLM / test hook. */
  judge?: (prompt: string) => Promise<string | null>;
};

export async function resolveIterationJudge(
  input: ResolveJudgeInput,
): Promise<{ decision: IterationJudgeDecision; reason: string }> {
  const it = input.state.iteration;
  if (!it) return { decision: "stop", reason: "no iteration state" };

  const gate = canStartNextRound(input.state, input.now ?? new Date());
  const canContinue = gate.ok;

  if (it.judgeMode === "always_stop") {
    return { decision: "stop", reason: "iterationJudgeMode=always_stop" };
  }
  if (it.judgeMode === "owner") {
    return {
      decision: normalizeJudgeDecision("ask_owner", { sealed: true, canContinue }),
      reason: "iterationJudgeMode=owner",
    };
  }

  if (input.judge) {
    const prompt = buildIterationJudgePrompt({
      goal: it.goal,
      draftSummary: input.draftSummary,
      round: it.round,
      maxRounds: it.maxRounds,
      remainingBudgetUsd: remainingBudgetUsd(input.state),
      deadlineAt: input.state.chainMandate.deadlineAt,
    });
    const raw = await input.judge(prompt);
    if (raw) {
      const parsed = parseIterationJudge(raw);
      if (parsed) {
        return {
          decision: normalizeJudgeDecision(parsed.decision, { sealed: true, canContinue }),
          reason: parsed.reason,
        };
      }
    }
  }

  return heuristicJudgeDecision(input.state, input.draftSummary);
}

export function beginNextIterationRound(state: ChainState, newSubtaskIds: string[]): void {
  const it = state.iteration;
  if (!it) return;
  it.round += 1;
  it.openRoundSubtaskIds = [...newSubtaskIds];
  it.extendsInRound = 0;
  it.waitingForOwner = false;
}

// ---------------------------------------------------------------------------
// Phase 47C — critique heuristics (local → extend, global → continue)
// ---------------------------------------------------------------------------

const LOCAL_GAP_RE =
  /\b(cite|citation|typo|grammar|one more|missing detail|thin|short|expand|flesh out|add (a |one )?sentence|clarify|polish|format)\b/i;
const GLOBAL_GAP_RE =
  /\b(wrong approach|replan|rewrite|restructure|contradict|contradicts|start over|fundamentally|global|entire approach|redesign)\b/i;

export type IterationGapKind = "local" | "global" | "unknown";

export function classifyIterationGap(text: string): IterationGapKind {
  const t = text.trim();
  if (!t) return "unknown";
  if (GLOBAL_GAP_RE.test(t)) return "global";
  if (LOCAL_GAP_RE.test(t)) return "local";
  // Very short worker notes often need a local expand.
  if (t.length > 0 && t.length < 80) return "local";
  return "unknown";
}

/**
 * Suggest a single local extend step from the weakest open-round final note.
 * Returns null when caps / heuristics say skip.
 */
export function suggestLocalExtendStep(state: ChainState): ExtendStepInput | null {
  const gate = canExtendOpenRound(state);
  if (!gate.ok || gate.remaining < 1) return null;
  // Auto-suggest at most once per round (extendsInRound === 0).
  if ((state.iteration?.extendsInRound ?? 0) > 0) return null;

  let weakest: { id: string; note: string } | null = null;
  for (const id of openRoundIdsOrAll(state)) {
    if (state.cancelledSubtasks.has(id)) continue;
    const note = state.partials.get(id)?.partial.note?.trim() ?? "";
    const kind = classifyIterationGap(note || "thin");
    if (kind !== "local" && note.length >= 80) continue;
    if (!weakest || note.length < weakest.note.length) {
      weakest = { id, note };
    }
  }
  if (!weakest) return null;
  return {
    objective: `Expand and strengthen the prior result for ${weakest.id} (add missing detail or a citation if needed).`,
    dependsOn: [weakest.id],
    requiredSkill: "task.execute",
  };
}

/** Map a post-seal judge decision using gap heuristics when LLM is absent. */
export function heuristicJudgeDecision(
  state: ChainState,
  draftSummary: string,
): { decision: IterationJudgeDecision; reason: string } {
  const gap = classifyIterationGap(draftSummary);
  const gate = canStartNextRound(state);
  if (gap === "local" && gate.ok) {
    // Sealed — cannot extend; prefer a light continue-round over stop.
    return {
      decision: "continue",
      reason: "heuristic: local gap after seal → continue round",
    };
  }
  if (gap === "global" && gate.ok) {
    return {
      decision: "continue",
      reason: "heuristic: global gap → continue round",
    };
  }
  if (!gate.ok) {
    return { decision: "stop", reason: `heuristic stop: ${gate.reason}` };
  }
  return { decision: "stop", reason: "heuristic: draft looks sufficient" };
}

// ---------------------------------------------------------------------------
// Phase 47D — handoff wire blob (rehydrate without full ChainReport objects)
// ---------------------------------------------------------------------------

export type IterationWireBlob = {
  round: number;
  maxRounds: number;
  extendsInRound: number;
  maxExtendsInRound: number;
  extendMaxDepth: number;
  extendOnlyAfterPartial: boolean;
  sealedByRound: Record<string, string[]>;
  openRoundSubtaskIds: string[];
  drafts: Array<{
    round: number;
    summary: string;
    judgeDecision?: string;
    judgeReason?: string;
  }>;
  judgeMode: IterationJudgeMode;
  carryMode: IterationCarryMode;
  goal: string;
  waitingForOwner?: boolean;
  stopReason?: string;
};

/** Serialize Assigner iteration for `task.chain.handoff.iterationState`. */
export function toIterationWireBlob(iteration: ChainIterationState): IterationWireBlob {
  const sealedByRound: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(iteration.sealedByRound)) {
    sealedByRound[String(k)] = [...ids];
  }
  return {
    round: iteration.round,
    maxRounds: iteration.maxRounds,
    extendsInRound: iteration.extendsInRound,
    maxExtendsInRound: iteration.maxExtendsInRound,
    extendMaxDepth: iteration.extendMaxDepth,
    extendOnlyAfterPartial: iteration.extendOnlyAfterPartial,
    sealedByRound,
    openRoundSubtaskIds: [...iteration.openRoundSubtaskIds],
    drafts: iteration.drafts.map((d) => ({
      round: d.round,
      summary: d.summary,
      judgeDecision: d.judge?.decision,
      judgeReason: d.judge?.reason,
    })),
    judgeMode: iteration.judgeMode,
    carryMode: iteration.carryMode,
    goal: iteration.goal,
    waitingForOwner: iteration.waitingForOwner,
    stopReason: iteration.stopReason,
  };
}

/** Rehydrate iteration side-state after Assigner handoff (no report objects). */
export function fromIterationWireBlob(wire: IterationWireBlob): ChainIterationState {
  const sealedByRound: Record<number, string[]> = {};
  for (const [k, ids] of Object.entries(wire.sealedByRound ?? {})) {
    const n = Number(k);
    if (!Number.isFinite(n)) continue;
    sealedByRound[n] = [...ids];
  }
  const judgeMode = (["llm", "always_stop", "owner"] as const).includes(
    wire.judgeMode as IterationJudgeMode,
  )
    ? (wire.judgeMode as IterationJudgeMode)
    : "llm";
  const carryMode = (["summary", "full_draft", "structured"] as const).includes(
    wire.carryMode as IterationCarryMode,
  )
    ? (wire.carryMode as IterationCarryMode)
    : "summary";
  return {
    round: Math.max(1, Math.min(10, Math.floor(wire.round))),
    maxRounds: Math.max(1, Math.min(10, Math.floor(wire.maxRounds))),
    extendsInRound: Math.max(0, Math.floor(wire.extendsInRound)),
    maxExtendsInRound: Math.max(0, Math.floor(wire.maxExtendsInRound)),
    extendMaxDepth: Math.max(1, Math.min(3, Math.floor(wire.extendMaxDepth ?? 3))),
    extendOnlyAfterPartial: wire.extendOnlyAfterPartial !== false,
    sealedByRound,
    openRoundSubtaskIds: [...(wire.openRoundSubtaskIds ?? [])],
    drafts: (wire.drafts ?? []).map((d) => ({
      round: d.round,
      summary: d.summary,
      judge:
        d.judgeDecision != null
          ? {
              decision: d.judgeDecision as IterationJudgeDecision,
              reason: d.judgeReason ?? "",
            }
          : undefined,
    })),
    judgeMode,
    carryMode,
    goal: wire.goal,
    waitingForOwner: wire.waitingForOwner === true,
    stopReason: wire.stopReason as IterationStopReason | undefined,
  };
}
