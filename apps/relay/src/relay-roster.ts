/**
 * Relay roster for the standalone relay server.
 *
 * Stores peer checkin data (capabilities, topicHash advertisements) and
 * answers relay.lookup queries. Phase 46 adds a bounded sibling relay book
 * for miss-forward + hints (leaf checkin hints stay untrusted candidates).
 */

import type {
  RelayCheckinPayload,
  RelayHint,
  RelayLookupPayload,
  RelayLookupResponsePayload,
  RelayPeerCandidate,
  RelayVisibility,
  RelayRelation,
  RelayBookState,
} from "@envoymesh/protocol";
import type { RelayBookEntry } from "./relay-lookup-router.js";

export function buildRelayCircuitMultiaddrs(relayMultiaddrs: string[], targetPeerId: string): string[] {
  const circuitAddrs = relayMultiaddrs
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0 && !addr.includes("/p2p-circuit"))
    .filter((addr) => addr.includes("/p2p/"))
    .map((addr) => `${addr}/p2p-circuit/p2p/${targetPeerId}`);

  return [...new Set(circuitAddrs)];
}

export interface RelayRosterEntry {
  peerId: string;
  ownerId?: string;
  displayName?: string;
  relayReachableAddrs: string[];
  addrChangedAt?: number;
  firstSeenAt: number;
  lastReconnectedAt?: number;
  capabilities: string[];
  advertisements: RelayCheckinPayload["advertisements"];
  relayHints: RelayHint[];
  lastSeenAt: number;
  expiresAt: number;
  reservationFreshUntil: number;
}

export interface RelayRosterOptions {
  now?: () => number;
  rosterTtlMs?: number;
  maxRosterEntries?: number;
  maxRelayHints?: number;
  maxRelayBookEntries?: number;
}

export interface RelayRosterCheckinOptions {
  reservationExpireAtMs?: number;
}

export interface RelayRosterLookupInput {
  payload: RelayLookupPayload;
  requesterPeerId: string;
  relayMultiaddrs: string[];
  relayPeerId: string;
  hasLiveReservation?: (peerId: string) => boolean;
}

export type { RelayBookEntry };

const DEFAULT_ROSTER_TTL_MS = 35 * 60_000;
const DEFAULT_MAX_ROSTER_ENTRIES = 10_000;
const DEFAULT_MAX_RELAY_HINTS = 50;
// Book cap (16) > gossip request (8) intentionally: a full book is never
// shared in one gossip round, so peers learn incrementally. Phase 46C.
const DEFAULT_MAX_RELAY_BOOK_ENTRIES = 16;

export function createRelayRoster(options: RelayRosterOptions = {}) {
  const now = options.now ?? Date.now;
  const rosterTtlMs = options.rosterTtlMs ?? DEFAULT_ROSTER_TTL_MS;
  const maxRosterEntries = options.maxRosterEntries ?? DEFAULT_MAX_ROSTER_ENTRIES;
  const maxRelayHints = options.maxRelayHints ?? DEFAULT_MAX_RELAY_HINTS;
  const maxRelayBookEntries = options.maxRelayBookEntries ?? DEFAULT_MAX_RELAY_BOOK_ENTRIES;
  const entries = new Map<string, RelayRosterEntry>();
  const relayBook = new Map<string, RelayBookEntry>();

  function pruneExpired(): void {
    const current = now();
    for (const [peerId, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(peerId);
    }
    for (const [relayId, entry] of relayBook) {
      if (entry.expiresAt <= current) relayBook.delete(relayId);
    }
    if (entries.size > maxRosterEntries) {
      const ordered = [...entries.values()].sort((left, right) => left.lastSeenAt - right.lastSeenAt);
      for (const entry of ordered.slice(0, entries.size - maxRosterEntries)) {
        entries.delete(entry.peerId);
      }
    }
    if (relayBook.size > maxRelayBookEntries) {
      const ordered = [...relayBook.values()].sort((a, b) => a.lastVerifiedAt - b.lastVerifiedAt);
      for (const entry of ordered.slice(0, relayBook.size - maxRelayBookEntries)) {
        relayBook.delete(entry.relayId);
      }
    }
  }

  function collectRelayHints(limit = 10): RelayHint[] {
    const fromBook = [...relayBook.values()]
      .filter((e) => e.expiresAt > now() && e.state !== "removed" && e.state !== "stale")
      .map<RelayHint>((entry) => ({
        relayId: entry.relayId,
        level: entry.level,
        region: entry.region,
        multiaddrs: entry.addrs,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      }));
    const fromRoster = [...entries.values()].flatMap((entry) => entry.relayHints);
    return dedupeHints([...fromBook, ...fromRoster]).slice(0, limit);
  }

  function registerRelayInternal(input: {
    relayId: string;
    addrs: string[];
    relation: RelayRelation;
    state: RelayBookState;
    level?: number;
    region?: string;
    expiresAt: string | number;
  }): RelayBookEntry {
    pruneExpired();
    const current = now();
    const expiresAt =
      typeof input.expiresAt === "number" ? input.expiresAt : Date.parse(input.expiresAt);
    const existing = relayBook.get(input.relayId);
    const entry: RelayBookEntry = {
      relayId: input.relayId,
      level: input.level ?? existing?.level,
      region: input.region ?? existing?.region,
      addrs: dedupe(input.addrs.length > 0 ? input.addrs : existing?.addrs ?? []),
      relation: input.relation,
      state: input.state,
      lastVerifiedAt:
        input.state === "verified" || input.state === "active" || input.state === "seed"
          ? current
          : (existing?.lastVerifiedAt ?? 0),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : current + rosterTtlMs,
      failureCount: existing?.failureCount ?? 0,
    };
    relayBook.set(entry.relayId, entry);
    pruneExpired();
    return entry;
  }

  return {
    checkin(
      payload: RelayCheckinPayload,
      fallbackPeerId?: string,
      checkinOpts?: RelayRosterCheckinOptions,
    ): { entry: RelayRosterEntry; addrChanged: boolean; reconnect: boolean } {
      pruneExpired();
      const peerId = payload.peerId || fallbackPeerId;
      if (!peerId) {
        throw new Error("relay.checkin requires peerId");
      }
      const current = now();
      const expiresAt = Math.min(Date.parse(payload.expiresAt), current + rosterTtlMs);
      const reservationFreshUntil = resolveReservationFreshUntil(
        expiresAt,
        checkinOpts?.reservationExpireAtMs,
        current,
        rosterTtlMs,
      );
      const newAddrs = dedupe(payload.relayReachableAddrs);
      const existing = entries.get(peerId);
      const reconnect = existing !== undefined && existing.lastSeenAt < current - 60_000;
      const addrChanged =
        existing !== undefined &&
        JSON.stringify([...existing.relayReachableAddrs].sort()) !== JSON.stringify(newAddrs.sort());
      const entry: RelayRosterEntry = {
        peerId,
        ownerId: payload.ownerId,
        displayName: payload.displayName,
        relayReachableAddrs: newAddrs,
        addrChangedAt: addrChanged ? current : existing?.addrChangedAt,
        firstSeenAt: existing?.firstSeenAt ?? current,
        lastReconnectedAt: reconnect ? current : existing?.lastReconnectedAt,
        capabilities: dedupe(payload.capabilities),
        advertisements: payload.advertisements,
        relayHints: payload.relayHints.slice(0, maxRelayHints),
        lastSeenAt: current,
        expiresAt,
        reservationFreshUntil,
      };
      entries.set(peerId, entry);
      for (const hint of payload.relayHints) {
        if (!hint.relayId || hint.multiaddrs.length === 0) continue;
        if (relayBook.has(hint.relayId)) continue;
        registerRelayInternal({
          relayId: hint.relayId,
          addrs: hint.multiaddrs,
          relation: "candidate",
          state: "candidate",
          expiresAt: hint.expiresAt ?? new Date(current + rosterTtlMs).toISOString(),
        });
      }
      pruneExpired();
      return { entry, addrChanged, reconnect };
    },

    lookup(input: RelayRosterLookupInput): RelayLookupResponsePayload {
      pruneExpired();
      const { payload, requesterPeerId, relayMultiaddrs, relayPeerId, hasLiveReservation } = input;
      const current = now();
      const candidates: RelayPeerCandidate[] = [];
      for (const entry of entries.values()) {
        if (entry.peerId === requesterPeerId) continue;
        if (entry.expiresAt <= current) continue;
        if (!matchesLookup(entry, payload)) continue;
        const visibility = visibilityFor(entry, payload);
        if (!isVisible(visibility, payload.visibilityScope)) continue;
        const liveHop =
          typeof hasLiveReservation === "function"
            ? hasLiveReservation(entry.peerId)
            : entry.reservationFreshUntil > current;
        if (!liveHop) continue;
        candidates.push({
          peerId: entry.peerId,
          ownerId: visibility === "public" || visibility === "capability" ? undefined : entry.ownerId,
          displayName: entry.displayName,
          multiaddrs: buildRelayCircuitMultiaddrs(relayMultiaddrs, entry.peerId),
          viaRelayId: relayPeerId,
          capabilities: entry.capabilities,
          visibility,
          expiresAt: new Date(entry.expiresAt).toISOString(),
          hasHopSlot: true,
        });
      }
      const capped = candidates.slice(0, payload.maxResults);
      return {
        queryId: payload.queryId,
        peers: capped,
        relayHints: collectRelayHints(payload.maxResults),
        truncated: candidates.length > capped.length,
        expiresAt: new Date(
          Math.min(Date.parse(payload.expiresAt), current + rosterTtlMs),
        ).toISOString(),
      };
    },

    registerRelay(input: {
      relayId: string;
      addrs: string[];
      relation: RelayRelation;
      state: RelayBookState;
      level?: number;
      region?: string;
      expiresAt: string | number;
    }): RelayBookEntry {
      return registerRelayInternal(input);
    },

    promoteRelay(relayId: string, state: RelayBookState = "verified"): RelayBookEntry | undefined {
      pruneExpired();
      const existing = relayBook.get(relayId);
      if (!existing) return undefined;
      const entry: RelayBookEntry = {
        ...existing,
        state,
        lastVerifiedAt: now(),
        failureCount: 0,
      };
      relayBook.set(relayId, entry);
      return entry;
    },

    relayBook(): RelayBookEntry[] {
      pruneExpired();
      return [...relayBook.values()];
    },

    verifiedRelayHints(limit = 10): RelayHint[] {
      pruneExpired();
      return [...relayBook.values()]
        .filter(
          (e) =>
            e.expiresAt > now() &&
            (e.state === "verified" || e.state === "active" || e.state === "seed") &&
            e.addrs.length > 0,
        )
        .map((entry) => ({
          relayId: entry.relayId,
          level: entry.level,
          region: entry.region,
          multiaddrs: entry.addrs,
          expiresAt: new Date(entry.expiresAt).toISOString(),
        }))
        .slice(0, limit);
    },

    entries(): RelayRosterEntry[] {
      pruneExpired();
      return [...entries.values()];
    },

    size(): number {
      pruneExpired();
      return entries.size;
    },

    topicHashSummary(limit = 64): Array<{ topicHash: string; peerCount: number }> {
      pruneExpired();
      const counts = new Map<string, number>();
      for (const entry of entries.values()) {
        for (const ad of entry.advertisements) {
          if (!ad.topicHash) continue;
          counts.set(ad.topicHash, (counts.get(ad.topicHash) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([topicHash, peerCount]) => ({ topicHash, peerCount }))
        .sort((a, b) => b.peerCount - a.peerCount)
        .slice(0, limit);
    },
  };
}

export function visibilityFor(entry: RelayRosterEntry, payload: RelayLookupPayload): RelayVisibility {
  if (payload.targetPeerId || payload.targetOwnerId) {
    const publicAd = entry.advertisements.find((ad) => ad.visibility === "public");
    if (publicAd) return "public";
    if (entry.capabilities.includes("mesh.discovery")) return "public";
  }
  const scoped = entry.advertisements.find(
    (ad) =>
      (payload.capability && ad.capability === payload.capability) ||
      (payload.topicHash && ad.topicHash === payload.topicHash),
  );
  if (scoped) return scoped.visibility;
  if (payload.capability && entry.capabilities.includes(payload.capability)) {
    return payload.visibilityScope === "bonded" ? "bonded" : "public";
  }
  return "bonded";
}

export function isVisible(candidate: RelayVisibility, requested: RelayVisibility): boolean {
  if (candidate === "private") return false;
  if (candidate === "bonded") return requested === "bonded";
  if (candidate === "capability") {
    return requested === "capability" || requested === "bonded";
  }
  return true;
}

function matchesLookup(entry: RelayRosterEntry, payload: RelayLookupPayload): boolean {
  if (payload.targetPeerId && entry.peerId !== payload.targetPeerId) return false;
  if (payload.targetOwnerId && entry.ownerId !== payload.targetOwnerId) return false;
  if (payload.capability && !entry.capabilities.includes(payload.capability)) return false;
  if (payload.topicHash && !entry.advertisements.some((ad) => ad.topicHash === payload.topicHash)) {
    return false;
  }
  return true;
}

function resolveReservationFreshUntil(
  checkinExpiresAt: number,
  reservationExpireAtMs: number | undefined,
  current: number,
  rosterTtlMs: number,
): number {
  if (typeof reservationExpireAtMs !== "number" || !Number.isFinite(reservationExpireAtMs)) {
    return checkinExpiresAt;
  }
  if (reservationExpireAtMs <= current) return checkinExpiresAt;
  return Math.min(reservationExpireAtMs, current + rosterTtlMs, Math.max(checkinExpiresAt, reservationExpireAtMs));
}

function dedupe(input: string[]): string[] {
  return [...new Set(input.map((item) => item.trim()).filter(Boolean))];
}

function dedupeHints(input: RelayHint[]): RelayHint[] {
  const out = new Map<string, RelayHint>();
  for (const hint of input) {
    const key = hint.relayId || hint.multiaddrs.join(",");
    if (key && !out.has(key)) {
      out.set(key, { ...hint, multiaddrs: dedupe(hint.multiaddrs) });
    }
  }
  return [...out.values()];
}
