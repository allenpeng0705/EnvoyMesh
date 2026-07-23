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
  type AgentNetworkProfile,
  type ChainSubtask,
} from "@envoymesh/protocol";
import { assignWorkersToSteps } from "@envoymesh/api";
import { extractJson } from "./chain-decomposer.js";

export interface PlanAssignRosterEntry {
  peerId: string;
  displayName?: string;
  ownerId?: string;
  capabilities: string[];
  profile?: Partial<AgentNetworkProfile> | null;
  sameLan?: boolean;
  isSelf?: boolean;
  scoreSummary?: string;
}

export interface PlanAssignStepDraft {
  objective: string;
  requiredCapability: string;
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
      capabilities: w.capabilities,
      strengths: w.profile?.strengths ?? [],
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
    "- Soft-match strengths/capabilities; they are hints, not hard filters.",
    "- dependsOn uses 0-based indices into your steps array.",
    "- Do not emit <think> tags, chain-of-thought, or markdown — JSON object only.",
    "",
    "Return ONLY a JSON object (no prose, no markdown fencing) with shape:",
    '{ "steps": [ { "objective": string, "requiredCapability": string, "depth": 1|2|3, "dependsOn": number[], "assignedPeerId": string, "reason": string, "constraints"?: string[] } ], "aggregation": "llm_merge"|"concatenate", "notes"?: string }',
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
    const requiredCapability =
      typeof c.requiredCapability === "string" && c.requiredCapability.trim().length > 0
        ? c.requiredCapability.trim()
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
      requiredCapability,
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
  const scoreFor = (peerId: string, requiredCapability: string): number => {
    const entry = input.roster.find((r) => r.peerId === peerId);
    if (!entry) return -1;
    const req = requiredCapability.toLowerCase();
    const strengths = entry.profile?.strengths ?? [];
    if (strengths.some((s) => s.toLowerCase() === req || s.toLowerCase().includes(req))) return 3;
    if (entry.capabilities.some((c) => c.toLowerCase() === req)) return 2;
    if (entry.capabilities.includes("task.execute")) return 1;
    return 0;
  };

  const filled = assignWorkersToSteps({
    steps: input.drafts.map((d, i) => ({
      stepKey: stepKeys[i]!,
      requiredCapability: d.requiredCapability,
    })),
    rankedPeerIds,
    scoreFor,
  });

  const subtaskIds = input.drafts.map((_, i) => `subtask_${suffix}_${i + 1}`);
  const subtasks: ChainSubtask[] = [];

  for (const [i, draft] of input.drafts.entries()) {
    let assignee =
      draft.assignedPeerId && allowed.has(draft.assignedPeerId)
        ? draft.assignedPeerId
        : filled[stepKeys[i]!];
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
      requiredCapability: draft.requiredCapability,
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
