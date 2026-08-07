/**
 * Weighted scoring for Agent Network worker selection.
 *
 * Skills = per-agent specialty factors (owner domains + Agent Skills).
 * Membership tags (mesh) = opt-in / can-execute only — never specialty signals.
 * Hard eligibility is enforced upstream when building the worker pool.
 *
 * See docs/agent-network-vocabulary.md.
 */

import type { AgentNetworkProfile } from "@envoymesh/protocol";
import {
  DEFAULT_AGENT_NETWORK_PROFILE,
  agentNetworkSkillIds,
  coerceAgentNetworkSkills,
} from "@envoymesh/protocol";

export interface WorkerScoreWeights {
  /** Soft match of step specialty hint against agentNetworkProfile.skills. */
  skill: number;
  context: number;
  freshness: number;
  spendPosture: number;
  throughput: number;
  sameLan: number;
}

/**
 * Soft specialty still matters, but throughput / LAN / profile fill gaps when
 * skills are missing — never leave a step unassigned for a mapping miss.
 */
export const DEFAULT_WORKER_SCORE_WEIGHTS: WorkerScoreWeights = {
  skill: 0.3,
  context: 0.2,
  freshness: 0.15,
  spendPosture: 0.1,
  throughput: 0.15,
  sameLan: 0.1,
};

export interface WorkerScoreBreakdown {
  skill: number;
  context: number;
  freshness: number;
  spendPosture: number;
  throughput: number;
  sameLan: number;
}

export interface WorkerScoreResult {
  score: number;
  breakdown: WorkerScoreBreakdown;
  summary: string;
}

const CONTEXT_SCORE: Record<string, number> = {
  "128k": 0.25,
  "256k": 0.5,
  "512k": 0.75,
  "1M+": 1,
};

const SPEND_SCORE: Record<string, number> = {
  subscription: 1,
  metered: 0.55,
  unknown: 0.35,
};

/** Map attested tokens/s into 0..1 (soft ceiling ~200 tok/s). */
export function throughputFit(tokensPerSec: number | undefined): number {
  if (tokensPerSec === undefined || !(tokensPerSec > 0)) return 0.35;
  return Math.max(0, Math.min(1, tokensPerSec / 200));
}

function normalizeWeights(weights: WorkerScoreWeights): WorkerScoreWeights {
  const sum =
    weights.skill +
    weights.context +
    weights.freshness +
    weights.spendPosture +
    weights.throughput +
    weights.sameLan;
  if (!(sum > 0)) return { ...DEFAULT_WORKER_SCORE_WEIGHTS };
  return {
    skill: weights.skill / sum,
    context: weights.context / sum,
    freshness: weights.freshness / sum,
    spendPosture: weights.spendPosture / sum,
    throughput: weights.throughput / sum,
    sameLan: weights.sameLan / sum,
  };
}

/**
 * Specialty fit from Agent Network skills only.
 * Membership tags are not consulted — they are identical across opted-in workers.
 */
function skillFit(
  specialtyHint: string,
  skills: readonly string[],
  canExecute: boolean,
): number {
  const req = specialtyHint.trim().toLowerCase();
  // Generic execute steps: no specialty preference beyond can-execute.
  if (!req || req === "task.execute") {
    return canExecute ? 0.5 : 0.2;
  }
  const skillHit = skills.some((s) => {
    const t = s.toLowerCase();
    return t === req || req.includes(t) || t.includes(req);
  });
  if (skillHit) return 1;
  // Generalist baseline — still assignable, just not a specialist match.
  return canExecute ? 0.45 : 0.2;
}

function canExecuteFromMembership(membership: readonly string[]): boolean {
  return membership.includes("task.execute") || membership.length > 0;
}

/**
 * Score a candidate worker for a step specialty hint (`requiredSkill`).
 * Membership is can-execute only — never a specialty factor.
 */
export function scoreAgentNetworkWorker(input: {
  requiredSkill: string;
  /** Membership tags — used only for can-execute baseline, never specialty. */
  membership: readonly string[];
  profile?:
    | (Partial<Omit<AgentNetworkProfile, "skills">> & {
        skills?: readonly (string | import("@envoymesh/protocol").AgentNetworkSkillEntry)[];
      })
    | null;
  weights?: Partial<WorkerScoreWeights>;
  displayName?: string;
  /** Soft boost when peer appears same-LAN / low RTT. */
  sameLan?: boolean;
}): WorkerScoreResult {
  const profile: AgentNetworkProfile = {
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input.profile,
    skills: coerceAgentNetworkSkills(input.profile?.skills ?? DEFAULT_AGENT_NETWORK_PROFILE.skills),
  };
  const weights = normalizeWeights({
    ...DEFAULT_WORKER_SCORE_WEIGHTS,
    ...input.weights,
  });
  const canExecute = canExecuteFromMembership(input.membership);

  const breakdown: WorkerScoreBreakdown = {
    skill: skillFit(input.requiredSkill, agentNetworkSkillIds(profile.skills), canExecute),
    context: CONTEXT_SCORE[profile.contextWindow] ?? 0.25,
    freshness: Math.max(0, Math.min(1, (profile.modelFreshness - 1) / 9)),
    spendPosture: SPEND_SCORE[profile.spendPosture] ?? 0.35,
    throughput: throughputFit(profile.throughputTokensPerSec),
    sameLan: input.sameLan === true ? 1 : 0.35,
  };

  const score =
    weights.skill * breakdown.skill +
    weights.context * breakdown.context +
    weights.freshness * breakdown.freshness +
    weights.spendPosture * breakdown.spendPosture +
    weights.throughput * breakdown.throughput +
    weights.sameLan * breakdown.sameLan;

  const name = input.displayName?.trim() || "worker";
  const tok =
    profile.throughputTokensPerSec !== undefined
      ? `${profile.throughputTokensPerSec} tok/s`
      : "tok/s n/a";
  const lan = input.sameLan === true ? "lan" : "wan?";
  const summary = `${name}: score ${score.toFixed(2)} (skill ${breakdown.skill.toFixed(2)}, ctx ${profile.contextWindow}, fresh ${profile.modelFreshness}/10, ${profile.spendPosture}, ${tok}, ${lan})`;

  return { score, breakdown, summary };
}

/** Sort peer ids by descending score; stable for ties. */
export function rankWorkersByScore<T extends { peerId: string; score: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.peerId.localeCompare(b.peerId);
  });
}

/**
 * Pick an assignee for every step. Never skips a step when the pool is non-empty.
 * Sole worker → all steps; otherwise prefer specialty then best remaining score.
 */
export function assignWorkersToSteps(input: {
  steps: Array<{ stepKey: string; requiredSkill: string }>;
  rankedPeerIds: string[];
  scoreFor: (peerId: string, requiredSkill: string) => number;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.rankedPeerIds.length === 0) return out;
  if (input.rankedPeerIds.length === 1) {
    const only = input.rankedPeerIds[0]!;
    for (const step of input.steps) out[step.stepKey] = only;
    return out;
  }
  for (const step of input.steps) {
    let best = input.rankedPeerIds[0]!;
    let bestScore = input.scoreFor(best, step.requiredSkill);
    for (const peerId of input.rankedPeerIds.slice(1)) {
      const s = input.scoreFor(peerId, step.requiredSkill);
      if (s > bestScore) {
        best = peerId;
        bestScore = s;
      }
    }
    out[step.stepKey] = best;
  }
  return out;
}
