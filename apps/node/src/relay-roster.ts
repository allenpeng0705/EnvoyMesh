import type {
  RelayBookState,
  RelayCheckinPayload,
  RelayHint,
  RelayLookupPayload,
  RelayLookupResponsePayload,
  RelayPeerCandidate,
  RelayRelation,
  RelaySummaryPayload,
  RelayVisibility,
} from "@envoymesh/protocol";
import { buildRelayCircuitMultiaddrs } from "./discovery-inbound.js";
import type { RelaySummaryEntry } from "./relay-lookup-router.js";

export interface RelayRosterEntry {
  peerId: string;
  ownerId?: string;
  relayReachableAddrs: string[];
  capabilities: string[];
  advertisements: RelayCheckinPayload["advertisements"];
  relayHints: RelayHint[];
  lastSeenAt: number;
  expiresAt: number;
  reservationFreshUntil: number;
}

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

export interface RelayClientState {
  activeRelays: RelayHint[];
  candidateRelays: RelayHint[];
  failedRelays: Array<RelayHint & { failureCount: number; backoffUntil: number }>;
}

export interface RelayRosterOptions {
  now?: () => number;
  rosterTtlMs?: number;
  maxRosterEntries?: number;
  maxRelayHints?: number;
}

const DEFAULT_ROSTER_TTL_MS = 120_000;
const DEFAULT_MAX_ROSTER_ENTRIES = 10_000;
const DEFAULT_MAX_RELAY_HINTS = 50;

export function createRelayRoster(options: RelayRosterOptions = {}) {
  const now = options.now ?? Date.now;
  const rosterTtlMs = options.rosterTtlMs ?? DEFAULT_ROSTER_TTL_MS;
  const maxRosterEntries = options.maxRosterEntries ?? DEFAULT_MAX_ROSTER_ENTRIES;
  const maxRelayHints = options.maxRelayHints ?? DEFAULT_MAX_RELAY_HINTS;
  const entries = new Map<string, RelayRosterEntry>();
  const relayBook = new Map<string, RelayBookEntry>();
  const relaySummaries = new Map<string, RelaySummaryEntry>();

  function pruneExpired(): void {
    const current = now();
    for (const [peerId, entry] of entries) {
      if (entry.expiresAt <= current || entry.reservationFreshUntil <= current) {
        entries.delete(peerId);
      }
    }
    for (const [relayId, entry] of relaySummaries) {
      if (entry.expiresAt <= current) {
        relaySummaries.delete(relayId);
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
    const fromBook = [...relayBook.values()].map<RelayHint>((entry) => ({
      relayId: entry.relayId,
      level: entry.level,
      region: entry.region,
      multiaddrs: entry.addrs,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    }));
    return dedupeHints([...fromRoster, ...fromBook]).slice(0, limit);
  }

  return {
    checkin(payload: RelayCheckinPayload, fallbackPeerId?: string): RelayRosterEntry {
      pruneExpired();
      const peerId = payload.peerId || fallbackPeerId;
      if (!peerId) {
        throw new Error("relay.checkin requires peerId");
      }
      const current = now();
      const expiresAt = Math.min(Date.parse(payload.expiresAt), current + rosterTtlMs);
      const entry: RelayRosterEntry = {
        peerId,
        ownerId: payload.ownerId,
        relayReachableAddrs: dedupe(payload.relayReachableAddrs),
        capabilities: dedupe(payload.capabilities),
        advertisements: payload.advertisements,
        relayHints: payload.relayHints.slice(0, maxRelayHints),
        lastSeenAt: current,
        expiresAt,
        reservationFreshUntil: expiresAt,
      };
      entries.set(peerId, entry);
      pruneExpired();
      return entry;
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
        expiresAt: new Date(Math.min(Date.parse(payload.expiresAt), current + rosterTtlMs)).toISOString(),
      };
    },

    relayHints(limit = 10): RelayHint[] {
      return collectRelayHints(limit);
    },

    registerRelay(input: {
      relayId: string;
      addrs: string[];
      relation: RelayRelation;
      state?: RelayBookState;
      level?: number;
      region?: string;
      expiresAt?: string;
    }): RelayBookEntry {
      const current = now();
      const existing = relayBook.get(input.relayId);
      const entry: RelayBookEntry = {
        relayId: input.relayId,
        level: input.level,
        region: input.region,
        addrs: dedupe([...input.addrs, ...(existing?.addrs ?? [])]),
        relation: input.relation,
        state: input.state ?? "verified",
        lastVerifiedAt: current,
        expiresAt: input.expiresAt ? Date.parse(input.expiresAt) : current + 10 * rosterTtlMs,
        failureCount: 0,
      };
      relayBook.set(entry.relayId, entry);
      return entry;
    },

    summary(input: { relayId: string; level: number; region?: string; expiresAt: string }): RelaySummaryPayload {
      pruneExpired();
      const topicBuckets = dedupe(
        [...entries.values()].flatMap((entry) =>
          entry.advertisements.flatMap((advertisement) => [
            ...(advertisement.capability ? [`capability:${advertisement.capability}`] : []),
            ...(advertisement.topicHash ? [advertisement.topicHash] : []),
          ]),
        ),
      ).slice(0, 128);
      return {
        relayId: input.relayId,
        level: input.level,
        region: input.region,
        childRelayCount: [...relayBook.values()].filter((entry) => entry.relation === "child").length,
        livePeerCount: entries.size,
        topicBuckets,
        expiresAt: input.expiresAt,
      };
    },

    registerSummary(payload: RelaySummaryPayload): RelaySummaryEntry {
      const entry: RelaySummaryEntry = {
        relayId: payload.relayId,
        summary: payload,
        lastSeenAt: now(),
        expiresAt: Date.parse(payload.expiresAt),
      };
      relaySummaries.set(payload.relayId, entry);
      pruneExpired();
      return entry;
    },

    entries(): RelayRosterEntry[] {
      pruneExpired();
      return [...entries.values()];
    },

    relayBook(): RelayBookEntry[] {
      pruneExpired();
      return [...relayBook.values()];
    },

    summaries(): RelaySummaryEntry[] {
      pruneExpired();
      return [...relaySummaries.values()];
    },
  };
}

export function createRelayClientState(initialRelays: RelayHint[]): RelayClientState {
  return {
    activeRelays: dedupeHints(initialRelays).slice(0, 3),
    candidateRelays: [],
    failedRelays: [],
  };
}

export function noteRelaySuccess(state: RelayClientState, relay: RelayHint): void {
  state.failedRelays = state.failedRelays.filter((item) => item.relayId !== relay.relayId);
  if (!state.activeRelays.some((item) => item.relayId === relay.relayId)) {
    state.activeRelays = dedupeHints([...state.activeRelays, relay]).slice(0, 3);
  }
}

export function noteRelayFailure(state: RelayClientState, relay: RelayHint, now = Date.now()): void {
  state.activeRelays = state.activeRelays.filter((item) => item.relayId !== relay.relayId);
  const existing = state.failedRelays.find((item) => item.relayId === relay.relayId);
  const failureCount = (existing?.failureCount ?? 0) + 1;
  const failed = {
    ...relay,
    failureCount,
    backoffUntil: now + Math.min(300_000, 5_000 * 2 ** Math.min(failureCount, 6)),
  };
  state.failedRelays = [...state.failedRelays.filter((item) => item.relayId !== relay.relayId), failed].slice(-50);
}

export function addRelayCandidates(state: RelayClientState, hints: RelayHint[]): void {
  const failed = new Set(state.failedRelays.map((item) => item.relayId));
  state.candidateRelays = dedupeHints([
    ...state.candidateRelays,
    ...hints.filter((hint) => !failed.has(hint.relayId)),
  ]).slice(0, 20);
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

function visibilityFor(entry: RelayRosterEntry, payload: RelayLookupPayload): RelayVisibility {
  const scoped = entry.advertisements.find(
    (ad) =>
      (payload.capability && ad.capability === payload.capability) ||
      (payload.topicHash && ad.topicHash === payload.topicHash),
  );
  if (scoped) {
    return scoped.visibility;
  }
  /** Check-ins may list `mesh.discovery` in capabilities but omit a matching `advertisements[]` row; treat as discoverable for public lookups. */
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
