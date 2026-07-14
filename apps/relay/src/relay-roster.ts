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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_ROSTER_TTL_MS = 600_000; // 10 minutes — must outlast checkin intervals (~30-60s) with margin
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
      if (entry.expiresAt <= current || entry.reservationFreshUntil <= current) {
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
    ): { entry: RelayRosterEntry; addrChanged: boolean; reconnect: boolean } {
      pruneExpired();
      const peerId = payload.peerId || fallbackPeerId;
      if (!peerId) {
        throw new Error("relay.checkin requires peerId");
      }
      const current = now();
      const expiresAt = Math.min(Date.parse(payload.expiresAt), current + rosterTtlMs);
      const newAddrs = dedupe(payload.relayReachableAddrs);
      const existing = entries.get(peerId);
      const reconnect = existing !== undefined && existing.lastSeenAt < current - 60_000;
      const addrChanged =
        existing !== undefined &&
        JSON.stringify([...existing.relayReachableAddrs].sort()) !== JSON.stringify(newAddrs.sort());
      const entry: RelayRosterEntry = {
        peerId,
        ownerId: payload.ownerId,
        relayReachableAddrs: newAddrs,
        addrChangedAt: addrChanged ? current : existing?.addrChangedAt,
        firstSeenAt: existing?.firstSeenAt ?? current,
        lastReconnectedAt: reconnect ? current : existing?.lastReconnectedAt,
        capabilities: dedupe(payload.capabilities),
        advertisements: payload.advertisements,
        relayHints: payload.relayHints.slice(0, maxRelayHints),
        lastSeenAt: current,
        expiresAt,
        reservationFreshUntil: expiresAt,
      };
      entries.set(peerId, entry);
      pruneExpired();
      return { entry, addrChanged, reconnect };
    },

    lookup(input: {
      payload: RelayLookupPayload;
      requesterPeerId: string;
      relayMultiaddrs: string[];
      relayPeerId: string;
    }): RelayLookupResponsePayload {
      pruneExpired();
      const { payload, requesterPeerId, relayMultiaddrs, relayPeerId } = input;
      const current = now();
      const candidates: RelayPeerCandidate[] = [];
      for (const entry of entries.values()) {
        if (entry.peerId === requesterPeerId) {
          continue;
        }
        if (entry.expiresAt <= current || entry.reservationFreshUntil <= current) {
          continue;
        }
        if (!matchesLookup(entry, payload)) {
          continue;
        }
        const visibility = visibilityFor(entry, payload);
        if (!isVisible(visibility, payload.visibilityScope)) {
          continue;
        }
        candidates.push({
          peerId: entry.peerId,
          ownerId: visibility === "public" || visibility === "capability" ? undefined : entry.ownerId,
          multiaddrs: buildRelayCircuitMultiaddrs(relayMultiaddrs, entry.peerId),
          viaRelayId: relayPeerId,
          capabilities: entry.capabilities,
          visibility,
          expiresAt: new Date(entry.expiresAt).toISOString(),
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

    entries(): RelayRosterEntry[] {
      pruneExpired();
      return [...entries.values()];
    },

    size(): number {
      pruneExpired();
      return entries.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

function visibilityFor(entry: RelayRosterEntry, payload: RelayLookupPayload): RelayVisibility {
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

function isVisible(candidate: RelayVisibility, requested: RelayVisibility): boolean {
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
