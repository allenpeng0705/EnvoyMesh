/**
 * Mesh Awareness Worker (Phase 25A)
 *
 * Periodic scan of discovery topics and published libraries to generate
 * proactive insights about mesh activity.
 */

export interface MeshAwarenessDeps {
  /** Get owner's current interest topics. */
  getOwnerInterestTopics: () => Promise<string[]>;
  /** Get bonded peers' published document topics. */
  getBondedPeerTopics: () => Promise<Array<{ ownerId: string; topics: string[] }>>;
}

export interface MeshAwarenessInsight {
  kind: string;
  summary: string;
  matchedTopic: string;
  peerCount: number;
  createdAt: string;
}

/**
 * Scan mesh activity and generate insights when owner interests
 * align with peer activity.
 */
export async function generateMeshInsights(
  deps: MeshAwarenessDeps,
  opts?: { minOverlapScore?: number },
): Promise<MeshAwarenessInsight[]> {
  const minScore = opts?.minOverlapScore ?? 0.3;

  const ownerTopics = await deps.getOwnerInterestTopics();
  if (ownerTopics.length === 0) return [];

  const peerTopicList = await deps.getBondedPeerTopics();
  const insights: MeshAwarenessInsight[] = [];

  for (const ownerTopic of ownerTopics) {
    const matchingPeers = peerTopicList.filter((p) =>
      p.topics.some((t) => t.toLowerCase().includes(ownerTopic.toLowerCase())),
    );

    const overlapScore = matchingPeers.length / Math.max(1, peerTopicList.length);
    if (overlapScore >= minScore && matchingPeers.length > 0) {
      insights.push({
        kind: "mesh_awareness_insight",
        summary: `${matchingPeers.length} contact${matchingPeers.length > 1 ? "s" : ""} researching "${ownerTopic}"`,
        matchedTopic: ownerTopic,
        peerCount: matchingPeers.length,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return insights;
}
