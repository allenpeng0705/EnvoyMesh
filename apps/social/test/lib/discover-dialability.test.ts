import { describe, expect, it } from "vitest";
import {
  isDirectPeerAddress,
  isPeerReachableNow,
  type DialabilityInput,
} from "../../src/lib/discover-dialability.js";

function peer(partial: DialabilityInput = {}): DialabilityInput {
  return { multiaddrs: [], ...partial };
}

const CIRCUIT = "/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer";
const DIRECT = "/ip4/192.168.1.9/tcp/4001/p2p/12D3KooWPeer";

describe("discover-dialability", () => {
  it("classifies addresses", () => {
    expect(isDirectPeerAddress(DIRECT)).toBe(true);
    expect(isDirectPeerAddress(CIRCUIT)).toBe(false);
  });

  it("treats a hop-less roster hit as not reachable", () => {
    expect(isPeerReachableNow(peer({ hasHopSlot: false }))).toBe(false);
  });

  it("treats a live hop as reachable", () => {
    expect(isPeerReachableNow(peer({ hasHopSlot: true }))).toBe(true);
  });

  it("keeps a direct address dialable despite a negative hop report", () => {
    // A DHT merge can contribute the peer's own address while the roster says
    // it holds no slot: dialing it directly can still work.
    expect(
      isPeerReachableNow(peer({ hasHopSlot: false, multiaddrs: [DIRECT] })),
    ).toBe(true);
  });

  it("still gates circuit-only addresses when the hop is down", () => {
    expect(
      isPeerReachableNow(peer({ hasHopSlot: false, multiaddrs: [CIRCUIT] })),
    ).toBe(false);
  });

  it("stays permissive when the source is silent (peer-directory fallback)", () => {
    expect(isPeerReachableNow(peer())).toBe(true);
    expect(isPeerReachableNow(peer({ multiaddrs: [CIRCUIT] }))).toBe(true);
  });

  it("handles a row with no address field at all (desktop rows)", () => {
    // The desktop PeerSearchResult carries only the hop report.
    expect(isPeerReachableNow({ hasHopSlot: false })).toBe(false);
    expect(isPeerReachableNow({ hasHopSlot: true })).toBe(true);
    expect(isPeerReachableNow({})).toBe(true);
  });
});
