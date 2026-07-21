/**
 * Relay roster for the standalone relay server.
 *
 * Stores peer checkin data (capabilities, topicHash advertisements) and
 * answers relay.lookup queries. Ported from apps/node/src/relay-roster.ts
 * with the relay-book / relay-summary / client-state code removed (those
 * are only needed by the full-node relay-server mode).
 */

import type {
  RelayCheckinPayload,
  RelayHint,
  RelayLookupPayload,
  RelayLookupResponsePayload,
  RelayPeerCandidate,
  RelayVisibility,
} from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Circuit multiaddr builder
// ---------------------------------------------------------------------------

/**
 * Build `/p2p-circuit/p2p/<targetPeerId>` multiaddrs from the relay's own
 * listen/advertise bases. Copied from apps/node/src/discovery-inbound.ts
 * (pure string function, no external deps).
 */
export function buildRelayCircuitMultiaddrs(relayMultiaddrs: string[], targetPeerId: string): string[] {
  const circuitAddrs = relayMultiaddrs
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0 && !addr.includes("/p2p-circuit"))
    .filter((addr) => addr.includes("/p2p/"))
    .map((addr) => `${addr}/p2p-circuit/p2p/${targetPeerId}`);

  return [...new Set(circuitAddrs)];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelayRosterEntry {
  peerId: string;
  ownerId?: string;
  displayName?: string;
  relayReachableAddrs: string[];
  /** Set when peer reconnects with a different address than previously stored. */
  addrChangedAt?: number;
  /** Set when peer had no entry in the roster and is connecting for the first time. */
  firstSeenAt: number;
  /** Set when peer returns after being offline (> 60s gap). */
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
}

export interface RelayRosterCheckinOptions {
  /**
   * Live circuit-relay-v2 reservation expiry (ms epoch) for this peer, if any.
   * Extends `reservationFreshUntil` so roster visibility tracks the hop slot,
   * not only the short checkin TTL.
   */
  reservationExpireAtMs?: number;
}

export interface RelayRosterLookupInput {
  payload: RelayLookupPayload;
  requesterPeerId: string;
  relayMultiaddrs: string[];
  relayPeerId: string;
  /** True when this relay currently holds a live RESERVE for peerId. */
  hasLiveReservation?: (peerId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_ROSTER_TTL_MS = 35 * 60_000; // outlast public circuit reservation TTL (30 min) with margin
const DEFAULT_MAX_ROSTER_ENTRIES = 10_000;
const DEFAULT_MAX_RELAY_HINTS = 50;

export function createRelayRoster(options: RelayRosterOptions = {}) {
  const now = options.now ?? Date.now;
  const rosterTtlMs = options.rosterTtlMs ?? DEFAULT_ROSTER_TTL_MS;
  const maxRosterEntries = options.maxRosterEntries ?? DEFAULT_MAX_ROSTER_ENTRIES;
  const maxRelayHints = options.maxRelayHints ?? DEFAULT_MAX_RELAY_HINTS;
  const entries = new Map<string, RelayRosterEntry>();

  function pruneExpired(): void {
    const current = now();
    for (const [peerId, entry] of entries) {
      if (entry.expiresAt <= current) {
        entries.delete(peerId);
      }
    }
    if (entries.size <= maxRosterEntries) {
      return;
    }
    const ordered = [...entries.values()].sort((left, right) => left.lastSeenAt - right.lastSeenAt);
    for (const entry of ordered.slice(0, entries.size - maxRosterEntries)) {
      entries.delete(entry.peerId);
    }
  }

  function collectRelayHints(limit = 10): RelayHint[] {
    const fromRoster = [...entries.values()].flatMap((entry) => entry.relayHints);
    return dedupeHints(fromRoster).slice(0, limit);
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
      pruneExpired();
      return { entry, addrChanged, reconnect };
    },

    lookup(input: RelayRosterLookupInput): RelayLookupResponsePayload {
      pruneExpired();
      const { payload, requesterPeerId, relayMultiaddrs, relayPeerId, hasLiveReservation } = input;
      const current = now();
      const candidates: RelayPeerCandidate[] = [];
      for (const entry of entries.values()) {
        if (entry.peerId === requesterPeerId) {
          continue;
        }
        // Presence (expiresAt) is checkin-driven. Hop freshness uses
        // reservationFreshUntil when set longer than checkin, but we no longer
        // drop checkin-fresh peers solely because reservationFreshUntil lapsed —
        // instead we mark hasHopSlot false so clients can prefer live hops.
        if (entry.expiresAt <= current) {
          continue;
        }
        if (!matchesLookup(entry, payload)) {
          continue;
        }
        const visibility = visibilityFor(entry, payload);
        if (!isVisible(visibility, payload.visibilityScope)) {
          continue;
        }
        const liveHop =
          typeof hasLiveReservation === "function"
            ? hasLiveReservation(entry.peerId)
            : entry.reservationFreshUntil > current;
        // Only advertise /p2p-circuit/ paths when this relay can hop the peer —
        // otherwise clients cache dead circuit dials in discovery-seeds.
        candidates.push({
          peerId: entry.peerId,
          ownerId: visibility === "public" || visibility === "capability" ? undefined : entry.ownerId,
          displayName: entry.displayName,
          multiaddrs: liveHop
            ? buildRelayCircuitMultiaddrs(relayMultiaddrs, entry.peerId)
            : [],
          viaRelayId: relayPeerId,
          capabilities: entry.capabilities,
          visibility,
          expiresAt: new Date(entry.expiresAt).toISOString(),
          hasHopSlot: liveHop,
        });
      }
      // Prefer peers with a live circuit reservation (dialable hops) first.
      candidates.sort((a, b) => Number(Boolean(b.hasHopSlot)) - Number(Boolean(a.hasHopSlot)));
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

// ---------------------------------------------------------------------------
// Internal helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Exact peer/owner lookup is public when the peer advertised publicly or has
 * mesh.discovery. Intentional tradeoff: knowing a peerId lets you confirm they
 * are checked in on this relay (presence), not read private ads/ownerId.
 */
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
  if (scoped) {
    return scoped.visibility;
  }
  if (payload.capability && entry.capabilities.includes(payload.capability)) {
    return payload.visibilityScope === "bonded" ? "bonded" : "public";
  }
  return "bonded";
}

export function isVisible(candidate: RelayVisibility, requested: RelayVisibility): boolean {
  if (candidate === "private") {
    return false;
  }
  if (candidate === "bonded") {
    return requested === "bonded";
  }
  if (candidate === "capability") {
    return requested === "capability" || requested === "bonded";
  }
  return true;
}

function matchesLookup(entry: RelayRosterEntry, payload: RelayLookupPayload): boolean {
  if (payload.targetPeerId && entry.peerId !== payload.targetPeerId) {
    return false;
  }
  if (payload.targetOwnerId && entry.ownerId !== payload.targetOwnerId) {
    return false;
  }
  if (payload.capability && !entry.capabilities.includes(payload.capability)) {
    return false;
  }
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
  if (reservationExpireAtMs <= current) {
    return checkinExpiresAt;
  }
  // Cap extension to roster TTL window so a 30min hop doesn't leave a ghost forever.
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
      out.set(key, {
        ...hint,
        multiaddrs: dedupe(hint.multiaddrs),
      });
    }
  }
  return [...out.values()];
}
