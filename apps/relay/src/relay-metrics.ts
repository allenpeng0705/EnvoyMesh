/**
 * In-process counters for relay checkin / lookup observability.
 * Surfaced on /version live block, /admin/api/status, and /admin/api/metrics.
 */

export interface RelayLookupMetricsSnapshot {
  checkins: number;
  lookups: number;
  lookupByTopicHash: number;
  lookupByPeerId: number;
  lookupByCapability: number;
  lookupHits: number;
  lookupMisses: number;
  lookupPeersReturned: number;
}

export function createRelayMetrics() {
  const snap: RelayLookupMetricsSnapshot = {
    checkins: 0,
    lookups: 0,
    lookupByTopicHash: 0,
    lookupByPeerId: 0,
    lookupByCapability: 0,
    lookupHits: 0,
    lookupMisses: 0,
    lookupPeersReturned: 0,
  };

  return {
    recordCheckin(): void {
      snap.checkins += 1;
    },
    recordLookup(input: {
      topicHash?: string;
      targetPeerId?: string;
      capability?: string;
      peersReturned: number;
    }): void {
      snap.lookups += 1;
      if (input.topicHash) snap.lookupByTopicHash += 1;
      if (input.targetPeerId) snap.lookupByPeerId += 1;
      if (input.capability) snap.lookupByCapability += 1;
      snap.lookupPeersReturned += input.peersReturned;
      if (input.peersReturned > 0) snap.lookupHits += 1;
      else snap.lookupMisses += 1;
    },
    snapshot(): RelayLookupMetricsSnapshot {
      return { ...snap };
    },
  };
}

export type RelayMetrics = ReturnType<typeof createRelayMetrics>;
