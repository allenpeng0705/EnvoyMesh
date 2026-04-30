import { describe, expect, it } from "vitest";
import {
  buildRelayManagerSnapshot,
  createAuditEvent,
  serializeRelayManagerSnapshot,
  type RelayManagerRuntimeState,
} from "../src/index.js";

describe("relay manager snapshot", () => {
  it("summarizes runtime roster, relay book, summaries, routing, and warnings", () => {
    const runtime: RelayManagerRuntimeState = {
      enabled: true,
      relayServerEnabled: true,
      peerId: "relay-a",
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      uptimeMs: 1_000,
      rosterEntries: [
        {
          peerId: "peer-a",
          capabilities: ["mesh.discovery"],
          advertisements: [{ visibility: "public", capability: "mesh.discovery", topicHash: "topic-a" }],
          lastSeenAt: Date.parse("2026-04-27T10:00:00.000Z"),
          expiresAt: Date.parse("2026-04-27T10:02:00.000Z"),
          reservationFreshUntil: Date.parse("2026-04-27T10:02:00.000Z"),
        },
      ],
      relayBook: [
        {
          relayId: "relay-b",
          relation: "sibling",
          state: "verified",
          addrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-b"],
          lastVerifiedAt: Date.parse("2026-04-27T10:00:00.000Z"),
          expiresAt: Date.parse("2026-04-27T10:05:00.000Z"),
          failureCount: 0,
        },
      ],
      summaries: [
        {
          relayId: "relay-b",
          level: 2,
          livePeerCount: 3,
          childRelayCount: 0,
          topicBuckets: ["capability:mesh.discovery"],
          lastSeenAt: Date.parse("2026-04-27T10:00:00.000Z"),
          expiresAt: Date.parse("2026-04-27T10:05:00.000Z"),
        },
      ],
      routing: {
        forwardedLookupCount: 2,
        duplicateQueryDropCount: 1,
        negativeCacheSize: 1,
        selectedForwardTargetCount: 2,
        failedForwardCount: 0,
        collectedForwardResponseCount: 1,
      },
    };

    const snapshot = buildRelayManagerSnapshot({
      runtime,
      now: () => Date.parse("2026-04-27T10:01:00.000Z"),
      auditEvents: [
        createAuditEvent({
          type: "p2p.trace",
          protocol: "relay.lookup.forward.ok",
          remotePeerId: "relay-b",
          outcome: "record",
          summary: "relay lookup forward ok",
          createdAt: "2026-04-27T10:00:30.000Z",
        }),
        createAuditEvent({
          type: "p2p.trace",
          protocol: "connectivity.warning",
          outcome: "record",
          summary: "warning",
          createdAt: "2026-04-27T10:00:31.000Z",
        }),
      ],
    });

    expect(snapshot.source).toBe("runtime");
    expect(snapshot.roster).toMatchObject({ total: 1, fresh: 1, stale: 0 });
    expect(snapshot.roster.topCapabilities).toEqual([{ capability: "mesh.discovery", count: 1 }]);
    expect(snapshot.relayBook.byRelation).toEqual({ sibling: 1 });
    expect(snapshot.summaries).toMatchObject({ total: 1, fresh: 1, stale: 0 });
    expect(snapshot.routing.recentTraces[0]?.protocol).toBe("relay.lookup.forward.ok");
    expect(snapshot.warnings).toEqual(["warning"]);
  });

  it("rehydrates the latest serialized snapshot from audit events", () => {
    const snapshot = buildRelayManagerSnapshot({
      runtime: {
        enabled: true,
        relayServerEnabled: false,
        peerId: "relay-a",
        listenAddrs: [],
        rosterEntries: [],
        relayBook: [],
        summaries: [],
        routing: {
          forwardedLookupCount: 0,
          duplicateQueryDropCount: 0,
          negativeCacheSize: 0,
          selectedForwardTargetCount: 0,
          failedForwardCount: 0,
          collectedForwardResponseCount: 0,
        },
      },
      now: () => Date.parse("2026-04-27T10:00:00.000Z"),
    });
    const rehydrated = buildRelayManagerSnapshot({
      auditEvents: [
        createAuditEvent({
          type: "p2p.trace",
          protocol: "relay.manager.snapshot",
          outcome: "record",
          summary: serializeRelayManagerSnapshot(snapshot),
          createdAt: "2026-04-27T10:00:01.000Z",
        }),
      ],
    });

    expect(rehydrated.source).toBe("audit");
    expect(rehydrated.relay.peerId).toBe("relay-a");
  });
});
