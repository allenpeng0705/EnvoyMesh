import { describe, expect, it } from "vitest";
import {
  buildConfiguredRelayCircuitListenAddrs,
  filterMultiaddrsToPreferredRelays,
  peerIdFromRelayMultiaddr,
} from "../src/relay-listen-addrs.js";

const CN =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const CN_PEER = "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const IPFS =
  "/ip4/135.181.3.221/tcp/4001/p2p/12D3KooWMH4hRLwnNMu6JDZCFRFqYBXEyo8bfYYoT4sqi2Nx48NS";
const IPFS_PEER = "12D3KooWMH4hRLwnNMu6JDZCFRFqYBXEyo8bfYYoT4sqi2Nx48NS";

describe("relay-listen-addrs", () => {
  it("builds configured /p2p-circuit listen addrs (not bare /p2p-circuit)", () => {
    expect(buildConfiguredRelayCircuitListenAddrs([CN, `${CN}/p2p-circuit/p2p/x`])).toEqual([
      `${CN}/p2p-circuit`,
    ]);
  });

  it("extracts relay peer ids from bases", () => {
    expect(peerIdFromRelayMultiaddr(CN)).toBe(CN_PEER);
    expect(peerIdFromRelayMultiaddr(`${CN}/p2p-circuit`)).toBeUndefined();
  });

  it("filters AutoRelay circuits outside preferred relays", () => {
    const us = "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";
    const addrs = [
      `${CN}/p2p-circuit/p2p/${us}`,
      `${IPFS}/p2p-circuit/p2p/${us}`,
      `/ip4/1.2.3.4/tcp/4001/p2p/${us}`,
    ];
    expect(filterMultiaddrsToPreferredRelays(addrs, [CN_PEER])).toEqual([
      `${CN}/p2p-circuit/p2p/${us}`,
      `/ip4/1.2.3.4/tcp/4001/p2p/${us}`,
    ]);
    expect(filterMultiaddrsToPreferredRelays(addrs, [])).toEqual(addrs);
    expect(filterMultiaddrsToPreferredRelays(addrs, [IPFS_PEER])).toEqual([
      `${IPFS}/p2p-circuit/p2p/${us}`,
      `/ip4/1.2.3.4/tcp/4001/p2p/${us}`,
    ]);
  });
});
