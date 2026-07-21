import type {
  RelayBookState,
  RelayHint,
  RelayLookupPayload,
  RelayRelation,
} from "@envoymesh/protocol";

export interface RelayBookEntry {
  relayId: string;
  level?: number;
  region?: string;
  addrs: string[];
  relation: RelayRelation;
  state: RelayBookState;
  lastVerifiedAt: number;
  expiresAt: number;
  failureCount: number;
}

export interface RelayLookupRouteInput {
  payload: RelayLookupPayload;
  relayBook: RelayBookEntry[];
  selfRelayId?: string;
}

export interface RelayLookupRouteDecision {
  forwardTargets: RelayHint[];
  duplicate: boolean;
  reason?: string;
}

export interface RelayLookupRouterOptions {
  now?: () => number;
  seenQueryTtlMs?: number;
  negativeCacheTtlMs?: number;
}

export interface RelayLookupRouterMetrics {
  forwardedLookupCount: number;
  duplicateQueryDropCount: number;
  negativeCacheSize: number;
  selectedForwardTargetCount: number;
  failedForwardCount: number;
  collectedForwardResponseCount: number;
}

const DEFAULT_SEEN_QUERY_TTL_MS = 60_000;
const DEFAULT_NEGATIVE_CACHE_TTL_MS = 20_000;

/** Forward only to verified / active / seed siblings (not leaf candidates). */
function isForwardableState(state: RelayBookState): boolean {
  return state === "verified" || state === "active" || state === "seed";
}

export function createRelayLookupRouter(options: RelayLookupRouterOptions = {}) {
  const now = options.now ?? Date.now;
  const seenQueryTtlMs = options.seenQueryTtlMs ?? DEFAULT_SEEN_QUERY_TTL_MS;
  const negativeCacheTtlMs = options.negativeCacheTtlMs ?? DEFAULT_NEGATIVE_CACHE_TTL_MS;
  const seenQueries = new Map<string, number>();
  const negativeCache = new Map<string, number>();
  const metrics: RelayLookupRouterMetrics = {
    forwardedLookupCount: 0,
    duplicateQueryDropCount: 0,
    negativeCacheSize: 0,
    selectedForwardTargetCount: 0,
    failedForwardCount: 0,
    collectedForwardResponseCount: 0,
  };

  function prune(): void {
    const current = now();
    for (const [key, expiresAt] of seenQueries) {
      if (expiresAt <= current) seenQueries.delete(key);
    }
    for (const [key, expiresAt] of negativeCache) {
      if (expiresAt <= current) negativeCache.delete(key);
    }
  }

  return {
    markSeen(queryId: string): boolean {
      prune();
      if (seenQueries.has(queryId)) {
        metrics.duplicateQueryDropCount += 1;
        return false;
      }
      seenQueries.set(queryId, now() + seenQueryTtlMs);
      return true;
    },

    selectForwardTargets(input: RelayLookupRouteInput): RelayLookupRouteDecision {
      prune();
      const { payload } = input;
      if (payload.maxHops <= 0) {
        return { forwardTargets: [], duplicate: false, reason: "maxHops exhausted" };
      }
      const candidates = activeRelayBook(input.relayBook, now())
        .filter((entry) => entry.relayId !== input.selfRelayId)
        .filter((entry) => entry.addrs.length > 0)
        .filter((entry) => isForwardableState(entry.state))
        .filter((entry) => !negativeCache.has(negativeKey(payload, entry.relayId)));

      const scored = candidates
        .map((entry) => ({
          entry,
          score: relationScore(entry),
        }))
        .sort((left, right) => right.score - left.score || relationRank(left.entry) - relationRank(right.entry));

      const forwardTargets = scored.slice(0, payload.maxFanout).map<RelayHint>(({ entry }) => ({
        relayId: entry.relayId,
        level: entry.level,
        region: entry.region,
        multiaddrs: entry.addrs,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      }));
      metrics.selectedForwardTargetCount += forwardTargets.length;
      return { forwardTargets, duplicate: false };
    },

    recordNegative(payload: RelayLookupPayload, relayId: string): void {
      prune();
      negativeCache.set(negativeKey(payload, relayId), now() + negativeCacheTtlMs);
      metrics.negativeCacheSize = negativeCache.size;
    },

    recordForwardedLookup(count = 1): void {
      metrics.forwardedLookupCount += count;
    },

    recordFailedForward(count = 1): void {
      metrics.failedForwardCount += count;
    },

    recordCollectedForwardResponse(count = 1): void {
      metrics.collectedForwardResponseCount += count;
    },

    metrics(): RelayLookupRouterMetrics {
      prune();
      metrics.negativeCacheSize = negativeCache.size;
      return { ...metrics };
    },
  };
}

function activeRelayBook(relayBook: RelayBookEntry[], current: number): RelayBookEntry[] {
  return relayBook.filter(
    (entry) => entry.expiresAt > current && entry.state !== "removed" && entry.state !== "stale",
  );
}

function relationScore(relay: RelayBookEntry): number {
  switch (relay.relation) {
    case "sibling":
      return 8;
    case "parent":
    case "ancestor":
      return 6;
    case "child":
      return 4;
    case "candidate":
      return 1;
  }
}

function relationRank(relay: RelayBookEntry): number {
  switch (relay.relation) {
    case "sibling":
      return 0;
    case "parent":
      return 1;
    case "ancestor":
      return 2;
    case "child":
      return 3;
    case "candidate":
      return 4;
  }
}

// Negative-cache key: for targetPeerId queries the key is relayId:peerId
// regardless of capability/topicHash. This is correct because the relay
// either has the peer's reservation (regardless of what capability was
// requested) or it doesn't. A negative for one capability correctly
// suppresses all capability queries for that peer on that relay.
function negativeKey(payload: RelayLookupPayload, relayId: string): string {
  const target = payload.targetPeerId ?? payload.targetOwnerId ?? payload.capability ?? payload.topicHash ?? "unknown";
  return `${relayId}:${target}`;
}
