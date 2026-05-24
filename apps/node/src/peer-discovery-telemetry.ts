import type { DiscoveryProfile } from "@envoymesh/api";
import type { DiscoverySeedSource } from "./discovery-seed-store.js";

export type PeerDiscoverySource = "relay" | "unknown";

const MAX_AUDITED_PEER_IDS = 512;
const auditedPeerIds = new Set<string>();
const auditedPeerOrder: string[] = [];

/** Record peer.discovery audit once per peer id; always record relay-sourced discoveries. */
export function shouldRecordPeerDiscoveryAudit(
  peerId: string,
  source: PeerDiscoverySource,
  opts?: { force?: boolean },
): boolean {
  if (opts?.force) {
    return true;
  }
  if (source === "relay") {
    rememberAuditedPeerId(peerId);
    return true;
  }
  if (auditedPeerIds.has(peerId)) {
    return false;
  }
  rememberAuditedPeerId(peerId);
  return true;
}

function rememberAuditedPeerId(peerId: string): void {
  if (auditedPeerIds.has(peerId)) {
    return;
  }
  while (auditedPeerIds.size >= MAX_AUDITED_PEER_IDS && auditedPeerOrder.length > 0) {
    const oldest = auditedPeerOrder.shift();
    if (oldest) {
      auditedPeerIds.delete(oldest);
    }
  }
  auditedPeerIds.add(peerId);
  auditedPeerOrder.push(peerId);
}

/** @internal test helper */
export function resetPeerDiscoveryAuditStateForTests(): void {
  auditedPeerIds.clear();
  auditedPeerOrder.length = 0;
}

export function peerDiscoverySourceFromMultiaddrs(multiaddrs: readonly string[]): PeerDiscoverySource {
  return multiaddrs.some((addr) => addr.includes("/p2p-circuit")) ? "relay" : "unknown";
}

export function shouldPersistPeerDiscoverySeeds(
  profile: DiscoveryProfile,
  source: PeerDiscoverySource,
): boolean {
  if (profile === "contacts-only" || profile === "relay-only") {
    return source === "relay";
  }
  return true;
}

const CONTACTS_ONLY_EXCLUDED_SEED_SOURCES = new Set<DiscoverySeedSource>([
  "peer.discovery",
  "capability-topic",
]);

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
