/**
 * Capability registry for rendezvous when this process acts as relay server (`--relay-server`).
 * Same behavior as `apps/relay/src/capability-registry.ts` (duplicated to avoid workspace coupling).
 */

import type {
  RendezvousRegisterPayload,
  RendezvousQueryPayload,
  RendezvousMatch,
} from "@envoymesh/protocol";

interface RegistryEntry {
  peerId: string;
  multiaddr: string;
  capabilities: Array<
    | { tag: string }
    | { type: string; params?: Record<string, unknown>; confidence?: number }
    | { descriptor: string }
  >;
  expiresAt: Date;
}

export class CapabilityRegistry {
  private readonly fullIndex = new Map<string, RegistryEntry>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly typeIndex = new Map<string, Set<string>>();

  register(payload: RendezvousRegisterPayload): void {
    this.unregister(payload.peerId);
    const expiresAt = new Date(Date.now() + payload.ttlSeconds * 1000);
    const entry: RegistryEntry = {
      peerId: payload.peerId,
      multiaddr: payload.multiaddr,
      capabilities: payload.capabilities,
      expiresAt,
    };
    this.fullIndex.set(payload.peerId, entry);
    for (const cap of payload.capabilities) {
      if ("tag" in cap) {
        let tagSet = this.tagIndex.get(cap.tag);
        if (!tagSet) {
          tagSet = new Set();
          this.tagIndex.set(cap.tag, tagSet);
        }
        tagSet.add(payload.peerId);
      } else if ("type" in cap) {
        let typeSet = this.typeIndex.get(cap.type);
        if (!typeSet) {
          typeSet = new Set();
          this.typeIndex.set(cap.type, typeSet);
        }
        typeSet.add(payload.peerId);
      }
    }
    console.log(
      `[node-rendezvous] Registered ${payload.peerId} (${payload.capabilities.length} caps, TTL ${payload.ttlSeconds}s)`,
    );
  }

  unregister(peerId: string): boolean {
    const existing = this.fullIndex.get(peerId);
    if (!existing) {
      return false;
    }
    for (const cap of existing.capabilities) {
      if ("tag" in cap) {
        const tagSet = this.tagIndex.get(cap.tag);
        if (tagSet) {
          tagSet.delete(peerId);
          if (tagSet.size === 0) {
            this.tagIndex.delete(cap.tag);
          }
        }
      } else if ("type" in cap) {
        const typeSet = this.typeIndex.get(cap.type);
        if (typeSet) {
          typeSet.delete(peerId);
          if (typeSet.size === 0) {
            this.typeIndex.delete(cap.type);
          }
        }
      }
    }
    this.fullIndex.delete(peerId);
    return true;
  }

  query(payload: RendezvousQueryPayload, maxResults?: number): RendezvousMatch[] {
    this.cleanExpired();
    let candidatePeerIds: Set<string>;
    if ("tag" in payload.match) {
      candidatePeerIds = this.tagIndex.get(payload.match.tag) ?? new Set();
    } else if ("type" in payload.match) {
      candidatePeerIds = this.typeIndex.get(payload.match.type) ?? new Set();
    } else {
      return [];
    }
    const results: RendezvousMatch[] = [];
    const queryMatch = payload.match;
    const queryParams = "params" in queryMatch ? (queryMatch.params as Record<string, unknown> | undefined) : undefined;
    const limit = maxResults ?? payload.maxResults;
    for (const peerId of candidatePeerIds) {
      if (results.length >= limit) {
        break;
      }
      const entry = this.fullIndex.get(peerId);
      if (!entry) {
        continue;
      }
      if (entry.expiresAt < new Date()) {
        continue;
      }
      if (queryParams) {
        const matchingCap = entry.capabilities.find((cap) => {
          if (!("params" in cap)) return false;
          const capParams = (cap.params as Record<string, unknown> | undefined) ?? {};
          return Object.entries(queryParams).every(([key, value]) => capParams[key] === value);
        });
        if (!matchingCap) continue;
      }
      results.push({
        peerId: entry.peerId,
        multiaddr: entry.multiaddr,
        capabilities: entry.capabilities,
      });
    }
    return results;
  }

  private cleanExpired(): number {
    const now = new Date();
    let cleaned = 0;
    for (const [peerId, entry] of this.fullIndex.entries()) {
      if (entry.expiresAt < now) {
        this.unregister(peerId);
        cleaned++;
      }
    }
    return cleaned;
  }

  startSweeper(intervalMs: number = 60_000): ReturnType<typeof setInterval> {
    return setInterval(() => this.cleanExpired(), intervalMs);
  }
}
