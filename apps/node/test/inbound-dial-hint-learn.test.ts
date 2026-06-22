import { describe, expect, it, vi } from "vitest";
import {
  dialableInboundRemoteAddrs,
  mergeInboundPeerDialHintsIfDue,
  shouldMergeInboundListenAddrs,
} from "../src/inbound-dial-hint-learn.js";

const PEER = "12D3KooWInboundDialHintLearnTest";

describe("inbound-dial-hint-learn", () => {
  it("drops ephemeral inbound TCP snapshots", () => {
    expect(
      dialableInboundRemoteAddrs(`/ip4/192.168.1.50/tcp/64595/p2p/${PEER}`, PEER),
    ).toEqual([]);
    expect(
      dialableInboundRemoteAddrs(`/ip4/192.168.1.50/tcp/4011/p2p/${PEER}`, PEER),
    ).toEqual([`/ip4/192.168.1.50/tcp/4011/p2p/${PEER}`]);
  });

  it("merges LAN listen addrs immediately without waiting for throttle", async () => {
    const lastMergeByPeer = new Map<string, number>();
    lastMergeByPeer.set(PEER, Date.now());
    const mergeListenAddrsForPeerId = vi.fn(async () => {});
    const mergePeerStoreDialHints = vi.fn(async () => {});

    const addrs = await mergeInboundPeerDialHintsIfDue({
      remotePeerId: PEER,
      remoteAddr: `/ip4/192.168.1.50/tcp/4011/p2p/${PEER}`,
      lastMergeByPeer,
      peerDirectory: { mergeListenAddrsForPeerId },
      mesh: { mergePeerStoreDialHints },
    });

    expect(addrs).toEqual([`/ip4/192.168.1.50/tcp/4011/p2p/${PEER}`]);
    expect(mergeListenAddrsForPeerId).toHaveBeenCalledTimes(1);
    expect(mergePeerStoreDialHints).toHaveBeenCalledTimes(1);
  });

  it("respects merge throttle for non-LAN addrs", () => {
    const lastMergeByPeer = new Map<string, number>();
    lastMergeByPeer.set(PEER, Date.now());
    const dialable = [`/ip4/47.93.11.212/tcp/4001/p2p/${PEER}`];
    expect(shouldMergeInboundListenAddrs(PEER, dialable, lastMergeByPeer)).toBe(false);
  });
});
