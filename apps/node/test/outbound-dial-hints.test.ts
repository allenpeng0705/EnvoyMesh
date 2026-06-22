import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOutboundDialHints } from "../src/outbound-dial-hints.js";
import { createDiscoverySeedStore } from "../src/discovery-seed-store.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

const publicAm7 = "/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf";

describe("buildOutboundDialHints", () => {
  it("does not synthesize circuit paths via public libp2p bootstrap nodes", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-empty-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const hints = await buildOutboundDialHints({
        recipientPeerId: "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR",
        peerListenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR"],
        discoverySeedStore: seedStore,
        config: {
          version: "0.1",
          profileDir,
          discoveryProfile: "wan-default",
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [publicAm7, DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
          bootstrapPresets: ["public-libp2p-am7"],
          configuredRelays: [],
          modelProviders: { mode: "mock" },
          chatAssistEnabled: false,
          contactAiPreferences: [],
          updatedAt: new Date().toISOString(),
        },
      });

      expect(hints.some((h) => h.includes("bootstrap.libp2p.io"))).toBe(false);
      expect(hints.some((h) => h.includes("/p2p-circuit/p2p/12D3KooW"))).toBe(false);
      expect(hints.some((h) => h.includes("192.168.1.50"))).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("includes circuit seeds that match recipient peer id", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const circuitSeed =
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact";
      await seedStore.upsertSuccess(circuitSeed, "bootstrap-probe");

      const hints = await buildOutboundDialHints({
        recipientPeerId: "12D3KooWContact",
        peerListenAddrs: [],
        discoverySeedStore: seedStore,
        config: undefined,
      });

      expect(hints).toContain(circuitSeed);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("drops stale public libp2p bootstrap seeds from discovery-seeds.json", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-seeds-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      await seedStore.upsertSuccess(publicAm7, "bootstrap-probe");
      await seedStore.upsertSuccess(
        "/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf/p2p-circuit/p2p/12D3KooWTarget",
        "relay.lookup",
      );

      const hints = await buildOutboundDialHints({
        recipientPeerId: "12D3KooWTarget",
        peerListenAddrs: [],
        discoverySeedStore: seedStore,
        config: undefined,
      });

      expect(hints.some((h) => h.includes("bootstrap.libp2p.io"))).toBe(false);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("drops incomplete WebTransport circuit reservations stored as contact listen addrs", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-wt-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";
      const badWebTransport =
        "/ip6/2001:6b0:30:1337:0:feed:babe:beef/udp/4001/quic-v1/webtransport/certhash/uEiADq3Ua4Mo4IrYmAkYXhtJjNxILcwFNKTuLkvaMc8Rkvg/certhash/uEiAJdWXsc8ux3BN5bfKW7pjP4L8Jd-rO5cAM9BVXSVGr0w/p2p/12D3KooWPcsFofqUUJGdpEuCbPgSoPyE8vLqaJN513rMkmMm1Egh/p2p-circuit";
      await seedStore.upsertSuccess(badWebTransport, "relay.lookup");

      const hints = await buildOutboundDialHints({
        recipientPeerId: target,
        peerListenAddrs: [badWebTransport],
        discoverySeedStore: seedStore,
        config: undefined,
      });

      expect(hints.some((h) => h.includes("webtransport"))).toBe(false);
      expect(hints.some((h) => h.endsWith("/p2p-circuit"))).toBe(false);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("drops ephemeral inbound TCP snapshot ports and still allows relay circuit fallback", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-ephemeral-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";
      const hints = await buildOutboundDialHints({
        recipientPeerId: target,
        peerListenAddrs: [
          `/ip4/192.168.3.78/tcp/55093/p2p/${target}`,
          `/ip4/192.168.3.78/tcp/60417/p2p/${target}`,
        ],
        discoverySeedStore: seedStore,
        config: {
          version: "0.1",
          profileDir,
          discoveryProfile: "wan-default",
          relayEnabled: true,
          relayServerEnabled: false,
          advertiseAddrs: [],
          bootstrapPeers: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
          bootstrapPresets: ["cn-relay"],
          configuredRelays: [],
          modelProviders: { mode: "mock" },
          chatAssistEnabled: false,
          contactAiPreferences: [],
          updatedAt: new Date().toISOString(),
        },
      });

      expect(hints.some((h) => h.includes("55093"))).toBe(false);
      expect(hints.some((h) => h.includes("60417"))).toBe(false);
      expect(hints.some((h) => h.includes("/p2p-circuit/p2p/12D3KooWN67"))).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});

describe("shouldPreferCircuitDialHints", () => {
  it("prefers direct LAN TCP over relay when LAN listen addrs exist", async () => {
    const { shouldPreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    const listen = ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWContact"];
    const hints = [
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact",
    ];
    expect(shouldPreferCircuitDialHints(listen, hints, "12D3KooWContact")).toBe(false);
  });

  it("allows relay when no direct TCP hints exist", async () => {
    const { shouldPreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    const hints = ["/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact"];
    expect(shouldPreferCircuitDialHints([], hints, "12D3KooWContact")).toBe(true);
  });

  it("mergeDialablePeerListenAddrs drops ephemeral inbound TCP snapshots", async () => {
    const { mergeDialablePeerListenAddrs } = await import("../src/outbound-dial-hints.js");
    const peerId = "12D3KooWContact";
    const merged = mergeDialablePeerListenAddrs(
      peerId,
      [`/ip4/192.168.1.50/tcp/55093/p2p/${peerId}`],
      [`/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`],
    );
    expect(merged).toEqual([`/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`]);
  });

  it("prioritizeDirectLanDialHints puts RFC1918 addresses first", async () => {
    const { prioritizeDirectLanDialHints } = await import("../src/outbound-dial-hints.js");
    const peerId = "12D3KooWContact";
    const ordered = prioritizeDirectLanDialHints([
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`,
      `/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`,
    ]);
    expect(ordered[0]).toContain("192.168.1.50");
  });
});
