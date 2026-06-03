/**
 * Reputation Router (Phase 24C)
 *
 * Ranks capability providers by aggregated task.feedback scores.
 * Prefers bonded providers, falls back to unbonded when none available.
 */

export interface ReputationProvider {
  ownerId: string;
  peerId: string;
  bondLevel: string;
  /** Aggregated feedback score (0.0–1.0). */
  reputationScore: number;
  /** Number of completed tasks (for confidence weighting). */
  completedTaskCount: number;
}

/**
 * Rank providers: bonded + high-score first, then unbonded.
 */
export function rankProviders(
  providers: ReputationProvider[],
  opts?: { minScore?: number; maxResults?: number },
): ReputationProvider[] {
  const minScore = opts?.minScore ?? 0;
  const maxResults = opts?.maxResults ?? 5;

  return providers
    .filter((p) => p.reputationScore >= minScore)
    .sort((a, b) => {
      // Bonded/referred before unbonded
      const bondOrder = (level: string) => (level === "direct" ? 0 : level === "referred" ? 1 : 2);
      const aBond = bondOrder(a.bondLevel);
      const bBond = bondOrder(b.bondLevel);
      if (aBond !== bBond) return aBond - bBond;
      // Higher score first
      if (b.reputationScore !== a.reputationScore) return b.reputationScore - a.reputationScore;
      // More completed tasks as tiebreaker
      return b.completedTaskCount - a.completedTaskCount;
    })
    .slice(0, maxResults);
}

/**
 * Aggregate task.feedback scores into a provider reputation.
 * Simple rolling average: each completed task contributes equally.
 */
export function aggregateReputation(
  feedbackScores: Array<{ score: number }>,
): { reputationScore: number; completedTaskCount: number } {
  const valid = feedbackScores.filter((f) => f.score >= 0 && f.score <= 1);
  if (valid.length === 0) return { reputationScore: 0.5, completedTaskCount: valid.length };
  const avg = valid.reduce((sum, f) => sum + f.score, 0) / valid.length;
  return { reputationScore: Math.round(avg * 100) / 100, completedTaskCount: valid.length };
}
