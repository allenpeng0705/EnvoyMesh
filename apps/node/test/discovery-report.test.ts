import { describe, expect, it } from "vitest";
import type { AuditEvent } from "@envoymesh/local-store";
import {
  formatCapabilityDiscoveryRows,
  formatDiscoverySeedRows,
  formatPeerDiscoveryRows,
} from "../src/discovery-report.js";

function auditPeerDiscovery(peerId: string, summary: string, createdAt: string): AuditEvent {
  return {
    version: "0.1",
    eventId: `e-${createdAt}`,
    type: "p2p.trace",
    protocol: "peer.discovery",
    remotePeerId: peerId,
    outcome: "record",
    summary,
    createdAt,
  };
}

describe("discovery-report", () => {
  it("dedupes peer.discovery by remotePeerId keeping newest", () => {
    const events: AuditEvent[] = [
      auditPeerDiscovery(
        "12D3KooWA",
        "discovery peer=12D3KooWA source=unknown addrs=2",
        "2026-04-28T10:00:00.000Z",
      ),
      auditPeerDiscovery(
        "12D3KooWA",
        "discovery peer=12D3KooWA source=relay addrs=1",
        "2026-04-28T11:00:00.000Z",
      ),
      auditPeerDiscovery(
        "12D3KooWB",
        "discovery peer=12D3KooWB source=unknown addrs=3",
        "2026-04-28T09:00:00.000Z",
      ),
    ];
    const rows = formatPeerDiscoveryRows(events, 10);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("12D3KooWA");
    expect(rows[0]).toContain("2026-04-28T11:00:00.000Z");
    expect(rows[0]).toContain("source=relay");
    expect(rows[1]).toContain("12D3KooWB");
  });

  it("formats capability traces newest-first", () => {
    const events: AuditEvent[] = [
      {
        version: "0.1",
        eventId: "c1",
        type: "p2p.trace",
        protocol: "discovery.capability.find.ok",
        outcome: "record",
        summary: "topic=a providers=1",
        createdAt: "2026-04-28T10:00:00.000Z",
      },
      {
        version: "0.1",
        eventId: "c2",
        type: "p2p.trace",
        protocol: "discovery.capability.provide.ok",
        outcome: "record",
        summary: "topic=b",
        createdAt: "2026-04-28T12:00:00.000Z",
      },
    ];
    const rows = formatCapabilityDiscoveryRows(events, 10);
    expect(rows[0]).toContain("discovery.capability.provide.ok");
    expect(rows[1]).toContain("discovery.capability.find.ok");
  });

  it("formats empty seeds placeholder", () => {
    expect(formatDiscoverySeedRows([], 5)[0]).toContain("none");
  });
});
