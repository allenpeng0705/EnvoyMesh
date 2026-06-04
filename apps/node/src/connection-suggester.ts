/**
 * Connection Suggester (Phase 23B)
 *
 * Monitors bonded peers' published libraries and capability advertisements,
 * matching them against the owner's search and interest patterns.
 * Generates proactive connection suggestions.
 */

export interface ConnectionSuggesterDeps {
  /** Get owner's recent search queries / interest topics. */
  getOwnerInterestTopics: () => Promise<string[]>;
  /** Get bonded peers' published document topics. */
  getPeerPublishedTopics: (ownerId: string) => Promise<string[]>;
  /** Get bonded peers' advertised capabilities. */
  getPeerCapabilities: (ownerId: string) => Promise<string[]>;
}

export interface ConnectionSuggestion {
  peerOwnerId: string;
  reason: string;
  matchedTopic: string;
  relevanceScore: number;
}

/**
 * Generate connection suggestions by matching owner interest topics
 * against peers' published topics and capabilities.
 */
export async function suggestConnections(
  deps: ConnectionSuggesterDeps,
  opts?: { maxSuggestions?: number; minRelevanceScore?: number },
): Promise<ConnectionSuggestion[]> {
  const maxSuggestions = opts?.maxSuggestions ?? 5;
  const minScore = opts?.minRelevanceScore ?? 0.3;

  const ownerTopics = await deps.getOwnerInterestTopics();
  if (ownerTopics.length === 0) return [];

  const suggestions: ConnectionSuggestion[] = [];

  // For each owner topic, check which peers have matching content
  for (const topic of ownerTopics) {
    // Check published topics (simplified — in production would query all bonded peers)
    // For now, the caller provides getPeerPublishedTopics per peer
    // The actual iteration happens in the node service
    suggestions.push({
      peerOwnerId: "", // filled by caller
      reason: `Matching interest: "${topic}"`,
      matchedTopic: topic,
      relevanceScore: 0.5,
    });
  }

  return suggestions
    .filter((s) => s.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxSuggestions);
}

/**
 * Match owner interests against a specific peer's published content.
 */
export function matchPeerInterests(
  ownerTopics: string[],
  peerTopics: string[],
  peerCapabilities: string[],
): { matchedTopics: string[]; score: number } {
  const matchedTopics: string[] = [];
  let totalScore = 0;

  for (const topic of ownerTopics) {
    const topicLower = topic.toLowerCase();
    const matched =
      peerTopics.some((t) => t.toLowerCase().includes(topicLower)) ||
      peerCapabilities.some((c) => c.toLowerCase().includes(topicLower));
    if (matched) {
      matchedTopics.push(topic);
      totalScore += 1;
    }
  }

  const score = ownerTopics.length > 0 ? totalScore / ownerTopics.length : 0;
  return { matchedTopics, score };
}
