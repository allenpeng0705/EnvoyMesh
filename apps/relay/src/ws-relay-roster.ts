/**
 * In-memory roster for relay.checkin / relay.lookup over WebSocket (/ws/client, /ws/home).
 * Standalone relay does not run the full node relay-server libp2p control plane; this fills that gap.
 */
import type {
  RelayCheckinPayload,
  RelayLookupPayload,
  RelayLookupResponsePayload,
  RelayPeerCandidate,
  RelayVisibility,
} from "@envoymesh/protocol";
import { filterUsableOutboundPeerDialHints } from "@envoymesh/network";

export interface WsRelayRosterEntry {
  peerId: string;
  ownerId?: string;
  relayReachableAddrs: string[];
  capabilities: string[];
  advertisements: RelayCheckinPayload["advertisements"];
  lastSeenAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 90_000;

function buildRelayCircuitMultiaddrs(relayMultiaddrs: string[], targetPeerId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of relayMultiaddrs) {
    const addr = raw.trim();
    if (!addr || addr.includes("/p2p-circuit/") || !addr.includes("/p2p/")) {
      continue;
    }
    const circuit = `${addr.replace(/\/$/, "")}/p2p-circuit/p2p/${targetPeerId}`;
    if (!seen.has(circuit)) {
      seen.add(circuit);
      out.push(circuit);
    }
  }
  return out;
}

function directDialAddrs(entry: WsRelayRosterEntry): string[] {
  return filterUsableOutboundPeerDialHints(
    entry.relayReachableAddrs.filter(
      (addr) => addr.includes(`/p2p/${entry.peerId}`) && !addr.includes("/p2p-circuit/"),
    ),
    entry.peerId,
  );
}

function matchesLookup(entry: WsRelayRosterEntry, payload: RelayLookupPayload): boolean {
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

function visibilityFor(entry: WsRelayRosterEntry, payload: RelayLookupPayload): RelayVisibility {
  const scoped = entry.advertisements.find(
    (ad) =>
      (payload.capability && ad.capability === payload.capability) ||
      (payload.topicHash && ad.topicHash === payload.topicHash),
  );
  return scoped?.visibility ?? "public";
}

function isVisible(visibility: RelayVisibility, scope: RelayLookupPayload["visibilityScope"]): boolean {
  if (scope === "public") {
    return visibility === "public" || visibility === "capability";
  }
  if (scope === "bonded") {
    return visibility === "bonded" || visibility === "capability" || visibility === "public";
  }
  return true;
}

export function createWsRelayRoster(ttlMs = DEFAULT_TTL_MS) {
  const entries = new Map<string, WsRelayRosterEntry>();

  function pruneExpired(now = Date.now()): void {
    for (const [peerId, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(peerId);
      }
    }
  }

  return {
    checkin(payload: RelayCheckinPayload): WsRelayRosterEntry {
      const now = Date.now();
      const expiresAt = Math.min(Date.parse(payload.expiresAt), now + ttlMs);
      const entry: WsRelayRosterEntry = {
        peerId: payload.peerId,
        ownerId: payload.ownerId,
        relayReachableAddrs: [...new Set(payload.relayReachableAddrs.map((a) => a.trim()).filter(Boolean))],
        capabilities: [...new Set(payload.capabilities)],
        advertisements: payload.advertisements,
        lastSeenAt: now,
        expiresAt,
      };
      entries.set(payload.peerId, entry);
      pruneExpired(now);
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
      const now = Date.now();
      const candidates: RelayPeerCandidate[] = [];
      for (const entry of entries.values()) {
        if (entry.peerId === requesterPeerId) {
          continue;
        }
        if (entry.expiresAt <= now) {
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
          multiaddrs: [
            ...new Set([
              ...directDialAddrs(entry),
              ...buildRelayCircuitMultiaddrs(relayMultiaddrs, entry.peerId),
            ]),
          ],
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
        relayHints: [],
        truncated: candidates.length > capped.length,
        expiresAt: new Date(Math.min(Date.parse(payload.expiresAt), now + ttlMs)).toISOString(),
      };
    },

    size(): number {
      pruneExpired();
      return entries.size;
    },
  };
}

export type WsRelayRoster = ReturnType<typeof createWsRelayRoster>;
