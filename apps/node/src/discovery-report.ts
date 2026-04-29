import type { AuditEvent } from "@envoymesh/local-store";
import type { DiscoverySeedRecord } from "./discovery-seed-store.js";

const ADDR_PREVIEW_LEN = 96;

/** Latest discovery event per libp2p peer id (audit peer.discovery rows). */
export function formatPeerDiscoveryRows(events: AuditEvent[], limitUnique: number): string[] {
  const discoveryEvents = events
    .filter((e) => e.type === "p2p.trace" && e.protocol === "peer.discovery")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const seen = new Set<string>();
  const picked: AuditEvent[] = [];
  for (const event of discoveryEvents) {
    const id = extractDiscoveryPeerId(event);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    picked.push(event);
    if (picked.length >= limitUnique) {
      break;
    }
  }

  if (picked.length === 0) {
    return [];
  }

  return picked.map((event) => {
    const peerId = extractDiscoveryPeerId(event);
    const meta = parsePeerDiscoverySummary(event.summary);
    const bits = [
      `peer=${peerId ?? "?"}`,
      meta.source ? `source=${meta.source}` : "",
      meta.addrs != null ? `addrs=${meta.addrs}` : "",
    ].filter(Boolean);
    return `  ${event.createdAt} ${bits.join(" ")}`;
  });
}

function extractDiscoveryPeerId(event: AuditEvent): string | undefined {
  if (event.remotePeerId?.trim()) {
    return event.remotePeerId.trim();
  }
  const match = event.summary.match(/discovery peer=([^\s]+)/);
  return match?.[1]?.trim();
}

function parsePeerDiscoverySummary(summary: string): { source?: string; addrs?: number } {
  const sourceMatch = summary.match(/source=(\w+)/);
  const addrsMatch = summary.match(/addrs=(\d+)/);
  return {
    source: sourceMatch?.[1],
    addrs: addrsMatch ? Number.parseInt(addrsMatch[1], 10) : undefined,
  };
}

export function formatCapabilityDiscoveryRows(events: AuditEvent[], limit: number): string[] {
  const cap = events
    .filter((e) => e.type === "p2p.trace" && e.protocol?.startsWith("discovery.capability"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return cap.map((event) => {
    const proto = event.protocol ?? "";
    const summary = event.summary.length > 140 ? `${event.summary.slice(0, 137)}...` : event.summary;
    return `  ${event.createdAt} ${proto} ${summary}`;
  });
}

export function formatDiscoverySeedRows(records: DiscoverySeedRecord[], limit: number): string[] {
  const slice = records.slice(0, limit);
  if (slice.length === 0) {
    return ["  (none — nothing persisted yet)"];
  }
  return slice.map((record) => {
    const addr =
      record.addr.length > ADDR_PREVIEW_LEN ? `${record.addr.slice(0, ADDR_PREVIEW_LEN)}…` : record.addr;
    return `  ${record.lastSuccessAt} source=${record.source} addr=${addr}`;
  });
}
