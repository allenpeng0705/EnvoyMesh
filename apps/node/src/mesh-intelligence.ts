/**
 * Mesh Intelligence Report (Phase 27)
 *
 * Your personal network analyst. Combines all AI subsystems into a single
 * coherent narrative about the state of your mesh — what's happening,
 * who to trust, what to explore, and what you might be missing.
 *
 * One prompt: "What's happening in my mesh?" → comprehensive analysis.
 */

export interface MeshIntelligenceInput {
  /** Owner's interest topics. */
  ownerTopics: string[];
  /** Owner's capabilities. */
  ownerCapabilities: string[];
}

export interface MeshIntelligenceSection {
  /** Section heading. */
  heading: string;
  /** Narrative content. */
  content: string;
  /** Priority (higher = more important, shown first). */
  priority: number;
}

export interface MeshDiscoveryPeer {
  ownerId: string;
  displayName?: string;
  topics: string[];
  capabilities: string[];
  bondLevel?: string;
  reputationScore?: number;
  lastInteractionAt?: string;
}

export interface MeshIntelligenceDeps {
  /** Scan bonded peers for published topics and capabilities. */
  scanBondedPeers: () => Promise<MeshDiscoveryPeer[]>;
  /** Scan unbonded discovery results for new people. */
  scanDiscovery: (topics: string[], capabilities: string[]) => Promise<MeshDiscoveryPeer[]>;
  /** Get feedback scores for peers. */
  getReputationScores: () => Promise<Map<string, number>>;
  /** Find dormant bonds (no interaction in N days). */
  findDormantBonds: (thresholdDays: number) => Promise<MeshDiscoveryPeer[]>;
  /** Get 2nd-degree connections (contacts of contacts). */
  findSecondDegreeConnections: () => Promise<MeshDiscoveryPeer[]>;
  /** Generate a natural-language narrative from structured data. */
  generateNarrative: (prompt: string) => Promise<string>;
}

export interface MeshIntelligenceReport {
  /** Report title. */
  title: string;
  /** Generated timestamp. */
  generatedAt: string;
  /** Number of peers analyzed. */
  peersAnalyzed: number;
  /** Report sections ordered by priority. */
  sections: MeshIntelligenceSection[];
  /** Raw data summary for debugging. */
  summary: string;
}

/**
 * Generate a comprehensive mesh intelligence report.
 */
export async function generateMeshIntelligenceReport(
  deps: MeshIntelligenceDeps,
  input: MeshIntelligenceInput,
  opts?: {
    dormantBondThresholdDays?: number;
    minReputationScore?: number;
  },
): Promise<MeshIntelligenceReport> {
  const dormantThreshold = opts?.dormantBondThresholdDays ?? 90;

  // Phase 1: Gather all data in parallel
  const [
    bondedPeers,
    discoveryPeers,
    reputationScores,
    dormantBonds,
    secondDegree,
  ] = await Promise.all([
    deps.scanBondedPeers(),
    deps.scanDiscovery(input.ownerTopics, input.ownerCapabilities),
    deps.getReputationScores(),
    deps.findDormantBonds(dormantThreshold),
    deps.findSecondDegreeConnections(),
  ]);

  const sections: MeshIntelligenceSection[] = [];

  // Section 1: Network Health (always first)
  const totalBonds = bondedPeers.length;
  const activeBonds = totalBonds - dormantBonds.length;
  const discoveryCount = discoveryPeers.length;
  const secondDegreeCount = secondDegree.length;
  // Count unique owners across bonded + discovery so we don't double-count
  // someone who shows up in both lists.
  const allOwnerIds = new Set<string>();
  for (const p of bondedPeers) allOwnerIds.add(p.ownerId);
  for (const p of discoveryPeers) allOwnerIds.add(p.ownerId);

  const healthSummary = [
    `${totalBonds} bonded contacts (${activeBonds} active, ${dormantBonds.length} dormant)`,
    `${discoveryCount} new people discovered in your interest areas`,
    `${secondDegreeCount} 2nd-degree connections through your contacts`,
  ].join("\n");

  sections.push({
    heading: "Network Health",
    content: healthSummary,
    priority: 100,
  });

  // Section 2: Trending Topics
  const topicCounts = new Map<string, number>();
  for (const peer of bondedPeers) {
    for (const topic of peer.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const trending = [...topicCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  if (trending.length > 0) {
    const topicSummary = trending
      .map(([topic, count]) => `"${topic}" — ${count} contact(s)`)
      .join("\n");
    sections.push({
      heading: "Trending Topics in Your Mesh",
      content: topicSummary,
      priority: 90,
    });
  }

  // Section 3: Dormant Bonds
  if (dormantBonds.length > 0) {
    const dormantSummary = dormantBonds
      .slice(0, 10)
      .map((p) => `${p.displayName ?? p.ownerId}: last interaction ${p.lastInteractionAt ?? "unknown"}`)
      .join("\n");
    sections.push({
      heading: `${dormantBonds.length} Dormant Bonds`,
      content: `${dormantBonds.length} contacts you haven't interacted with in ${dormantThreshold}+ days:\n${dormantSummary}\n\nConsider sending a check-in message.`,
      priority: 80,
    });
  }

  // Section 4: Reputation
  const minRepScore = opts?.minReputationScore ?? 0;
  // Include all bonded peers, but mark those without reputation scores.
  // This avoids silently excluding peers whose feedback hasn't arrived yet.
  const scoredPeers = bondedPeers
    .filter((p) => (reputationScores.get(p.ownerId) ?? 0) >= minRepScore)
    .sort((a, b) => (reputationScores.get(b.ownerId) ?? 0) - (reputationScores.get(a.ownerId) ?? 0))
    .slice(0, 10);

  if (scoredPeers.length > 0) {
    const repSummary = scoredPeers
      .map((p) => {
        const score = reputationScores.get(p.ownerId);
        const scoreText =
          score === undefined
            ? "no data"
            : `reputation ${(score * 100).toFixed(0)}%`;
        const caps = p.capabilities.slice(0, 3).join(", ") || "no listed capabilities";
        return `${p.displayName ?? p.ownerId}: ${scoreText} (${caps})`;
      })
      .join("\n");
    sections.push({
      heading: "Most Trusted Contacts",
      content: repSummary,
      priority: 70,
    });
  }

  // Section 5: Growth Opportunities
  if (discoveryPeers.length > 0 || secondDegree.length > 0) {
    const growthSummary = [
      discoveryPeers.length > 0
        ? `${discoveryPeers.length} new people discovered matching your interests. Top matches:\n${discoveryPeers.slice(0, 5).map((p) => `  ${p.displayName ?? p.ownerId}: ${p.topics.slice(0, 3).join(", ")}`).join("\n")}`
        : "",
      secondDegree.length > 0
        ? `\n${secondDegree.length} people your contacts know:\n${secondDegree.slice(0, 5).map((p) => `  ${p.displayName ?? p.ownerId}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");
    sections.push({
      heading: "Growth Opportunities",
      content: growthSummary || "No immediate growth opportunities detected.",
      priority: 60,
    });
  }

  // Phase 2: LLM synthesizes a narrative
  const narrativePrompt = [
    "You are an AI network analyst. Given the following structured data about a P2P mesh network, write a concise, helpful summary for the network owner.",
    "",
    "=== NETWORK HEALTH ===",
    healthSummary,
    "",
    "=== TRENDING TOPICS ===",
    trending.map(([t, c]) => `"${t}": ${c} contacts`).join("\n") || "None",
    "",
    "=== DORMANT BONDS ===",
    dormantBonds.length > 0
      ? `${dormantBonds.length} dormant contacts: ${dormantBonds.slice(0, 5).map((p) => p.displayName ?? p.ownerId).join(", ")}`
      : "No dormant bonds.",
    "",
    "=== REPUTATION ===",
    scoredPeers.length > 0
      ? scoredPeers.slice(0, 3).map((p) => `${p.displayName ?? p.ownerId}: score ${((reputationScores.get(p.ownerId) ?? 0) * 100).toFixed(0)}%`).join(", ")
      : "No reputation data yet.",
    "",
    "=== GROWTH ===",
    `${discoveryPeers.length} discovered, ${secondDegree.length} 2nd-degree connections.`,
    "",
    "Format: 3-4 paragraphs, friendly tone, focus on what the owner should DO next.",
  ].join("\n");

  const narrative = await deps.generateNarrative(narrativePrompt);

  sections.push({
    heading: "Your Mesh at a Glance",
    content: narrative,
    priority: 100,
  });

  sections.sort((a, b) => b.priority - a.priority);

  return {
    title: "Mesh Intelligence Report",
    generatedAt: new Date().toISOString(),
    peersAnalyzed: allOwnerIds.size,
    sections,
    summary: narrative,
  };
}
