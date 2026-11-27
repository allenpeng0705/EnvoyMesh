/**
 * Phase 69C — discover bonded published-library hits for owner interests.
 * Shortlist only — does not start document acquisition jobs.
 */
import {
  scoreCatalogDocumentCandidate,
  type DiscoverPublishedLibraryPeerResult,
} from "@envoymesh/api";

export interface BondedResourceShortlistHit {
  title: string;
  remoteOwnerId: string;
  remoteDisplayName?: string;
  matchedTopic: string;
  documentId: string;
  relativePath: string;
  score: number;
}

export interface BondedResourceShortlistPassDeps {
  getOwnerInterestTopics: () => Promise<string[]>;
  discoverPublishedLibrary: (params: {
    fileTitleQuery: string;
    maxResultsPerPeer?: number;
    overallTimeoutMs?: number;
  }) => Promise<DiscoverPublishedLibraryPeerResult[]>;
  maxTopics?: number;
  maxHits?: number;
}

export async function runBondedResourceShortlistPass(
  deps: BondedResourceShortlistPassDeps,
): Promise<BondedResourceShortlistHit[]> {
  const topics = (await deps.getOwnerInterestTopics())
    .map((t) => t.trim())
    .filter(Boolean);
  if (topics.length === 0) return [];

  const maxTopics = Math.max(1, Math.min(5, deps.maxTopics ?? 3));
  const maxHits = Math.max(1, Math.min(20, deps.maxHits ?? 8));
  const selected = topics.slice(0, maxTopics);
  const hits: BondedResourceShortlistHit[] = [];
  const seen = new Set<string>();

  for (const topic of selected) {
    const peers = await deps.discoverPublishedLibrary({
      fileTitleQuery: topic,
      maxResultsPerPeer: 2,
      overallTimeoutMs: 20_000,
    });
    for (const peer of peers) {
      if (peer.error || peer.files.length === 0) continue;
      for (const file of peer.files) {
        const score = scoreCatalogDocumentCandidate(topic, {
          title: file.title,
          relativePath: file.relativePath,
        });
        if (score < 0.2) continue;
        const key = `${peer.peerOwnerId}:${file.documentId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          title: file.title || file.relativePath,
          remoteOwnerId: peer.peerOwnerId,
          remoteDisplayName: peer.displayName,
          matchedTopic: topic,
          documentId: file.documentId,
          relativePath: file.relativePath,
          score,
        });
      }
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, maxHits);
}
