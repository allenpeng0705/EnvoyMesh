import { describe, expect, it } from "vitest";
import {
  filterBootstrapMultiaddrs,
  isDockerBridgeGatewayDialHint,
  isUnusableBootstrapMultiaddr,
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

  it("detects docker bridge gateway pattern", () => {
    expect(isDockerBridgeGatewayDialHint("/ip4/172.17.0.1/tcp/4001/p2p/x")).toBe(true);
    expect(isDockerBridgeGatewayDialHint("/ip4/172.31.0.1/tcp/4001/p2p/x")).toBe(true);
    expect(isDockerBridgeGatewayDialHint("/ip4/192.168.1.1/tcp/4001/p2p/x")).toBe(false);
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
});
