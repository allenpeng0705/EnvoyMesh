/**
 * Plan+assign helpers for Team jobs.
 *
 * Builds the Assigner prompt (goal + eligible worker roster) and parses
 * LLM JSON into subtasks with preferredWorkerPeerId. Specialty is soft;
 * every step must get an assignee when the roster is non-empty.
 */

import { randomUUID } from "node:crypto";
import {
  ChainSubtaskSchema,
  agentNetworkSkillIds,
  type AgentNetworkProfile,
  type ChainSubtask,
} from "@envoymesh/protocol";
import { assignWorkersToSteps } from "@envoymesh/api";
import { extractJson } from "./chain-decomposer.js";

export interface PlanAssignRosterEntry {
  peerId: string;
  displayName?: string;
  ownerId?: string;
  membership: string[];
  profile?:
    | (Partial<Omit<AgentNetworkProfile, "skills">> & {
        skills?: readonly (string | import("@envoymesh/protocol").AgentNetworkSkillEntry)[];
      })
    | null;
  sameLan?: boolean;
  isSelf?: boolean;
  scoreSummary?: string;
}

export interface PlanAssignStepDraft {
  objective: string;
  requiredSkill: string;
  depth: number;
  constraints: string[];
  /** 0-based indices into the steps array (LLM form) or already-resolved subtask ids. */
  dependsOnRaw: Array<number | string>;
  assignedPeerId?: string;
  reason?: string;
}

export function buildPlanAssignPrompt(
  goal: string,
  roster: readonly PlanAssignRosterEntry[],
  opts?: {
    iteration?: {
      round: number;
      maxRounds: number;
      priorDraft?: string;
      critique?: string;
    };
  },
): string {
  const rosterJson = JSON.stringify(
    roster.map((w) => ({
      peerId: w.peerId,
      displayName: w.displayName ?? null,
      // Mesh capabilities are membership only — do not expose them as specialty tags.
      canExecute: (w.membership ?? []).includes("task.execute"),
      skills: agentNetworkSkillIds(w.profile?.skills),
      modelFreshness: w.profile?.modelFreshness ?? null,
      contextWindow: w.profile?.contextWindow ?? null,
      spendPosture: w.profile?.spendPosture ?? null,
      throughputTokensPerSec: w.profile?.throughputTokensPerSec ?? null,
      sameLan: w.sameLan === true,
      isSelf: w.isSelf === true,
    })),
    null,
    2,
  );

  const iteration = opts?.iteration;
  const iterationBlock =
    iteration && iteration.round > 1
      ? [
          "",
          `iterationRound: ${iteration.round}/${iteration.maxRounds}`,
          "HARD RULE: prefer steps that consume the prior draft; avoid full redo unless critique requires it.",
          iteration.priorDraft
            ? `Prior draft: ${JSON.stringify(iteration.priorDraft.slice(0, 4_000))}`
            : "",
          iteration.critique ? `Critique: ${JSON.stringify(iteration.critique)}` : "",
        ]
          .filter((l) => l.length > 0)
          .join("\n")
      : "";

  return [
    "You are the Assigner for an EnvoyMesh Team job (multi-agent collaboration).",
    "Analyze the goal, split it into concrete steps (dependency-aware), and assign EACH step to exactly one eligible worker.",
    "",
    "HARD RULES:",
    "- Only use peerId values from eligibleWorkers. Never invent ids.",
    "- Every step MUST include assignedPeerId.",
    "- If no specialist matches a step, still assign the best generalist from the roster. Never omit a step.",
    "- If eligibleWorkers has exactly one peer, assign every step to that peer.",
    "- When eligibleWorkers has 2+ peers OR the goal has multiple phases (research/draft/code/merge/etc.), produce 2–5 steps. Use a single step only for trivial one-shot goals.",
    "- Prefer sameLan=true and higher throughputTokensPerSec when quality is otherwise equal.",
    "- Soft-match skills (owner-attested specialties per agent). Mesh canExecute is membership only — never a specialty.",
    "- requiredSkill on each step is a specialty/strength hint (e.g. coding, research), NOT a mesh capability id.",
    "- When a non-self worker lists a skill that matches the step, prefer that specialist over isSelf=true. Do not assign every step to isSelf just because they are the creator.",
    "- Spread work across matching specialists when the roster has 2+ peers with different skills.",
    "- dependsOn uses 0-based indices into your steps array.",
    "- Do not emit <think> tags, chain-of-thought, or markdown — JSON object only.",
    "",
    "Return ONLY a JSON object (no prose, no markdown fencing) with shape:",
    '{ "steps": [ { "objective": string, "requiredSkill": string, "depth": 1|2|3, "dependsOn": number[], "assignedPeerId": string, "reason": string, "constraints"?: string[] } ], "aggregation": "llm_merge"|"concatenate", "notes"?: string }',
    "",
    `User goal: ${JSON.stringify(goal)}`,
    iterationBlock,
    "",
    "eligibleWorkers:",
    rosterJson,
    "",
    "Output the JSON object now.",
  ]
    .filter((l) => l.length > 0)
    .join("\n");
}

export function parsePlanAssignSteps(rawText: string): PlanAssignStepDraft[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch {
    return null;
  }
  const stepsRaw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { steps?: unknown }).steps)
      ? (parsed as { steps: unknown[] }).steps
      : null;
  if (!stepsRaw || stepsRaw.length === 0) return null;

  const drafts: PlanAssignStepDraft[] = [];
  for (const raw of stepsRaw.slice(0, 5)) {
    const c = (raw ?? {}) as Record<string, unknown>;
    const objective =
      typeof c.objective === "string" && c.objective.trim().length > 0 ? c.objective.trim() : "";
    if (!objective) return null;
    const requiredSkill =
      typeof c.requiredSkill === "string" && c.requiredSkill.trim().length > 0
        ? c.requiredSkill.trim()
        : "task.execute";
    const depth = Math.max(1, Math.min(3, Math.floor(Number(c.depth ?? 1))));
    const constraints = Array.isArray(c.constraints)
      ? c.constraints.filter((x): x is string => typeof x === "string").slice(0, 4)
      : [];
    const dependsOnRaw = Array.isArray(c.dependsOn) ? (c.dependsOn as Array<number | string>) : [];
    const assignedPeerId =
      typeof c.assignedPeerId === "string" && c.assignedPeerId.trim().length > 0
        ? c.assignedPeerId.trim()
        : undefined;
    const reason = typeof c.reason === "string" ? c.reason : undefined;
    drafts.push({
      objective,
      requiredSkill,
      depth,
      constraints,
      dependsOnRaw,
      assignedPeerId,
      reason,
    });
  }
  return drafts.length > 0 ? drafts : null;
}

export function materializePlanAssignSubtasks(input: {
  goal: string;
  chainId: string;
  chainMandateId: string;
  drafts: PlanAssignStepDraft[];
  roster: readonly PlanAssignRosterEntry[];
  createdAt: string;
  deadlineAt?: string;
}): ChainSubtask[] {
  const allowed = new Set(input.roster.map((r) => r.peerId));
  const rankedPeerIds = input.roster.map((r) => r.peerId);
  const suffix = randomUUID();

  const stepKeys = input.drafts.map((_, i) => `step_${i}`);
  const scoreFor = (peerId: string, specialtyHint: string): number => {
    const entry = input.roster.find((r) => r.peerId === peerId);
    if (!entry) return -1;
    const req = specialtyHint.toLowerCase();
    const skills = agentNetworkSkillIds(entry.profile?.skills);
    if (skills.some((s) => s === req || s.includes(req) || req.includes(s))) return 3;
    // Mesh capabilities are never specialty factors — only can-execute baseline.
    if ((entry.membership ?? []).includes("task.execute")) return 1;
    return 0;
  };

  const filled = assignWorkersToSteps({
    steps: input.drafts.map((d, i) => ({
      stepKey: stepKeys[i]!,
      requiredSkill: d.requiredSkill,
    })),
    rankedPeerIds,
    scoreFor,
  });

  const subtaskIds = input.drafts.map((_, i) => `subtask_${suffix}_${i + 1}`);
  const subtasks: ChainSubtask[] = [];

  const bestNonSelfSpecialist = (specialtyHint: string): string | undefined => {
    let best: string | undefined;
    let bestS = -1;
    for (const peerId of rankedPeerIds) {
      const entry = input.roster.find((r) => r.peerId === peerId);
      if (entry?.isSelf) continue;
      const s = scoreFor(peerId, specialtyHint);
      if (s > bestS) {
        bestS = s;
        best = peerId;
      }
    }
    return bestS >= 3 ? best : undefined;
  };

  for (const [i, draft] of input.drafts.entries()) {
    const scoredPick = filled[stepKeys[i]!];
    let assignee: string | undefined;
    if (draft.assignedPeerId && allowed.has(draft.assignedPeerId)) {
      const llmId = draft.assignedPeerId;
      const llmScore = scoreFor(llmId, draft.requiredSkill);
      const llmIsSelf = input.roster.find((r) => r.peerId === llmId)?.isSelf === true;
      const peerSpecialist = bestNonSelfSpecialist(draft.requiredSkill);
      const scoredPickScore = scoredPick ? scoreFor(scoredPick, draft.requiredSkill) : -1;
      // Prefer a peer specialist when the LLM missed the specialty, or when it
      // tied on specialty but biased to isSelf (creator). Fall back to scoredPick
      // when only the creator (or another roster entry) is the specialist.
      if (peerSpecialist && (llmScore < 3 || llmIsSelf)) {
        assignee = peerSpecialist;
      } else if (scoredPick && scoredPickScore >= 3 && llmScore < 3) {
        assignee = scoredPick;
      } else {
        assignee = llmId;
      }
    } else {
      assignee = scoredPick;
    }
    if (!assignee && rankedPeerIds.length > 0) assignee = rankedPeerIds[0];

    const dependsOn: string[] = [];
    for (const dep of draft.dependsOnRaw) {
      if (typeof dep === "number" && Number.isInteger(dep) && dep >= 0 && dep < i) {
        dependsOn.push(subtaskIds[dep]!);
      } else if (typeof dep === "string" && dep.startsWith("subtask_")) {
        dependsOn.push(dep);
      }
    }

    const reasonHint = draft.reason ? `Assign reason: ${draft.reason}` : undefined;
    const constraints = [...draft.constraints];
    if (reasonHint) constraints.push(reasonHint);

    const obj = {
      version: "0.1" as const,
      subtaskId: subtaskIds[i]!,
      chainId: input.chainId,
      chainMandateId: input.chainMandateId,
      depth: draft.depth,
      requiredSkill: draft.requiredSkill,
      objective: draft.objective,
      requestedResult: `result of: ${draft.objective}`,
      constraints,
      dependsOn,
      preferredWorkerPeerId: assignee,
      createdAt: input.createdAt,
      deadlineAt: input.deadlineAt,
    };
    subtasks.push(ChainSubtaskSchema.parse(obj));
  }

  return subtasks;
}

/** Detect cycles in dependsOn after materialization. */
export function hasDependsOnCycle(subtasks: readonly ChainSubtask[]): boolean {
  const byId = new Map(subtasks.map((s) => [s.subtaskId, s] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const node = byId.get(id);
    for (const dep of node?.dependsOn ?? []) {
      if (dfs(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const s of subtasks) {
    if (dfs(s.subtaskId)) return true;
  }
  return false;
}
