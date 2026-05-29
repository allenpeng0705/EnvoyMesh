/**
 * Browser-safe subset of @envoymesh/local-store for Capacitor (no node:fs).
 */
import type { MorningReportEntry } from "@envoymesh/api";

export interface MultiHopDiscoveryMatchRow {
  ownerId: string;
  peerId: string;
  hopDistance: number;
  matchedCapabilities: string[];
  matchedTagHashes: string[];
  viaOwnerId?: string;
  viaDisplayName?: string;
  referralOwnerId?: string;
  trustPath?: string;
}

export interface MultiHopDiscoverySession {
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  bondsQueried: number;
  pendingForwardApprovals: number;
  awaitingHop2ViaBonds: string[];
  matches: MultiHopDiscoveryMatchRow[];
}

export interface MultiHopDiscoveryStore {
  upsertSession(session: MultiHopDiscoverySession): Promise<void>;
  appendMatches(
    correlationId: string,
    matches: MultiHopDiscoveryMatchRow[],
    input?: { pendingForwardApprovals?: number },
  ): Promise<MultiHopDiscoverySession | undefined>;
  applyInboundResponse(
    correlationId: string,
    input: {
      responderOwnerId: string;
      forwardPendingAck?: boolean;
      matches: MultiHopDiscoveryMatchRow[];
    },
  ): Promise<MultiHopDiscoverySession | undefined>;
  getSession(correlationId: string): Promise<MultiHopDiscoverySession | undefined>;
  listSessions(limit?: number): Promise<MultiHopDiscoverySession[]>;
  updateAwaitingHop2Bonds(
    correlationId: string,
    awaitingHop2ViaBonds: string[],
    pendingForwardApprovals: number,
  ): Promise<MultiHopDiscoverySession | undefined>;
}

function mergeMatches(
  existing: MultiHopDiscoveryMatchRow[],
  incoming: MultiHopDiscoveryMatchRow[],
): MultiHopDiscoveryMatchRow[] {
  const byOwner = new Map(existing.map((row) => [row.ownerId, row]));
  for (const row of incoming) {
    const prev = byOwner.get(row.ownerId);
    if (!prev || row.hopDistance < prev.hopDistance) {
      byOwner.set(row.ownerId, row);
    }
  }
  return [...byOwner.values()].sort((a, b) => a.hopDistance - b.hopDistance);
}

/** In-memory multihop sessions (mobile WebView has no node:fs). */
export function createMultiHopDiscoveryStore(_profileDir: string): MultiHopDiscoveryStore {
  const sessions = new Map<string, MultiHopDiscoverySession>();

  return {
    async upsertSession(session) {
      sessions.set(session.correlationId, session);
      if (sessions.size > 32) {
        const oldest = [...sessions.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
        if (oldest) sessions.delete(oldest.correlationId);
      }
    },

    async appendMatches(correlationId, matches, input) {
      const current = sessions.get(correlationId);
      if (!current) return undefined;
      const updated: MultiHopDiscoverySession = {
        ...current,
        updatedAt: new Date().toISOString(),
        pendingForwardApprovals: input?.pendingForwardApprovals ?? current.pendingForwardApprovals,
        matches: mergeMatches(current.matches, matches),
      };
      sessions.set(correlationId, updated);
      return updated;
    },

    async applyInboundResponse(correlationId, input) {
      const current = sessions.get(correlationId);
      if (!current) return undefined;
      const now = new Date().toISOString();
      const awaiting = new Set(current.awaitingHop2ViaBonds ?? []);

      if (input.forwardPendingAck && input.matches.length === 0) {
        awaiting.add(input.responderOwnerId);
        const updated: MultiHopDiscoverySession = {
          ...current,
          updatedAt: now,
          awaitingHop2ViaBonds: [...awaiting],
          pendingForwardApprovals: awaiting.size,
        };
        sessions.set(correlationId, updated);
        return updated;
      }

      if (input.matches.length === 0) {
        return current;
      }

      awaiting.delete(input.responderOwnerId);
      const updated: MultiHopDiscoverySession = {
        ...current,
        updatedAt: now,
        awaitingHop2ViaBonds: [...awaiting],
        pendingForwardApprovals: awaiting.size,
        matches: mergeMatches(current.matches, input.matches),
      };
      sessions.set(correlationId, updated);
      return updated;
    },

    async getSession(correlationId) {
      return sessions.get(correlationId.trim());
    },

    async listSessions(limit = 8) {
      return [...sessions.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);
    },

    async updateAwaitingHop2Bonds(correlationId, awaitingHop2ViaBonds, pendingForwardApprovals) {
      const current = sessions.get(correlationId);
      if (!current) return undefined;
      const updated: MultiHopDiscoverySession = {
        ...current,
        updatedAt: new Date().toISOString(),
        awaitingHop2ViaBonds,
        pendingForwardApprovals,
      };
      sessions.set(correlationId, updated);
      return updated;
    },
  };
}

type TrustLevel = "direct" | "referred" | "public" | "blocked";

function trustLevelScore(level: TrustLevel | undefined): number {
  switch (level) {
    case "direct":
      return 60;
    case "referred":
      return 45;
    case "public":
      return 20;
    case "blocked":
      return -100;
    default:
      return 10;
  }
}

function recencyPoints(lastSeenAt: string): number {
  const minutes = Math.max(0, (Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (minutes <= 15) return 20;
  if (minutes <= 60) return 12;
  if (minutes <= 24 * 60) return 6;
  return 2;
}

export function buildMorningReportDigest(input: {
  trustRecords: Array<{ peerOwnerId: string; level?: TrustLevel }>;
  peerDirectoryRecords: Array<{ ownerId: string; peerId?: string; lastSeenAt?: string }>;
  discoveryEvents: Array<{
    ownerId: string;
    matchCount: number;
    createdAt: string;
    hopDistance?: number;
  }>;
  limit?: number;
}): MorningReportEntry[] {
  const trustByOwner = new Map(input.trustRecords.map((record) => [record.peerOwnerId, record]));
  const peerByOwner = new Map(input.peerDirectoryRecords.map((record) => [record.ownerId, record]));
  const discoveryByOwner = new Map<
    string,
    { matches: number; lastSeenAt?: string; minHopDistance?: number }
  >();

  for (const event of input.discoveryEvents) {
    const current = discoveryByOwner.get(event.ownerId);
    const hop = event.hopDistance;
    discoveryByOwner.set(event.ownerId, {
      matches: (current?.matches ?? 0) + event.matchCount,
      lastSeenAt: current?.lastSeenAt
        ? current.lastSeenAt.localeCompare(event.createdAt) > 0
          ? current.lastSeenAt
          : event.createdAt
        : event.createdAt,
      minHopDistance:
        hop !== undefined ? Math.min(current?.minHopDistance ?? hop, hop) : current?.minHopDistance,
    });
  }

  const ownerIds = new Set<string>([
    ...input.trustRecords.map((record) => record.peerOwnerId),
    ...input.peerDirectoryRecords.map((record) => record.ownerId),
    ...input.discoveryEvents.map((event) => event.ownerId),
  ]);

  const ranked = [...ownerIds].map((ownerId): MorningReportEntry => {
    const trust = trustByOwner.get(ownerId);
    const peer = peerByOwner.get(ownerId);
    const discovery = discoveryByOwner.get(ownerId);
    const trustScore = trustLevelScore(trust?.level);
    const matchScore = Math.min(discovery?.matches ?? 0, 20) * 2;
    const hopBoost = discovery?.minHopDistance === 2 ? 8 : 0;
    const recencyScore = peer?.lastSeenAt ? recencyPoints(peer.lastSeenAt) : 0;
    const score = trustScore + matchScore + recencyScore + hopBoost;
    return {
      ownerId,
      peerId: peer?.peerId,
      trustLevel: trust?.level ?? "unknown",
      score,
      reason: `trust=${trust?.level ?? "unknown"}, matches=${discovery?.matches ?? 0}, hop=${discovery?.minHopDistance ?? 1}, recency=${recencyScore}`,
      lastSeenAt: peer?.lastSeenAt ?? discovery?.lastSeenAt,
      discoveryMatchCount: discovery?.matches ?? 0,
      hopDistance: discovery?.minHopDistance,
    };
  });

  return ranked.sort((left, right) => right.score - left.score).slice(0, input.limit ?? 10);
}
