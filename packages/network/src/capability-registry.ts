/**
 * In-memory rendezvous capability registry (tag/type indexes, TTL).
 * Used by the standalone relay app and by a full node when acting as `--relay-server`.
 */

import type {
  RendezvousRegisterPayload,
  RendezvousQueryPayload,
  RendezvousMatch,
} from "@envoymesh/protocol";

export type CapabilityRegistryVerbosity = "full" | "minimal";

export interface CapabilityRegistryOptions {
  /** Prefix for registry log lines. Default: `[rendezvous-registry]`. */
  logPrefix?: string;
  /**
   * `full` — register, unregister, query match counts, expiry sweep (standalone relay).
   * `minimal` — register only (full node as `--relay-server`).
   */
  verbosity?: CapabilityRegistryVerbosity;
  /** Maximum entries in the registry. Default: 10,000. 0 = no limit. */
  maxEntries?: number;
  /**
   * How many entries to evict when at capacity (fraction of maxEntries).
   * Default: 0.1 (10%). Set to 0 to disable LRU eviction.
   */
  evictFraction?: number;
}

interface RegistryEntry {
  peerId: string;
  multiaddr: string;
  capabilities: Array<
    | { tag: string }
    | { type: string; params?: Record<string, unknown>; confidence?: number }
    | { descriptor: string }
  >;
  expiresAt: Date;
  /** Monotonic insertion order used for LRU eviction. */
  insertOrder: number;
}

export class CapabilityRegistry {
  private readonly fullIndex = new Map<string, RegistryEntry>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly typeIndex = new Map<string, Set<string>>();
  private readonly logPrefix: string;
  private readonly fullLogs: boolean;
  private readonly maxEntries: number;
  private readonly evictFraction: number;
  private _insertOrderCounter = 0;

  constructor(opts: CapabilityRegistryOptions = {}) {
    this.logPrefix = opts.logPrefix ?? "[rendezvous-registry]";
    const v = opts.verbosity ?? "minimal";
    this.fullLogs = v === "full";
    this.maxEntries = opts.maxEntries ?? 10_000;
    this.evictFraction = opts.evictFraction ?? 0.1;
  }

  private p(msg: string): string {
    return `${this.logPrefix} ${msg}`;
  }

  register(payload: RendezvousRegisterPayload): void {
    // Evict oldest entries if at capacity (LRU)
    if (this.maxEntries > 0 && this.fullIndex.size >= this.maxEntries) {
      const evictCount = Math.max(1, Math.floor(this.maxEntries * this.evictFraction));
      // Sort entries by insertOrder ascending and evict the oldest
      const entries = Array.from(this.fullIndex.values())
        .sort((a, b) => a.insertOrder - b.insertOrder);
      for (let i = 0; i < evictCount && i < entries.length; i++) {
        this.unregister(entries[i].peerId);
      }
      if (this.fullLogs) {
        console.log(this.p(`Evicted ${Math.min(evictCount, entries.length)} entries to make room`));
      }
    }

    this.unregister(payload.peerId);

    const expiresAt = new Date(Date.now() + payload.ttlSeconds * 1000);

    const entry: RegistryEntry = {
      peerId: payload.peerId,
      multiaddr: payload.multiaddr,
      capabilities: payload.capabilities,
      expiresAt,
      insertOrder: this._insertOrderCounter++,
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
      this.p(
        `Registered ${payload.peerId} with ${payload.capabilities.length} capabilities, TTL ${payload.ttlSeconds}s`,
      ),
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
    if (this.fullLogs) {
      console.log(this.p(`Unregistered ${peerId}`));
    }
    return true;
  }

  query(payload: RendezvousQueryPayload, maxResults?: number): RendezvousMatch[] {
    // NOTE: cleanExpired() is NOT called here on every query.
    // The periodic sweeper (startSweeper) handles expiry cleanup.
    // Calling cleanExpired() on every query caused O(n) iteration over all
    // entries, which would degrade performance on a busy relay.

    let candidatePeerIds: Set<string>;

    if ("tag" in payload.match) {
      const tagSet = this.tagIndex.get(payload.match.tag);
      candidatePeerIds = tagSet ?? new Set();
    } else if ("type" in payload.match) {
      const typeSet = this.typeIndex.get(payload.match.type);
      candidatePeerIds = typeSet ?? new Set();
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

    if (this.fullLogs) {
      console.log(this.p(`Query matched ${results.length} peers (max ${limit})`));
    }
    return results;
  }

  private cleanExpired(): number {
    const now = new Date();
    const expired: string[] = [];
    for (const [peerId, entry] of this.fullIndex.entries()) {
      if (entry.expiresAt < now) {
        expired.push(peerId);
      }
    }
    let cleaned = 0;
    for (const peerId of expired) {
      if (this.unregister(peerId)) {
        cleaned++;
      }
    }

    if (cleaned > 0 && this.fullLogs) {
      console.log(this.p(`Cleaned ${cleaned} expired entries`));
    }
    return cleaned;
  }

  stats(): { totalEntries: number; tagIndexSize: number; typeIndexSize: number } {
    return {
      totalEntries: this.fullIndex.size,
      tagIndexSize: this.tagIndex.size,
      typeIndexSize: this.typeIndex.size,
    };
  }

  startSweeper(intervalMs: number = 60_000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      this.cleanExpired();
    }, intervalMs);
  }
}
