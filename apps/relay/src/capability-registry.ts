/**
 * Capability Registry for Rendezvous Server
 *
 * In-memory registry that stores peer capabilities and supports
 * pattern-matching queries for peer discovery.
 */

import type {
  RendezvousRegisterPayload,
  RendezvousQueryPayload,
  RendezvousMatch,
  RendezvousResponsePayload,
} from "@envoymesh/protocol";

/**
 * Registry entry with TTL expiration
 */
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

/**
 * In-memory capability registry with tag and type indexes
 */
export class CapabilityRegistry {
  // Primary index by peer ID
  private readonly fullIndex = new Map<string, RegistryEntry>();

  // Tag index: tag -> Set of peer IDs
  private readonly tagIndex = new Map<string, Set<string>>();

  // Type index: type -> Set of peer IDs
  private readonly typeIndex = new Map<string, Set<string>>();

  /**
   * Register a peer's capabilities with TTL
   */
  register(payload: RendezvousRegisterPayload): void {
    // Remove any existing entry for this peer
    this.unregister(payload.peerId);

    const expiresAt = new Date(Date.now() + payload.ttlSeconds * 1000);

    const entry: RegistryEntry = {
      peerId: payload.peerId,
      multiaddr: payload.multiaddr,
      capabilities: payload.capabilities,
      expiresAt,
    };

    this.fullIndex.set(payload.peerId, entry);

    // Update indexes
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
      // descriptor capabilities are not indexed (future semantic search)
    }

    console.log(
      `[registry] Registered ${payload.peerId} with ${payload.capabilities.length} capabilities, TTL ${payload.ttlSeconds}s`,
    );
  }

  /**
   * Remove a peer from the registry
   */
  unregister(peerId: string): boolean {
    const existing = this.fullIndex.get(peerId);
    if (!existing) {
      return false;
    }

    // Remove from all indexes
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
    console.log(`[registry] Unregistered ${peerId}`);
    return true;
  }

  /**
   * Query for matching peers
   */
  query(payload: RendezvousQueryPayload, maxResults?: number): RendezvousMatch[] {
    // Clean expired entries first
    this.cleanExpired();

    let candidatePeerIds: Set<string>;

    if ("tag" in payload.match) {
      // Tag-based query
      const tagSet = this.tagIndex.get(payload.match.tag);
      candidatePeerIds = tagSet ?? new Set();
    } else if ("type" in payload.match) {
      // Type-based query
      const typeSet = this.typeIndex.get(payload.match.type);
      candidatePeerIds = typeSet ?? new Set();
    } else {
      return [];
    }

    // Filter candidates by param matching and check expiration
    const results: RendezvousMatch[] = [];
    // Extract query params if this is a type-based query
    const queryMatch = payload.match;
    const queryParams = "params" in queryMatch ? (queryMatch.params as Record<string, unknown> | undefined) : undefined;
    const limit = maxResults ?? payload.maxResults;

    for (const peerId of candidatePeerIds) {
      if (results.length >= limit) {
        break;
      }

      const entry = this.fullIndex.get(peerId);
      if (!entry) {
        continue; // Already unregistered due to cleanExpired cascade
      }

      if (entry.expiresAt < new Date()) {
        continue; // Double-check expiration
      }

      // Check param matching if query has params
      if (queryParams) {
        // Find a capability that has all the requested params
        const matchingCap = entry.capabilities.find((cap) => {
          // Only structured capabilities can have params
          if (!("params" in cap)) return false;
          const capParams = (cap.params as Record<string, unknown> | undefined) ?? {};
          // All query params must be present in the capability
          return Object.entries(queryParams).every(
            ([key, value]) => capParams[key] === value,
          );
        });
        if (!matchingCap) continue;
      }

      results.push({
        peerId: entry.peerId,
        multiaddr: entry.multiaddr,
        capabilities: entry.capabilities,
      });
    }

    console.log(
      `[registry] Query matched ${results.length} peers (max ${limit})`,
    );
    return results;
  }

  /**
   * Remove expired entries (lazy cleanup)
   */
  private cleanExpired(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [peerId, entry] of this.fullIndex.entries()) {
      if (entry.expiresAt < now) {
        this.unregister(peerId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[registry] Cleaned ${cleaned} expired entries`);
    }
    return cleaned;
  }

  /**
   * Get registry statistics
   */
  stats(): { totalEntries: number; tagIndexSize: number; typeIndexSize: number } {
    return {
      totalEntries: this.fullIndex.size,
      tagIndexSize: this.tagIndex.size,
      typeIndexSize: this.typeIndex.size,
    };
  }

  /**
   * Start background sweep for expired entries
   */
  startSweeper(intervalMs: number = 60_000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanExpired();
    }, intervalMs);
  }
}
