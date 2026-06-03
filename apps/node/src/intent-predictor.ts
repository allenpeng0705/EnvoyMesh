/**
 * Intent Predictor (Phase 25D)
 *
 * Tracks owner's command patterns and pre-fetches results.
 * Simple frequency-based prediction — no model required.
 */

export interface IntentPredictorDeps {
  /** Get recently used intent patterns. */
  getRecentIntents: () => Promise<Array<{ intent: string; query: string; timestamp: string }>>;
}

export interface IntentPrediction {
  intent: string;
  predictedQuery: string;
  confidence: number;
}

/**
 * Predict the owner's likely intent based on recent patterns.
 */
export function predictIntent(
  recentIntents: Array<{ intent: string; query: string; timestamp: string }>,
  partialInput: string,
  opts?: { minConfidence?: number; maxPredictions?: number },
): IntentPrediction[] {
  const minConfidence = opts?.minConfidence ?? 0.3;
  const maxPredictions = opts?.maxPredictions ?? 3;

  if (!partialInput.trim()) return [];

  const inputLower = partialInput.toLowerCase();
  const inputWords = inputLower.split(/\s+/).filter((w) => w.length > 1);
  if (inputWords.length === 0) return [];

  const scored: Array<{ intent: string; query: string; score: number }> = [];

  for (const entry of recentIntents) {
    const queryLower = entry.query.toLowerCase();
    let score = 0;
    for (const word of inputWords) {
      if (queryLower.includes(word)) score += 1;
    }
    // Normalize by shared prefix bonus
    if (queryLower.startsWith(inputLower)) score += 2;

    const normalizedScore = score / Math.max(1, inputWords.length + 1);

    if (normalizedScore > 0) {
      scored.push({ intent: entry.intent, query: entry.query, score: normalizedScore });
    }
  }

  // Deduplicate by intent
  const seen = new Set<string>();
  const deduped = scored.filter((s) => {
    if (seen.has(s.intent)) return false;
    seen.add(s.intent);
    return true;
  });

  return deduped
    .filter((s) => s.score >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPredictions)
    .map((s) => ({ intent: s.intent, predictedQuery: s.query, confidence: Math.round(s.score * 100) / 100 }));
}
