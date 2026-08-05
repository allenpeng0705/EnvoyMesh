import { describe, expect, it } from "vitest";
import {
  buildConfiguredRelayCircuitListenAddrs,
  buildRelayAdvertisedMultiaddrs,
  filterMultiaddrsToPreferredRelays,
  peerIdFromRelayMultiaddr,
} from "../src/relay-listen-addrs.js";

const CN =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const CN_PEER = "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const IPFS =
  "/ip4/135.181.3.221/tcp/4001/p2p/12D3KooWMH4hRLwnNMu6JDZCFRFqYBXEyo8bfYYoT4sqi2Nx48NS";
const IPFS_PEER = "12D3KooWMH4hRLwnNMu6JDZCFRFqYBXEyo8bfYYoT4sqi2Nx48NS";
const US = "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";

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
    const addrs = [
      `${CN}/p2p-circuit/p2p/${US}`,
      `${IPFS}/p2p-circuit/p2p/${US}`,
      `/ip4/1.2.3.4/tcp/4001/p2p/${US}`,
    ];
    expect(filterMultiaddrsToPreferredRelays(addrs, [CN_PEER])).toEqual([
      `${CN}/p2p-circuit/p2p/${US}`,
      `/ip4/1.2.3.4/tcp/4001/p2p/${US}`,
    ]);
    expect(filterMultiaddrsToPreferredRelays(addrs, [])).toEqual(addrs);
    expect(filterMultiaddrsToPreferredRelays(addrs, [IPFS_PEER])).toEqual([
      `${IPFS}/p2p-circuit/p2p/${US}`,
      `/ip4/1.2.3.4/tcp/4001/p2p/${US}`,
    ]);
  });

  it("drops circuits when reservation is not usable", () => {
    const listen = [
      `/ip4/127.0.0.1/tcp/4001/p2p/${CN_PEER}/p2p-circuit/p2p/${US}`,
      `${CN}/p2p-circuit/p2p/${US}`,
      `/ip4/192.168.3.85/tcp/4001/p2p/${US}`,
    ];
    expect(
      buildRelayAdvertisedMultiaddrs({
        listenAddrs: listen,
        preferredRelayBases: [CN],
        usableRelayPeerIds: [],
        selfPeerId: US,
      }),
    ).toEqual([`/ip4/192.168.3.85/tcp/4001/p2p/${US}`]);
  });

  it("rewrites private-hop circuits onto public preferred bases when usable", () => {
    const listen = [
      `/ip4/127.0.0.1/tcp/4001/p2p/${CN_PEER}/p2p-circuit/p2p/${US}`,
      `/ip4/172.16.0.161/tcp/4001/p2p/${CN_PEER}/p2p-circuit/p2p/${US}`,
      `/ip4/192.168.3.85/tcp/51997/p2p/${US}`,
    ];
    expect(
      buildRelayAdvertisedMultiaddrs({
        listenAddrs: listen,
        preferredRelayBases: [CN],
        usableRelayPeerIds: [CN_PEER],
        selfPeerId: US,
      }),
    ).toEqual([`${CN}/p2p-circuit/p2p/${US}`, `/ip4/192.168.3.85/tcp/51997/p2p/${US}`]);
  });

  it("synthesizes public circuit when only private hop is present", () => {
    expect(
      buildRelayAdvertisedMultiaddrs({
        listenAddrs: [`/ip4/127.0.0.1/tcp/4001/p2p/${CN_PEER}/p2p-circuit/p2p/${US}`],
        preferredRelayBases: [CN],
        usableRelayPeerIds: [CN_PEER],
        selfPeerId: US,
      }),
    ).toEqual([`${CN}/p2p-circuit/p2p/${US}`]);
  });
});
