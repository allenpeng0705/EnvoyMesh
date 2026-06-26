import { describe, expect, it } from "vitest";
import { createWsRelayRoster } from "../src/ws-relay-roster.js";
import { createRelayCheckinPayload, createRelayLookupPayload } from "@envoymesh/protocol";

describe("ws-relay-roster", () => {
  it("returns LAN listen addrs from checkin in lookup response", () => {
    const roster = createWsRelayRoster();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    roster.checkin(
      createRelayCheckinPayload({
        peerId: "12D3KooWMacPeerIdExample",
        ownerId: "envoy:owner:mac",
        relayReachableAddrs: [
          "/ip4/192.168.3.85/tcp/53238/p2p/12D3KooWMacPeerIdExample",
        ],
        capabilities: ["mesh.discovery"],
        expiresAt,
      }),
    );
    const response = roster.lookup({
      payload: createRelayLookupPayload({
        queryId: "q1",
        targetPeerId: "12D3KooWMacPeerIdExample",
        capability: "mesh.discovery",
        expiresAt,
      }),
      requesterPeerId: "12D3KooWWinPeerIdExample",
      relayMultiaddrs: ["/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelayExample"],
      relayPeerId: "12D3KooWRelayExample",
    });
    expect(response.peers).toHaveLength(1);
    const addrs = response.peers[0]?.multiaddrs ?? [];
    expect(addrs.some((a) => a.includes("192.168.3.85"))).toBe(true);
  });
});
