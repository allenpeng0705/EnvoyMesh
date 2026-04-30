import type { RelayHint, RelayLookupPayload, RelaySummaryPayload } from "@envoymesh/protocol";
import type { RelayBookEntry } from "./relay-roster.js";
import type { RelayManagerRoutingMetrics } from "@envoymesh/local-store";

export interface RelaySummaryEntry {
  relayId: string;
  summary: RelaySummaryPayload;
  lastSeenAt: number;
  expiresAt: number;
}

export interface RelayLookupRouteInput {
  payload: RelayLookupPayload;
  relayBook: RelayBookEntry[];
  summaries: RelaySummaryEntry[];
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

const DEFAULT_SEEN_QUERY_TTL_MS = 60_000;
const DEFAULT_NEGATIVE_CACHE_TTL_MS = 20_000;

export function createRelayLookupRouter(options: RelayLookupRouterOptions = {}) {
  const now = options.now ?? Date.now;
  const seenQueryTtlMs = options.seenQueryTtlMs ?? DEFAULT_SEEN_QUERY_TTL_MS;
  const negativeCacheTtlMs = options.negativeCacheTtlMs ?? DEFAULT_NEGATIVE_CACHE_TTL_MS;
  const seenQueries = new Map<string, number>();
  const negativeCache = new Map<string, number>();
  const metrics: RelayManagerRoutingMetrics = {
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
      if (expiresAt <= current) {
        seenQueries.delete(key);
      }
    }
    for (const [key, expiresAt] of negativeCache) {
      if (expiresAt <= current) {
        negativeCache.delete(key);
      }
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
        .filter((entry) => !negativeCache.has(negativeKey(payload, entry.relayId)));

      const summaryByRelay = new Map(input.summaries.map((entry) => [entry.relayId, entry]));
      const scored = candidates
        .map((entry) => ({
          entry,
          score: scoreRelay(entry, summaryByRelay.get(entry.relayId), payload, now()),
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

    negativeCacheSize(): number {
      prune();
      metrics.negativeCacheSize = negativeCache.size;
      return negativeCache.size;
    },

    metrics(): RelayManagerRoutingMetrics {
      prune();
      metrics.negativeCacheSize = negativeCache.size;
      return { ...metrics };
    },
  };
}

function activeRelayBook(relayBook: RelayBookEntry[], current: number): RelayBookEntry[] {
  return relayBook.filter((entry) => entry.expiresAt > current && entry.state !== "removed" && entry.state !== "stale");
}

function scoreRelay(
  relay: RelayBookEntry,
  summary: RelaySummaryEntry | undefined,
  payload: RelayLookupPayload,
  current: number,
): number {
  let score = 0;
  if (summary && summary.expiresAt > current) {
    score += 10;
    if (payload.capability && summary.summary.topicBuckets.includes(`capability:${payload.capability}`)) {
      score += 50;
    }
    if (payload.topicHash && summary.summary.topicBuckets.includes(payload.topicHash)) {
      score += 50;
    }
    if (summary.summary.livePeerCount > 0) {
      score += Math.min(10, summary.summary.livePeerCount);
    }
  }

  switch (relay.relation) {
    case "sibling":
      score += 8;
      break;
    case "parent":
    case "ancestor":
      score += 6;
      break;
    case "child":
      score += 4;
      break;
    case "candidate":
      score += 1;
      break;
  }
  return score;
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

function negativeKey(payload: RelayLookupPayload, relayId: string): string {
  const target = payload.targetPeerId ?? payload.targetOwnerId ?? payload.capability ?? payload.topicHash ?? "unknown";
  return `${relayId}:${target}`;
}
