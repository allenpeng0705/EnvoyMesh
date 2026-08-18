/**
 * Plan+assign helpers for Team jobs.
 *
 * Builds the Assigner prompt (goal + eligible worker roster) and parses
 * LLM JSON into subtasks with preferredWorkerPeerId. Supports skill-based
 * (default) and role-based assignment modes — see docs/agent-network-roles.md.
 */

import { randomUUID } from "node:crypto";
import {
  ChainSubtaskSchema,
  agentNetworkHasRole,
  agentNetworkPrimaryRole,
  agentNetworkRoleIds,
  agentNetworkSkillIds,
  coerceAgentNetworkRoleId,
  type AgentNetworkProfile,
  type AgentNetworkRoleId,
  type ChainSubtask,
} from "@envoymesh/protocol";
import { assignWorkersToSteps } from "@envoymesh/api";
import { extractJson } from "./chain-decomposer.js";
import { isBriefOrReportGoal, planPromptAddonForGoal } from "./chain-deliverable-policy.js";

/** Bump when substitute guidance text changes (prompt module versioning). */
export const ROLE_SUBSTITUTE_GUIDANCE_VERSION = 1;

export type ChainAssignmentMode = "skill" | "role";

export type PlanAssignKind =
  | "exact_role"
  | "role_substitute"
  | "skill_fallback"
  | "generalist";

export type PlanAssignWarningCode =
  | "role_missing"
  | "role_substitute"
  | "skill_fallback"
  | "no_role_peers"
  | "ambiguous_role"
  | "assignee_rewritten"
  | "no_llm_role_planning";

export interface PlanAssignWarning {
  code: PlanAssignWarningCode;
  role?: string;
  stepIndex?: number;
  usedPeerId?: string;
  assignKind?: PlanAssignKind;
  message: string;
}

export interface PlanAssignRosterEntry {
  peerId: string;
  displayName?: string;
  ownerId?: string;
  membership: string[];
  profile?:
    | (Partial<Omit<AgentNetworkProfile, "skills" | "roles">> & {
        skills?: readonly (string | import("@envoymesh/protocol").AgentNetworkSkillEntry)[];
        roles?: readonly string[];
      })
    | null;
  sameLan?: boolean;
  isSelf?: boolean;
  scoreSummary?: string;
  /**
   * Per-skill reputation in [0, 1] (MAP 3-tuple derived; Sprint 2). Soft
   * tiebreaker only — never overrides the skill tier in `scoreFor`.
   */
  reputationBySkill?: Readonly<Record<string, number>>;
}

/** How much a worker's per-skill reputation nudges the assignment score. */
export const REPUTATION_BLEND_WEIGHT = 0.2;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Exact-match per-skill reputation, clamped to [0, 1]. Returns `undefined`
 * when the roster entry carries no reputation or no match for the skill.
 */
export function skillReputation(
  entry: PlanAssignRosterEntry,
  skillKey: string,
): number | undefined {
  const map = entry.reputationBySkill;
  if (!map) return undefined;
  const v = map[skillKey.toLowerCase()];
  return typeof v === "number" ? clamp01(v) : undefined;
}

/**
 * Blend a base score with reputation as a *soft* addend so the skill tier
 * ordering (specialist 3 > executor 1 > none 0) is preserved: a specialist
 * with reputation 0 still outranks a reputation-1 general executor. Undefined
 * reputation leaves the base score untouched.
 */
export function blendScoreWithReputation(
  baseScore: number,
  reputation: number | undefined,
): number {
  if (reputation === undefined) return baseScore;
  return baseScore + REPUTATION_BLEND_WEIGHT * clamp01(reputation);
}

export interface PlanAssignStepDraft {
  objective: string;
  requiredSkill: string;
  requiredRole?: AgentNetworkRoleId;
  depth: number;
  constraints: string[];
  /** 0-based indices into the steps array (LLM form) or already-resolved subtask ids. */
  dependsOnRaw: Array<number | string>;
  assignedPeerId?: string;
  reason?: string;
  assignKind?: PlanAssignKind;
  missingRole?: string;
  /** Soft ownership group — steps sharing threadId keep one preferred worker. */
  threadId?: string;
  produces?: string[];
  expects?: Array<{ key: string; fromStepIndex?: number }>;
}

export interface PlanAssignParseResult {
  steps: PlanAssignStepDraft[];
  warnings: PlanAssignWarning[];
  notes?: string;
  assignmentMode?: ChainAssignmentMode;
}

export function resolveAssignmentMode(
  mode?: string | null,
): ChainAssignmentMode {
  return mode === "role" ? "role" : "skill";
}

function buildModeSkillSection(): string[] {
  return [
    "ASSIGNMENT MODE: skill",
    "- Rank by requiredSkill vs each worker's skills, plus soft factors (LAN, throughput, freshness).",
    "- Collaboration roles on the roster are informational only — do not use them for ranking.",
    "- requiredRole may be omitted. assignKind is optional (skill_fallback / generalist).",
  ];
}

function buildModeRoleSection(): string[] {
  return [
    "ASSIGNMENT MODE: role",
    "- Every non-trivial step SHOULD set requiredRole (product_manager|programmer|tester|researcher|writer|generalist|custom:…).",
    "- Prefer a worker whose primaryRole (or any roles[]) equals requiredRole. Exact match → assignKind=exact_role.",
    "- Assume exact-role peers can perform that seat's work (do not require skill overlap for exact_role).",
    "- If 2+ workers share the exact role, break ties with skills + soft factors; optionally warn ambiguous_role.",
    "- If zero exact matches: choose role_substitute (another role that can reasonably cover), else skill_fallback, else generalist.",
    "- ALWAYS add a warnings[] entry when assignKind is not exact_role.",
    "",
    `SUBSTITUTE GUIDANCE (v${ROLE_SUBSTITUTE_GUIDANCE_VERSION} — examples, not exhaustive; explain deviations in reason):`,
    "- missing tester → programmer often OK for light QA (role_substitute)",
    "- missing writer → product_manager or researcher sometimes OK for docs (role_substitute)",
    "- missing programmer → do NOT assign tester as coder; use skill_fallback (coding) or generalist",
    "- missing product_manager → prefer researcher/writer via skills for spec steps; do not invent authority",
  ];
}

export function buildPlanAssignPrompt(
  goal: string,
  roster: readonly PlanAssignRosterEntry[],
  opts?: {
    assignmentMode?: ChainAssignmentMode;
    iteration?: {
      round: number;
      maxRounds: number;
      priorDraft?: string;
      critique?: string;
    };
  },
): string {
  const mode = resolveAssignmentMode(opts?.assignmentMode);
  const rosterJson = JSON.stringify(
    roster.map((w) => {
      const roles = agentNetworkRoleIds(w.profile?.roles);
      return {
        peerId: w.peerId,
        displayName: w.displayName ?? null,
        // Mesh capabilities are membership only — do not expose them as specialty tags.
        canExecute: (w.membership ?? []).includes("task.execute"),
        skills: agentNetworkSkillIds(w.profile?.skills),
        roles,
        primaryRole: agentNetworkPrimaryRole(roles) ?? null,
        modelFreshness: w.profile?.modelFreshness ?? null,
        contextWindow: w.profile?.contextWindow ?? null,
        spendPosture: w.profile?.spendPosture ?? null,
        throughputTokensPerSec: w.profile?.throughputTokensPerSec ?? null,
        reputationBySkill: w.reputationBySkill ?? null,
        sameLan: w.sameLan === true,
        isSelf: w.isSelf === true,
      };
    }),
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

  const modeSection = mode === "role" ? buildModeRoleSection() : buildModeSkillSection();
  const rolePeers = roster.filter((w) => agentNetworkRoleIds(w.profile?.roles).length > 0);
  const noRolePeersHint =
    mode === "role" && rolePeers.length === 0
      ? [
          "NOTICE: No workers on the roster advertise a collaboration role.",
          "Degrade gracefully: plan steps with requiredRole as intended seats, assign via skills, set assignKind=skill_fallback, and emit warnings code=no_role_peers.",
        ]
      : [];

  const briefAddon = planPromptAddonForGoal(goal).trim();
  const aggregationHint = isBriefOrReportGoal(goal)
    ? '- For brief/report goals, aggregation MUST be "llm_merge".'
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
    "- Prefer sameLan=true and higher throughputTokensPerSec when quality is otherwise equal. When reputationBySkill is present for the step's requiredSkill, use it as a further tiebreaker (higher reputation wins).",
    "- Soft-match skills (owner-attested specialties per agent). Mesh canExecute is membership only — never a specialty.",
    "- requiredSkill on each step is a specialty/strength hint (e.g. coding, research), NOT a mesh capability id.",
    "- When a non-self worker lists a skill that matches the step, prefer that specialist over isSelf=true. Do not assign every step to isSelf just because they are the creator.",
    "- Spread work across matching specialists when the roster has 2+ peers with different skills.",
    "- dependsOn uses 0-based indices into your steps array.",
    "- Optional threadId: group related steps that should stay on the SAME worker (e.g. \"coding\", \"qa\").",
    "- Optional produces: string[] artifact keys this step will emit; expects: [{ key, fromStepIndex? }] soft parent keys.",
    "- Do not emit <think> tags, chain-of-thought, or markdown — JSON object only.",
    aggregationHint,
    briefAddon,
    "",
    ...modeSection,
    ...noRolePeersHint,
    "",
    "Return ONLY a JSON object (no prose, no markdown fencing) with shape:",
    mode === "role"
      ? '{ "assignmentMode": "role", "steps": [ { "objective": string, "requiredRole": string, "requiredSkill": string, "depth": 1|2|3, "dependsOn": number[], "assignedPeerId": string, "assignKind": "exact_role"|"role_substitute"|"skill_fallback"|"generalist", "missingRole"?: string, "reason": string, "threadId"?: string, "produces"?: string[], "expects"?: [{ "key": string, "fromStepIndex"?: number }], "constraints"?: string[] } ], "aggregation": "llm_merge"|"concatenate", "warnings": [ { "code": string, "role"?: string, "stepIndex"?: number, "usedPeerId"?: string, "assignKind"?: string, "message": string } ], "notes"?: string }'
      : '{ "assignmentMode": "skill", "steps": [ { "objective": string, "requiredSkill": string, "depth": 1|2|3, "dependsOn": number[], "assignedPeerId": string, "reason": string, "threadId"?: string, "produces"?: string[], "expects"?: [{ "key": string, "fromStepIndex"?: number }], "constraints"?: string[] } ], "aggregation": "llm_merge"|"concatenate", "warnings"?: [], "notes"?: string }',
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

function parseAssignKind(raw: unknown): PlanAssignKind | undefined {
  if (raw === "exact_role" || raw === "role_substitute" || raw === "skill_fallback" || raw === "generalist") {
    return raw;
  }
  return undefined;
}

function parseWarnings(raw: unknown): PlanAssignWarning[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanAssignWarning[] = [];
  for (const item of raw.slice(0, 16)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message.trim() : "";
    if (!message) continue;
    const codeRaw = typeof o.code === "string" ? o.code : "skill_fallback";
    const knownCodes: readonly PlanAssignWarningCode[] = [
      "role_missing",
      "role_substitute",
      "skill_fallback",
      "no_role_peers",
      "ambiguous_role",
      "assignee_rewritten",
      "no_llm_role_planning",
    ];
    const code = knownCodes.includes(codeRaw as PlanAssignWarningCode)
      ? (codeRaw as PlanAssignWarningCode)
      : "skill_fallback";
    out.push({
      code,
      role: typeof o.role === "string" ? o.role : undefined,
      stepIndex: typeof o.stepIndex === "number" ? o.stepIndex : undefined,
      usedPeerId: typeof o.usedPeerId === "string" ? o.usedPeerId : undefined,
      assignKind: parseAssignKind(o.assignKind),
      message: message.slice(0, 500),
    });
  }
  return out;
}

export function parsePlanAssignResult(rawText: string): PlanAssignParseResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch {
    return null;
  }
  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const stepsRaw = Array.isArray(parsed)
    ? parsed
    : root && Array.isArray(root.steps)
      ? root.steps
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
    const requiredRole = coerceAgentNetworkRoleId(c.requiredRole) ?? undefined;
    const assignKind = parseAssignKind(c.assignKind);
    const missingRole = typeof c.missingRole === "string" ? c.missingRole : undefined;
    const threadId =
      typeof c.threadId === "string" && c.threadId.trim().length > 0
        ? c.threadId.trim().slice(0, 64)
        : undefined;
    const produces = Array.isArray(c.produces)
      ? c.produces
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim().slice(0, 64))
          .slice(0, 8)
      : undefined;
    const expectsRaw: Array<{ key: string; fromStepIndex?: number }> = [];
    if (Array.isArray(c.expects)) {
      for (const raw of c.expects.slice(0, 16)) {
        if (!raw || typeof raw !== "object") continue;
        const e = raw as Record<string, unknown>;
        const key = typeof e.key === "string" ? e.key.trim().slice(0, 64) : "";
        if (!key) continue;
        if (typeof e.fromStepIndex === "number" && Number.isInteger(e.fromStepIndex)) {
          expectsRaw.push({ key, fromStepIndex: e.fromStepIndex });
        } else {
          expectsRaw.push({ key });
        }
      }
    }
    const expects = expectsRaw.length > 0 ? expectsRaw : undefined;
    drafts.push({
      objective,
      requiredSkill,
      requiredRole,
      depth,
      constraints,
      dependsOnRaw,
      assignedPeerId,
      reason,
      assignKind,
      missingRole,
      threadId,
      produces: produces && produces.length > 0 ? produces : undefined,
      expects: expects && expects.length > 0 ? expects : undefined,
    });
  }
  if (drafts.length === 0) return null;

  const assignmentMode =
    root?.assignmentMode === "role" || root?.assignmentMode === "skill"
      ? root.assignmentMode
      : undefined;
  const notes = typeof root?.notes === "string" ? root.notes.slice(0, 2000) : undefined;
  return {
    steps: drafts,
    warnings: parseWarnings(root?.warnings),
    notes,
    assignmentMode,
  };
}

/** @deprecated Prefer parsePlanAssignResult — kept for existing call sites. */
export function parsePlanAssignSteps(rawText: string): PlanAssignStepDraft[] | null {
  return parsePlanAssignResult(rawText)?.steps ?? null;
}

const SKILL_TO_ROLE: Record<string, AgentNetworkRoleId> = {
  coding: "programmer",
  engineering: "programmer",
  research: "researcher",
  "research.web": "researcher",
  writing: "writer",
  summarization: "writer",
  translation: "writer",
  analysis: "researcher",
};

function inferRequiredRole(draft: PlanAssignStepDraft): AgentNetworkRoleId | undefined {
  if (draft.requiredRole) return draft.requiredRole;
  const skill = draft.requiredSkill.toLowerCase();
  if (SKILL_TO_ROLE[skill]) return SKILL_TO_ROLE[skill];
  for (const [k, role] of Object.entries(SKILL_TO_ROLE)) {
    if (skill.includes(k) || k.includes(skill)) return role;
  }
  return undefined;
}

function inferAssignKind(
  roster: readonly PlanAssignRosterEntry[],
  peerId: string | undefined,
  requiredRole: AgentNetworkRoleId | undefined,
): PlanAssignKind {
  if (!peerId) return "generalist";
  const entry = roster.find((r) => r.peerId === peerId);
  if (!entry) return "generalist";
  if (requiredRole && agentNetworkHasRole(entry.profile?.roles, requiredRole)) {
    return "exact_role";
  }
  if (agentNetworkRoleIds(entry.profile?.roles).length > 0 && requiredRole) {
    return "role_substitute";
  }
  if (requiredRole) return "skill_fallback";
  return "generalist";
}

function bestPeerForRole(
  roster: readonly PlanAssignRosterEntry[],
  role: AgentNetworkRoleId,
  scoreFor: (peerId: string, specialtyHint: string) => number,
  specialtyHint: string,
): string | undefined {
  const matches = roster.filter((r) => agentNetworkHasRole(r.profile?.roles, role));
  if (matches.length === 0) return undefined;
  let best = matches[0]!.peerId;
  let bestS = scoreFor(best, specialtyHint);
  for (const m of matches.slice(1)) {
    const s = scoreFor(m.peerId, specialtyHint);
    if (s > bestS) {
      best = m.peerId;
      bestS = s;
    }
  }
  return best;
}

export function materializePlanAssignSubtasks(input: {
  goal: string;
  chainId: string;
  chainMandateId: string;
  drafts: PlanAssignStepDraft[];
  roster: readonly PlanAssignRosterEntry[];
  createdAt: string;
  deadlineAt?: string;
  assignmentMode?: ChainAssignmentMode;
  /** Warnings already parsed from the LLM (mutated with hygiene additions). */
  warnings?: PlanAssignWarning[];
}): ChainSubtask[] {
  return materializePlanAssignWithMeta(input).subtasks;
}

export function materializePlanAssignWithMeta(input: {
  goal: string;
  chainId: string;
  chainMandateId: string;
  drafts: PlanAssignStepDraft[];
  roster: readonly PlanAssignRosterEntry[];
  createdAt: string;
  deadlineAt?: string;
  assignmentMode?: ChainAssignmentMode;
  warnings?: PlanAssignWarning[];
}): { subtasks: ChainSubtask[]; warnings: PlanAssignWarning[] } {
  const mode = resolveAssignmentMode(input.assignmentMode);
  const warnings = [...(input.warnings ?? [])];
  const allowed = new Set(input.roster.map((r) => r.peerId));
  const rankedPeerIds = input.roster.map((r) => r.peerId);
  const suffix = randomUUID();

  const stepKeys = input.drafts.map((_, i) => `step_${i}`);
  const scoreFor = (peerId: string, specialtyHint: string): number => {
    const entry = input.roster.find((r) => r.peerId === peerId);
    if (!entry) return -1;
    const req = specialtyHint.toLowerCase();
    const skills = agentNetworkSkillIds(entry.profile?.skills);
    let base: number;
    if (skills.some((s) => s === req || s.includes(req) || req.includes(s))) base = 3;
    else if ((entry.membership ?? []).includes("task.execute")) base = 1;
    else base = 0;
    return blendScoreWithReputation(base, skillReputation(entry, req));
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
  /** First assignee per threadId — later steps in the thread stick to this peer. */
  const threadOwner = new Map<string, string>();

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

  const rolePeersExist = input.roster.some(
    (r) => agentNetworkRoleIds(r.profile?.roles).length > 0,
  );
  if (mode === "role" && !rolePeersExist) {
    warnings.push({
      code: "no_role_peers",
      message: "No workers advertise a collaboration role — using skill fallback for assignment.",
      assignKind: "skill_fallback",
    });
  }

  for (const [i, draft] of input.drafts.entries()) {
    const requiredRole = mode === "role" ? inferRequiredRole(draft) : draft.requiredRole;
    const scoredPick = filled[stepKeys[i]!];
    let assignee: string | undefined;
    const llmId =
      draft.assignedPeerId && allowed.has(draft.assignedPeerId) ? draft.assignedPeerId : undefined;

    if (mode === "role" && requiredRole) {
      const exact = bestPeerForRole(input.roster, requiredRole, scoreFor, draft.requiredSkill);
      if (exact) {
        // Prefer exact role; if LLM already picked an exact-role peer, keep LLM.
        if (llmId && agentNetworkHasRole(
          input.roster.find((r) => r.peerId === llmId)?.profile?.roles,
          requiredRole,
        )) {
          assignee = llmId;
        } else {
          assignee = exact;
          if (llmId && llmId !== exact) {
            // Drop stale LLM substitute/missing warnings for this step — rewrite wins.
            for (let wi = warnings.length - 1; wi >= 0; wi--) {
              const w = warnings[wi]!;
              if (w.stepIndex === i && w.code !== "assignee_rewritten") {
                warnings.splice(wi, 1);
              }
            }
            warnings.push({
              code: "assignee_rewritten",
              role: requiredRole,
              stepIndex: i,
              usedPeerId: exact,
              assignKind: "exact_role",
              message: `Rewrote step ${i} assignee to exact role ${requiredRole}.`,
            });
          }
        }
      } else if (llmId) {
        assignee = llmId;
      } else {
        assignee = scoredPick;
      }
    } else if (llmId) {
      const llmScore = scoreFor(llmId, draft.requiredSkill);
      const llmIsSelf = input.roster.find((r) => r.peerId === llmId)?.isSelf === true;
      const peerSpecialist = bestNonSelfSpecialist(draft.requiredSkill);
      const scoredPickScore = scoredPick ? scoreFor(scoredPick, draft.requiredSkill) : -1;
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

    // Phase 53 stickiness: steps sharing threadId keep the first step's assignee.
    const threadId = draft.threadId?.trim();
    if (threadId && assignee) {
      const owner = threadOwner.get(threadId);
      if (owner && allowed.has(owner)) {
        assignee = owner;
      } else {
        threadOwner.set(threadId, assignee);
      }
    }

    // Derive from the final assignee so an exact-role rewrite cannot leave a
    // stale LLM claim (e.g. role_substitute) on the constraint text.
    let assignKind: PlanAssignKind | undefined =
      mode === "role"
        ? inferAssignKind(input.roster, assignee, requiredRole)
        : draft.assignKind;
    if (
      mode === "role" &&
      draft.assignKind === "exact_role" &&
      assignKind !== "exact_role" &&
      requiredRole
    ) {
      warnings.push({
        code: "role_missing",
        role: requiredRole,
        stepIndex: i,
        usedPeerId: assignee,
        assignKind,
        message: `Claimed exact_role for ${requiredRole} but assignee lacks that role — treated as ${assignKind}.`,
      });
    }

    if (
      mode === "role" &&
      assignKind &&
      assignKind !== "exact_role" &&
      !warnings.some((w) => w.stepIndex === i)
    ) {
      warnings.push({
        code:
          assignKind === "role_substitute"
            ? "role_substitute"
            : assignKind === "skill_fallback"
              ? "skill_fallback"
              : "role_missing",
        role: requiredRole,
        stepIndex: i,
        usedPeerId: assignee,
        assignKind,
        message:
          draft.reason?.trim() ||
          `Step ${i}: ${assignKind} for role ${requiredRole ?? "unknown"}.`,
      });
    }

    const dependsOn: string[] = [];
    for (const dep of draft.dependsOnRaw) {
      if (typeof dep === "number" && Number.isInteger(dep) && dep >= 0 && dep < i) {
        dependsOn.push(subtaskIds[dep]!);
      } else if (typeof dep === "string" && dep.startsWith("subtask_")) {
        dependsOn.push(dep);
      }
    }

    const reasonHint = draft.reason ? `Assign reason: ${draft.reason}` : undefined;
    const roleHint =
      mode === "role" && requiredRole
        ? `Required role: ${requiredRole}${assignKind ? ` (${assignKind})` : ""}`
        : undefined;
    const constraints = [...draft.constraints];
    if (roleHint) constraints.push(roleHint);
    if (reasonHint) constraints.push(reasonHint);

    const expects =
      draft.expects && draft.expects.length > 0
        ? draft.expects.map((e) => {
            const fromSubtaskId =
              typeof e.fromStepIndex === "number" &&
              e.fromStepIndex >= 0 &&
              e.fromStepIndex < i
                ? subtaskIds[e.fromStepIndex]
                : undefined;
            return {
              key: e.key,
              ...(fromSubtaskId ? { fromSubtaskId } : {}),
            };
          })
        : dependsOn.length > 0
          ? dependsOn.map((fromSubtaskId) => ({ key: "result", fromSubtaskId }))
          : undefined;

    const obj = {
      version: "0.1" as const,
      subtaskId: subtaskIds[i]!,
      chainId: input.chainId,
      chainMandateId: input.chainMandateId,
      depth: draft.depth,
      requiredSkill: draft.requiredSkill,
      ...(requiredRole ? { requiredRole } : {}),
      ...(threadId ? { threadId } : {}),
      ...(draft.produces && draft.produces.length > 0 ? { produces: draft.produces } : {}),
      ...(expects && expects.length > 0 ? { expects } : {}),
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

  return { subtasks, warnings };
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

/** Format plan warnings for RPC diagnostics strings. */
export function formatPlanWarningDiagnostics(warnings: readonly PlanAssignWarning[]): string[] {
  return warnings.map((w) => {
    const kind = w.assignKind ? ` [${w.assignKind}]` : "";
    const role = w.role ? ` role=${w.role}` : "";
    return `plan:${w.code}${role}${kind}: ${w.message}`;
  });
}
