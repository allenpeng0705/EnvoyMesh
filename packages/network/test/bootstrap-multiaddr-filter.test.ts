import { describe, expect, it } from "vitest";
import {
  capBootstrapPeersForCircuitHoppability,
  filterBootstrapMultiaddrs,
  filterRelayControlTargets,
  isDockerBridgeGatewayDialHint,
  isPublicLibp2pBootstrapMultiaddr,
  isUnusableBootstrapMultiaddr,
  shouldSkipBootstrapProbeTarget,
} from "../src/index.js";

describe("bootstrap multiaddr filter", () => {
  const relay =
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
  const publicLibp2p = "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN";

  it("accepts configured relay and public libp2p bootstrap addrs", () => {
    expect(isUnusableBootstrapMultiaddr(relay)).toBe(false);
    expect(isUnusableBootstrapMultiaddr(publicLibp2p)).toBe(false);
  });

  it("rejects loopback and docker bridge gateway addrs", () => {
    expect(isUnusableBootstrapMultiaddr("/ip4/127.0.0.1/tcp/34307/ws")).toBe(true);
    expect(isUnusableBootstrapMultiaddr("/ip4/127.0.0.1/tcp/45519/p2p/12D3KooWTest")).toBe(true);
    expect(isUnusableBootstrapMultiaddr("/ip4/172.17.0.1/tcp/45519/p2p/12D3KooWTest")).toBe(true);
    expect(isUnusableBootstrapMultiaddr("/ip4/172.20.0.1/tcp/34307/ws/p2p/12D3KooWTest")).toBe(true);
  });

  it("rejects transport-only addrs missing /p2p/", () => {
    expect(isUnusableBootstrapMultiaddr("/ip4/192.168.1.10/tcp/4001")).toBe(true);
  });

  it("rejects WebTransport and incomplete circuit bootstrap addrs", () => {
    const webTransport =
      "/ip6/2001:6b0:30:1337:0:feed:babe:beef/udp/4001/quic-v1/webtransport/certhash/uEiA/p2p/12D3KooWRelay/p2p-circuit";
    expect(isUnusableBootstrapMultiaddr(webTransport)).toBe(true);
  });

  it("detects docker bridge gateway pattern", () => {
    expect(isDockerBridgeGatewayDialHint("/ip4/172.17.0.1/tcp/4001/p2p/x")).toBe(true);
    expect(isDockerBridgeGatewayDialHint("/ip4/172.31.0.1/tcp/4001/p2p/x")).toBe(true);
    expect(isDockerBridgeGatewayDialHint("/ip4/192.168.1.1/tcp/4001/p2p/x")).toBe(false);
  });

  it("detects public libp2p bootstrap dnsaddr multiaddrs", () => {
    expect(
      isPublicLibp2pBootstrapMultiaddr(
        "/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf",
      ),
    ).toBe(true);
    expect(isPublicLibp2pBootstrapMultiaddr(relay)).toBe(false);
  });

  it("filterRelayControlTargets excludes public libp2p bootstrap nodes", () => {
    expect(
      filterRelayControlTargets([
        relay,
        "/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf",
      ]),
    ).toEqual([relay]);
  });

  it("filterBootstrapMultiaddrs dedupes and drops unusable entries", () => {
    expect(
      filterBootstrapMultiaddrs([
        relay,
        "/ip4/127.0.0.1/tcp/34307/ws",
        relay,
        publicLibp2p,
        "/ip4/172.18.0.1/tcp/45519",
      ]),
    ).toEqual([relay, publicLibp2p]);
  });

  it("shouldSkipBootstrapProbeTarget skips circuit and self", () => {
    const self = "12D3KooWSelfPeerIdxxxxxxxxxxxx";
    expect(shouldSkipBootstrapProbeTarget(relay).skip).toBe(false);
    expect(
      shouldSkipBootstrapProbeTarget(`${relay}/p2p-circuit/p2p/${self}`, self).skip,
    ).toBe(true);
    expect(shouldSkipBootstrapProbeTarget(self, self).skip).toBe(true);
    expect(shouldSkipBootstrapProbeTarget(`/p2p/${self}`, self).skip).toBe(true);
  });

  it("capBootstrapPeersForCircuitHoppability strips circuits and caps fanout", () => {
    const circuit = `${relay}/p2p-circuit/p2p/12D3KooWOtherPeer`;
    const extras = Array.from(
      { length: 12 },
      (_, i) =>
        `/ip4/1.2.3.${i + 1}/tcp/4001/p2p/12D3KooWExtra${String(i).padStart(2, "0")}abcdefghijklmnop`,
    );
    const capped = capBootstrapPeersForCircuitHoppability([relay, circuit, ...extras]);
    expect(capped).not.toContain(circuit);
    expect(capped[0]).toBe(relay);
    expect(capped.length).toBeLessThanOrEqual(8);
  });
});
