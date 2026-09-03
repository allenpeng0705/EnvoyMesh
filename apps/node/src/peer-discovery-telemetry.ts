import type { DiscoveryProfile } from "@envoymesh/api";
import type { DiscoverySeedSource } from "./discovery-seed-store.js";

export type PeerDiscoverySource = "relay" | "mdns" | "bootstrap" | "unknown";

/** Cap unique peer.discovery audit rows per process — DHT can surface thousands of ephemeral peers. */
const MAX_AUDITED_PEER_IDS = 2048;
/** Hard rate limit so a discovery storm cannot starve the Social WebSocket / event loop. */
const MAX_PEER_DISCOVERY_AUDITS_PER_MINUTE = 60;
const auditedPeerIds = new Set<string>();
let auditWindowStartedAtMs = 0;
let auditsInWindow = 0;

/**
 * Record peer.discovery audit at most once per peer id (per process).
 * When the unique-peer cap is hit, stop auditing new peers (do not LRU-evict —
 * eviction re-audited the same DHT swarm overnight and wedged the home node).
 */
export function shouldRecordPeerDiscoveryAudit(
  peerId: string,
  _source: PeerDiscoverySource,
  opts?: { force?: boolean },
): boolean {
  if (opts?.force) {
    return true;
  }
  if (auditedPeerIds.has(peerId)) {
    return false;
  }
  if (auditedPeerIds.size >= MAX_AUDITED_PEER_IDS) {
    return false;
  }
  const now = Date.now();
  if (now - auditWindowStartedAtMs >= 60_000) {
    auditWindowStartedAtMs = now;
    auditsInWindow = 0;
  }
  if (auditsInWindow >= MAX_PEER_DISCOVERY_AUDITS_PER_MINUTE) {
    return false;
  }
  auditedPeerIds.add(peerId);
  auditsInWindow += 1;
  return true;
}

/** @internal test helper */
export function resetPeerDiscoveryAuditStateForTests(): void {
  auditedPeerIds.clear();
  auditWindowStartedAtMs = 0;
  auditsInWindow = 0;
}

export function peerDiscoverySourceFromMultiaddrs(multiaddrs: readonly string[]): PeerDiscoverySource {
  if (multiaddrs.length === 0) return "unknown";
  // Relay-sourced peers arrive via circuit relay addresses.
  if (multiaddrs.some((addr) => addr.includes("/p2p-circuit"))) return "relay";
  // mDNS peers typically have private/LAN addresses (no public IP, no DNS).
  // Bootstrap/infrastructure peers typically have public IPs or DNS hostnames.
  // This heuristic helps the caller decide whether to emit a UI event.
  const hasPrivateAddr = multiaddrs.some((addr) => {
    if (addr.includes("/ip4/192.168.") || addr.includes("/ip4/10.") || addr.includes("/ip4/127.")) return true;
    if (addr.includes("/ip6/fe80")) return true;
    // RFC 1918: 172.16.0.0/12 (172.16.x.x – 172.31.x.x)
    const m = addr.match(/\/ip4\/172\.(\d+)\./);
    if (m) {
      const octet = parseInt(m[1], 10);
      if (octet >= 16 && octet <= 31) return true;
    }
    return false;
  });
  if (hasPrivateAddr && !multiaddrs.some((addr) => addr.includes("/dns"))) {
    return "mdns";
  }
  return "unknown";
}

export function shouldPersistPeerDiscoverySeeds(
  profile: DiscoveryProfile,
  source: PeerDiscoverySource,
): boolean {
  if (profile === "contacts-only" || profile === "relay-only") {
    return source === "relay";
  }
  // wan-default / lan-fast: persist LAN + relay hops only. Public DHT "unknown"
  // peers churn by the thousands and rewriting discovery-seeds.json on every
  // sighting starved the event loop on long-running home nodes.
  // The same gate applies to peer-directory merges (see handleMeshPeerDiscovered).
  return source === "relay" || source === "mdns";
}

const CONTACTS_ONLY_EXCLUDED_SEED_SOURCES = new Set<DiscoverySeedSource>([
  "peer.discovery",
  "capability-topic",
]);

/**
 * Seeds safe to put in a strictDial allow-set.
 * Excludes capability-topic (DHT provider finds) so old swarm sightings do not
 * permanently widen the gater. Keeps bootstrap / relay / manual / LAN peer.discovery.
 */
export function seedAddrsForStrictDialAllow(
  records: ReadonlyArray<{ addr: string; source: DiscoverySeedSource }>,
): string[] {
  return records
    .filter((record) => record.source !== "capability-topic")
    .map((record) => record.addr);
}

export function seedAddrsForDiscoveryProfile(
  profile: DiscoveryProfile,
  records: ReadonlyArray<{ addr: string; source: DiscoverySeedSource }>,
): string[] {
  if (profile !== "contacts-only" && profile !== "relay-only") {
    return records.map((record) => record.addr);
  }
  return records
    .filter((record) => !CONTACTS_ONLY_EXCLUDED_SEED_SOURCES.has(record.source))
    .map((record) => record.addr);
}

export function shouldRunCapabilityTopicFind(profile: DiscoveryProfile): boolean {
  return profile === "wan-default";
}
