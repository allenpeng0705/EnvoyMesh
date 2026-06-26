import { describe, expect, it } from "vitest";
import {
  addRelayCandidates,
  createRelayClientState,
  createRelayRoster,
  noteRelayFailure,
  noteRelaySuccess,
} from "../src/relay-roster.js";

describe("relay roster", () => {
  it("returns fresh visible candidates and excludes requester", () => {
    let now = Date.parse("2026-04-27T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now, rosterTtlMs: 60_000 });
    roster.checkin({
      peerId: "peer-a",
      ownerId: "envoy:owner:a",
      relayReachableAddrs: [],
      capabilities: ["mesh.discovery"],
      advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
      relayHints: [],
      expiresAt: "2026-04-27T10:01:00.000Z",
    });
    roster.checkin({
      peerId: "peer-b",
      ownerId: "envoy:owner:b",
      relayReachableAddrs: [
        "/ip4/192.168.3.78/tcp/53830/p2p/peer-b",
        "/ip4/127.0.0.1/tcp/53830/p2p/peer-b",
      ],
      capabilities: ["mesh.discovery"],
      advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
      relayHints: [],
      expiresAt: "2026-04-27T10:01:00.000Z",
    });

    const response = roster.lookup({
      requesterPeerId: "peer-a",
      relayPeerId: "relay-1",
      relayMultiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-1"],
      payload: {
        queryId: "q1",
        capability: "mesh.discovery",
        maxResults: 10,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: "2026-04-27T10:01:00.000Z",
      },
    });

    expect(response.peers).toHaveLength(1);
    expect(response.peers[0]?.peerId).toBe("peer-b");
    expect(response.peers[0]?.multiaddrs).toEqual([
      "/ip4/192.168.3.78/tcp/53830/p2p/peer-b",
      "/ip4/127.0.0.1/tcp/4001/p2p/relay-1/p2p-circuit/p2p/peer-b",
    ]);

    now = Date.parse("2026-04-27T10:02:00.000Z");
    expect(
      roster.lookup({
        requesterPeerId: "peer-a",
        relayPeerId: "relay-1",
        relayMultiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-1"],
        payload: {
          queryId: "q2",
          capability: "mesh.discovery",
          maxResults: 10,
          maxHops: 0,
          maxFanout: 2,
          visibilityScope: "public",
          expiresAt: "2026-04-27T10:03:00.000Z",
        },
      }).peers,
    ).toEqual([]);
  });

  it("tracks relay client candidates and failures", () => {
    const relay = { relayId: "relay-1", multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-1"] };
    const state = createRelayClientState([relay]);
    noteRelayFailure(state, relay, Date.parse("2026-04-27T10:00:00.000Z"));
    expect(state.activeRelays).toEqual([]);
    expect(state.failedRelays[0]?.failureCount).toBe(1);

    addRelayCandidates(state, [
      { relayId: "relay-2", multiaddrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-2"] },
      relay,
    ]);
    expect(state.candidateRelays.map((item) => item.relayId)).toEqual(["relay-2"]);

    noteRelaySuccess(state, state.candidateRelays[0]!);
    expect(state.activeRelays.map((item) => item.relayId)).toEqual(["relay-2"]);
  });

  it("stores summaries and expires stale summary state", () => {
    let now = Date.parse("2026-04-27T10:00:00.000Z");
    const roster = createRelayRoster({ now: () => now });
    roster.registerRelay({
      relayId: "relay-2",
      addrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-2"],
      relation: "sibling",
      state: "verified",
      expiresAt: "2026-04-27T10:05:00.000Z",
    });
    roster.registerSummary({
      relayId: "relay-2",
      level: 2,
      childRelayCount: 0,
      livePeerCount: 3,
      topicBuckets: ["capability:mesh.discovery"],
      expiresAt: "2026-04-27T10:01:00.000Z",
    });

    expect(roster.summaries().map((entry) => entry.relayId)).toEqual(["relay-2"]);
    expect(roster.relayBook()[0]?.addrs).toEqual(["/ip4/127.0.0.1/tcp/4002/p2p/relay-2"]);

    now = Date.parse("2026-04-27T10:02:00.000Z");
    expect(roster.summaries()).toEqual([]);
  });
});
