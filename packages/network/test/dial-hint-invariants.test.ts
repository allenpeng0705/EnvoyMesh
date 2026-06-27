import { describe, expect, it } from "vitest";
import {
  filterAdvertisedListenDialHints,
  filterUsableOutboundPeerDialHints,
  hasDirectTcpDialHints,
  isDialableAdvertisedListenHint,
  isLikelyInboundConnSnapshotDialHint,
  isUsableAdvertisedListenDialHint,
  isUsableOutboundPeerDialHint,
} from "../src/index.js";

const PEER = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";

describe("dial hint invariants (same-LAN tcp/0)", () => {
  const lanListen = `/ip4/192.168.3.78/tcp/55353/p2p/${PEER}`;
  const lanSnapshot = `/ip4/192.168.3.78/tcp/60974/p2p/${PEER}`;
  const wanSnapshot = `/ip4/106.37.112.84/tcp/64595/p2p/${PEER}`;
  const stableLan = `/ip4/192.168.3.78/tcp/4001/p2p/${PEER}`;

  it("inbound snapshots are always ephemeral regardless of LAN/WAN", () => {
    expect(isLikelyInboundConnSnapshotDialHint(lanSnapshot)).toBe(true);
    expect(isLikelyInboundConnSnapshotDialHint(wanSnapshot)).toBe(true);
    expect(isLikelyInboundConnSnapshotDialHint(lanListen)).toBe(true);
    expect(isLikelyInboundConnSnapshotDialHint(stableLan)).toBe(false);
  });

  it("strict outbound filter rejects all ephemeral ports", () => {
    expect(isUsableOutboundPeerDialHint(lanListen, PEER)).toBe(false);
    expect(isUsableOutboundPeerDialHint(lanSnapshot, PEER)).toBe(false);
    expect(isUsableOutboundPeerDialHint(stableLan, PEER)).toBe(true);
  });

  it("advertised listen filter keeps LAN ephemeral listen ports only", () => {
    expect(isDialableAdvertisedListenHint(lanListen)).toBe(true);
    expect(isDialableAdvertisedListenHint(lanSnapshot)).toBe(true);
    expect(isDialableAdvertisedListenHint(wanSnapshot)).toBe(false);
    expect(isUsableAdvertisedListenDialHint(lanListen, PEER)).toBe(true);
    expect(isUsableAdvertisedListenDialHint(wanSnapshot, PEER)).toBe(false);
  });

  it("hasDirectTcpDialHints counts LAN tcp/0 listen ports", () => {
    expect(hasDirectTcpDialHints([lanListen])).toBe(true);
    expect(hasDirectTcpDialHints([wanSnapshot])).toBe(false);
  });

  it("filterAdvertisedListenDialHints keeps LAN listen, drops WAN ephemeral", () => {
    expect(filterAdvertisedListenDialHints([lanListen, wanSnapshot, stableLan], PEER)).toEqual([
      lanListen,
      stableLan,
    ]);
  });

  it("filterUsableOutboundPeerDialHints stays strict for peerstore/inbound paths", () => {
    expect(filterUsableOutboundPeerDialHints([lanListen, stableLan], PEER)).toEqual([stableLan]);
  });
});
