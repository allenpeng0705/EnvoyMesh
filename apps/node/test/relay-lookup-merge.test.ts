import { describe, expect, it } from "vitest";
import { preferRelayPeerCandidate, relayPeerHoppabilityScore } from "../src/relay-lookup-merge.js";
import type { RelayPeerCandidate } from "@envoymesh/protocol";

function peer(partial: Partial<RelayPeerCandidate> & { peerId: string }): RelayPeerCandidate {
  return {
    peerId: partial.peerId,
    multiaddrs: partial.multiaddrs ?? [],
    capabilities: partial.capabilities ?? ["mesh.discovery"],
    visibility: partial.visibility ?? "public",
    hasHopSlot: partial.hasHopSlot,
    viaRelayId: partial.viaRelayId,
  };
}

describe("preferRelayPeerCandidate", () => {
  it("upgrades checkin-only empty hit to a live hoppable candidate", () => {
    const first = peer({
      peerId: "12D3KooWSame",
      hasHopSlot: false,
      multiaddrs: [],
    });
    const better = peer({
      peerId: "12D3KooWSame",
      hasHopSlot: true,
      multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/relay/p2p-circuit/p2p/12D3KooWSame"],
    });
    expect(preferRelayPeerCandidate(first, better)).toBe(better);
    expect(preferRelayPeerCandidate(better, first)).toBe(better);
  });

  it("prefers non-empty multiaddrs when hasHopSlot is omitted (legacy)", () => {
    const empty = peer({ peerId: "p1", multiaddrs: [] });
    const withAddrs = peer({
      peerId: "p1",
      multiaddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/r/p2p-circuit/p2p/p1"],
    });
    expect(relayPeerHoppabilityScore(withAddrs)).toBeGreaterThan(relayPeerHoppabilityScore(empty));
    expect(preferRelayPeerCandidate(empty, withAddrs)).toBe(withAddrs);
  });
});
