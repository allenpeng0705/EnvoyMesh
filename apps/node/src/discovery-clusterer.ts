/**
 * Discovery Clusterer (Phase 23A extension — unbonded peers)
 *
 * Takes network-wide broadcast discovery results and clusters them
 * into group chat suggestions. Uses the same clustering logic as
 * circle-proposer but operates on unbonded discovery data.
 */

// Uses same clustering pattern as circle-proposer.ts but operates on discovery data

/**
 * Raw discovery result from a broadcast search.
 */
export interface DiscoveryPeer {
  /** Owner ID or peer ID of the discovered peer. */
  ownerId: string;
  /** Display name if known. */
  displayName?: string;
  /** Topics this peer published or advertised. */
  topics: string[];
  /** Capabilities this peer advertised. */
  capabilities: string[];
  /** Whether we're already bonded to this peer. */
  isBonded: boolean;
}

export interface DiscoveryClusterSuggestion {
  /** Human-readable label for the cluster. */
  label: string;
  /** Peers in this cluster (unbonded only). */
  peers: DiscoveryPeer[];
  /** Shared topic tags that define the cluster. */
  topicTags: string[];
  /** Confidence score (0.0–1.0). */
  score: number;
  /** Why this cluster was formed. */
  reason: string;
}

export interface DiscoveryClustererDeps {
  /** Run a broadcast document discovery query and return raw peers. */
  broadcastDocumentDiscovery: (query: string, maxHops?: number) => Promise<DiscoveryPeer[]>;
  /** Run a broadcast capability discovery query and return raw peers. */
  broadcastCapabilityDiscovery: (capabilities: string[], maxHops?: number) => Promise<DiscoveryPeer[]>;
  /** Already-bonded peers (to filter out so we only suggest new connections). */
  getBondedOwnerIds: () => Promise<Set<string>>;
}

/**
 * Run a discovery pass: broadcast for topics + capabilities,
 * cluster the results, and return unbonded group chat suggestions.
 */
export async function generateDiscoveryClusters(
  deps: DiscoveryClustererDeps,
  opts?: {
    /** Owner's interest topics for seeding the broadcast query. */
    seedTopics?: string[];
    /** Owner's capabilities for seeding the broadcast query. */
    seedCapabilities?: string[];
    /** Min number of unbonded peers in a cluster to suggest. */
    minClusterSize?: number;
    /** Max clusters to return. */
    maxClusters?: number;
    /** Max broadcast hops. */
    maxHops?: number;
  },
): Promise<DiscoveryClusterSuggestion[]> {
  const seedTopics = opts?.seedTopics ?? [];
  const seedCapabilities = opts?.seedCapabilities ?? [];
  const minClusterSize = opts?.minClusterSize ?? 3;
  const maxClusters = opts?.maxClusters ?? 5;
  const maxHops = opts?.maxHops ?? 2;

  const bondedIds = await deps.getBondedOwnerIds();
  const allPeers = new Map<string, DiscoveryPeer>();

  // Document discovery broadcast
  for (const topic of seedTopics) {
    if (topic.trim().length === 0) continue;
    const results = await deps.broadcastDocumentDiscovery(topic, maxHops);
    for (const peer of results) {
      if (!bondedIds.has(peer.ownerId)) {
        const existing = allPeers.get(peer.ownerId);
        if (existing) {
          for (const t of peer.topics) {
            if (!existing.topics.includes(t)) existing.topics.push(t);
          }
        } else {
          allPeers.set(peer.ownerId, peer);
        }
      }
    }
  }

  // Capability discovery broadcast
  if (seedCapabilities.length > 0) {
    const capResults = await deps.broadcastCapabilityDiscovery(seedCapabilities, maxHops);
    for (const peer of capResults) {
      if (!bondedIds.has(peer.ownerId)) {
        const existing = allPeers.get(peer.ownerId);
        if (existing) {
          for (const c of peer.capabilities) {
            if (!existing.capabilities.includes(c)) existing.capabilities.push(c);
          }
        } else {
          allPeers.set(peer.ownerId, peer);
        }
      }
    }
  }

  const peers = Array.from(allPeers.values());
  if (peers.length < minClusterSize) return [];

  // Cluster by topic
  const allTopics = new Set<string>();
  for (const p of peers) {
    for (const t of p.topics) allTopics.add(t.toLowerCase());
  }
  for (const p of peers) {
    for (const c of p.capabilities) allTopics.add(c.toLowerCase());
  }

  const clusters: DiscoveryClusterSuggestion[] = [];

  for (const topic of allTopics) {
    const matched: DiscoveryPeer[] = [];
    for (const peer of peers) {
      const hasTopic = peer.topics.some((t) => t.toLowerCase() === topic) ||
        peer.capabilities.some((c) => c.toLowerCase() === topic);
      if (hasTopic) {
        matched.push(peer);
      }
    }

    if (matched.length >= minClusterSize) {
      const score = Math.min(1.0, matched.length / 10);
      const label = `${topic.charAt(0).toUpperCase() + topic.slice(1)} Group`;

      clusters.push({
        label,
        peers: matched,
        topicTags: [topic],
        score,
        reason: `${matched.length} people discovered around "${topic}"`,
      });
    }
  }

  // Deduplicate by peer sets and sort by score
  const seen = new Set<string>();
  const deduped: DiscoveryClusterSuggestion[] = [];
  for (const c of clusters) {
    const key = [...c.peers.map((p) => p.ownerId)].sort().join(",");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(c);
    }
  }

  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, maxClusters);
}

/**
 * Format discovery clusters into a human-readable suggestion for the Assistant.
 */
export function formatDiscoverySuggestions(
  clusters: DiscoveryClusterSuggestion[],
): string {
  if (clusters.length === 0) {
    return "No affinity clusters found in network-wide discovery.";
  }

  const lines: string[] = [
    `Found ${clusters.length} potential group chat(s) from network-wide discovery:`,
    "",
  ];

  for (const cluster of clusters) {
    lines.push(`**${cluster.label}** (${cluster.peers.length} people, score: ${(cluster.score * 100).toFixed(0)}%)`);
    lines.push(`  Topics: ${cluster.topicTags.join(", ")}`);
    lines.push(`  Reason: ${cluster.reason}`);
    lines.push(`  Members: ${cluster.peers.map((p) => p.displayName ?? p.ownerId.slice(0, 12) + "...").join(", ")}`);
    lines.push("");
  }

  lines.push("Want me to introduce you to any of these groups?");
  lines.push("I can send bond requests and create a group chat once connected.");

  return lines.join("\n");
}
