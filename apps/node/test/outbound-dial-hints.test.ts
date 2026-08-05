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
      // wan-default profile now applies the wan-public address filter, so
      // the cached LAN listen addr is dropped — the circuit fallback (or
      // relay.lookup seeds) is the only viable path for a different network.
      expect(hints.some((h) => h.includes("192.168.1.50"))).toBe(false);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("drops LAN listen addrs and keeps the circuit relay when discoveryProfile is wan-default", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-lan-circuit-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const target = "12D3KooWContactLanCircuit";
      const circuitSeed =
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContactLanCircuit";
      await seedStore.upsertSuccess(circuitSeed, "relay.lookup");

      const hints = await buildOutboundDialHints({
        recipientPeerId: target,
        peerListenAddrs: [`/ip4/192.168.3.78/tcp/4011/p2p/${target}`],
        discoverySeedStore: seedStore,
        config: undefined, // defaults to wan-public (no discoveryProfile → wan-default)
      });

      // Cached LAN listen addr is dropped — the user's current network can't
      // dial 192.168.3.x. Circuit relay seed survives the wan-public filter.
      expect(hints.some((h) => h.includes("192.168.3.78"))).toBe(false);
      expect(hints.some((h) => h.includes("/p2p-circuit/"))).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("keeps LAN listen addrs when discoveryProfile is lan-fast (same-network home setup)", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-lan-fast-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const target = "12D3KooWLanFastContact";
      const lanAddr = `/ip4/192.168.3.78/tcp/4011/p2p/${target}`;
      const hints = await buildOutboundDialHints({
        recipientPeerId: target,
        peerListenAddrs: [lanAddr],
        discoverySeedStore: seedStore,
        config: {
          version: "0.1",
          profileDir,
          discoveryProfile: "lan-fast",
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

      // lan-fast profile keeps LAN hints — same-LAN direct is faster than relay.
      expect(hints.some((h) => h.includes("192.168.3.78"))).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("filters RFC1918 listen addrs at wan-public even when the peer ID matches a stored record", async () => {
    // The bug we're fixing: a previous same-network session caches the
    // peer's LAN listen addr (192.168.3.x). On a different network, that
    // addr is unreachable — the dial burns 30s on a guaranteed-timeout.
    // With wan-public, the LAN is stripped so the circuit fallback runs
    // immediately (and still fails fast if the sponsor side is down, but
    // at least it fails on a dialable address).
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-stripped-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";
      const strippedTcp = "/ip4/192.168.3.78/tcp/55093";
      const hints = await buildOutboundDialHints({
        recipientPeerId: target,
        peerListenAddrs: [strippedTcp],
        discoverySeedStore: seedStore,
        config: undefined,
      });
      // wan-public strips 192.168.3.78 (RFC1918) regardless of /p2p/ suffix.
      expect(hints.some((h) => h.includes("55093"))).toBe(false);
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

  it("drops ephemeral snapshot ports even when peer ID matches", async () => {
    // Port 55093 ≥ 32768 → ephemeral source port. The snapshot heuristic
    // filters these even when the explicit /p2p/ peer ID matches —
    // a matching peer ID on a high port is still an inbound snapshot.
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
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("regression: dial hint list excludes cached LAN listen addrs when profile is wan-default (sponsor-setup retry-loop fix)", async () => {
    // The exact bug seen in production on 2026-07-11: sendHello to a peer
    // we used to share a LAN with was being routed to the cached 192.168.3.85
    // listen addr first, blocking the 47.93.11.212 circuit fallback. The
    // dial burned 30s on the LAN addr, the circuit never got tried, and the
    // sponsor-setup retry loop spun. With wan-public stripping, the LAN is
    // dropped and the circuit (the only cross-network path) is what the
    // dial layer actually attempts.
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-dial-hints-regression-"));
    try {
      const seedStore = createDiscoverySeedStore(profileDir);
      const sponsorPeerId = "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";
      const sponsorLanAddr = `/ip4/192.168.3.85/tcp/64589/p2p/${sponsorPeerId}`;
      const sponsorCircuitSeed =
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/" +
        `p2p/${sponsorPeerId}`;
      await seedStore.upsertSuccess(sponsorCircuitSeed, "relay.lookup");

      const hints = await buildOutboundDialHints({
        recipientPeerId: sponsorPeerId,
        peerListenAddrs: [sponsorLanAddr],
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

      // The cached LAN addr is unreachable from the current network — the
      // previous behavior prioritized it (slow timeout), starving the
      // circuit fallback. The fix strips it.
      expect(hints.some((h) => h.includes("192.168.3.85"))).toBe(false);
      // The circuit relay survives the filter — it's the dialable path.
      expect(hints.some((h) => h.includes("/p2p-circuit/"))).toBe(true);
      expect(hints.some((h) => h.includes("47.93.11.212"))).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});

describe("shouldPreferCircuitDialHints", () => {
  it("prefers circuits when only private LAN direct TCP hints exist (cross-network fix)", async () => {
    const { shouldPreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    const listen = ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWContact"];
    const hints = [
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact",
    ];
    // Private-LAN-only direct hints are unreachable cross-network;
    // circuits must be preferred so the relay fallback gets a chance.
    expect(shouldPreferCircuitDialHints(listen, hints, "12D3KooWContact")).toBe(true);
  });

  it("prefers direct when public routable TCP hints exist alongside circuits", async () => {
    const { shouldPreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    const listen = ["/ip4/203.0.113.50/tcp/4011/p2p/12D3KooWContact"];
    const hints = [
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact",
    ];
    // Public IP is directly reachable — prefer it over relay.
    expect(shouldPreferCircuitDialHints(listen, hints, "12D3KooWContact")).toBe(false);
  });

  it("prefers circuits when private LAN hints exist without any public direct", async () => {
    const { shouldPreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    // Simulates the sponsor-friend scenario: sponsor has 192.168.3.85 addresses
    // but the new user is on a different network.
    const listen = [
      "/ip4/192.168.3.85/tcp/64589/p2p/12D3KooWSponsor",
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooWSponsor",
    ];
    const hints = [
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWSponsor",
    ];
    expect(shouldPreferCircuitDialHints(listen, hints, "12D3KooWSponsor")).toBe(true);
  });

  it("allows relay when no direct TCP hints exist", async () => {
    const { shouldPreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    const hints = ["/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact"];
    expect(shouldPreferCircuitDialHints([], hints, "12D3KooWContact")).toBe(true);
  });
});

describe("resolvePreferCircuitDialHints", () => {
  it("lets explicit false win over private-LAN circuit heuristic", async () => {
    const { resolvePreferCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    const listen = ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWContact"];
    const hints = [
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWContact",
    ];
    expect(resolvePreferCircuitDialHints(false, listen, hints, "12D3KooWContact")).toBe(false);
    expect(resolvePreferCircuitDialHints(true, listen, hints, "12D3KooWContact")).toBe(true);
    expect(resolvePreferCircuitDialHints(undefined, listen, hints, "12D3KooWContact")).toBe(true);
  });
});

describe("shouldRetainCircuitDialHints", () => {
  it("always retains for bond.request", async () => {
    const { shouldRetainCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    expect(
      shouldRetainCircuitDialHints({
        intent: "bond.request",
        preferCircuitHints: false,
      }),
    ).toBe(true);
  });

  it("honors explicit preferCircuitHints true/false for non-bond intents", async () => {
    const { shouldRetainCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    expect(
      shouldRetainCircuitDialHints({
        intent: "call.invite",
        preferCircuitHints: true,
      }),
    ).toBe(true);
    expect(
      shouldRetainCircuitDialHints({
        intent: "call.invite",
        preferCircuitHints: false,
        wantCircuits: true,
        connectedDirect: false,
      }),
    ).toBe(false);
  });

  it("retains relay-connected WAN paths when circuits are wanted", async () => {
    const { shouldRetainCircuitDialHints } = await import("../src/outbound-dial-hints.js");
    expect(
      shouldRetainCircuitDialHints({
        intent: "call.invite",
        wantCircuits: true,
        connectedDirect: false,
      }),
    ).toBe(true);
    expect(
      shouldRetainCircuitDialHints({
        intent: "call.invite",
        wantCircuits: true,
        connectedDirect: true,
      }),
    ).toBe(false);
  });
});

describe("outbound-dial-hints helpers", () => {
  it("mergeDialablePeerListenAddrs drops ephemeral snapshot ports", async () => {
    const { mergeDialablePeerListenAddrs } = await import("../src/outbound-dial-hints.js");
    const peerId = "12D3KooWContact";
    const merged = mergeDialablePeerListenAddrs(
      peerId,
      [`/ip4/192.168.1.50/tcp/55093/p2p/${peerId}`],
      [`/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`],
    );
    // The ephemeral (port 55093) is filtered by isUsableChatDialHint
    // via isUsableOutboundPeerDialHint. Only the stable port remains.
    expect(merged).toEqual([
      `/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`,
    ]);
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

  it("prioritizeSameSubnetDialHints prefers peers on the same /24 as this node", async () => {
    const { prioritizeSameSubnetDialHints } = await import("../src/outbound-dial-hints.js");
    const peerId = "12D3KooWContact";
    const ordered = prioritizeSameSubnetDialHints(
      [
        `/ip4/10.0.0.5/tcp/4011/p2p/${peerId}`,
        `/ip4/192.168.1.99/tcp/4011/p2p/${peerId}`,
        `/ip4/192.168.1.50/tcp/4011/p2p/${peerId}`,
      ],
      [`/ip4/192.168.1.10/tcp/4010/p2p/12D3KooWLocal`],
    );
    expect(ordered[0]).toMatch(/192\.168\.1\.(50|99)/);
    expect(ordered[1]).toMatch(/192\.168\.1\.(50|99)/);
    expect(ordered[2]).toContain("10.0.0.5");
  });
});

describe("pickAddressFilterForPeer", () => {
  // Helper: sponsor peer-id used only to make multiaddrs look real.
  const SPONSOR = "12D3KooWSponsor";

  it("returns \"wan-public\" when peer has public circuit + LAN (strip home LAN on wan)", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/192.168.3.85/tcp/64589/p2p/${SPONSOR}`,
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${SPONSOR}`,
    ];
    // Public circuit exists → strip RFC1918 so WAN installs do not dial
    // the sponsor's home LAN (or a private-hop circuit) first.
    expect(pickAddressFilterForPeer(peerAddrs, "wan-default")).toBe("wan-public");
    expect(pickAddressFilterForPeer(peerAddrs, undefined)).toBe("wan-public");
  });

  it("returns \"wan-public\" when peer has public + private-hop circuits", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/192.168.3.85/tcp/4001/p2p/12D3KooWLanRelay/p2p-circuit/p2p/${SPONSOR}`,
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${SPONSOR}`,
    ];
    expect(pickAddressFilterForPeer(peerAddrs, "wan-default")).toBe("wan-public");
  });

  it("returns \"all\" when peer has only private LAN (no circuit yet)", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/192.168.3.85/tcp/64589/p2p/${SPONSOR}`,
    ];
    expect(pickAddressFilterForPeer(peerAddrs, "wan-default")).toBe("all");
  });

  it("returns \"all\" when peer has only link-local addresses", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/169.254.10.20/tcp/4001/p2p/${SPONSOR}`,
    ];
    expect(pickAddressFilterForPeer(peerAddrs, undefined)).toBe("all");
  });

  it("returns \"wan-public\" when peer has only WAN addresses", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/47.93.11.212/tcp/4001/p2p/${SPONSOR}`,
      `/dns4/relay.example.com/tcp/4001/p2p/${SPONSOR}`,
    ];
    expect(pickAddressFilterForPeer(peerAddrs, undefined)).toBe("wan-public");
  });

  it("returns \"wan-public\" when peer has only circuit-relay addresses", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${SPONSOR}`,
    ];
    expect(pickAddressFilterForPeer(peerAddrs, undefined)).toBe("wan-public");
  });

  it("falls back to local profile default when peer has no known addresses", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    expect(pickAddressFilterForPeer([], "wan-default")).toBe("wan-public");
    expect(pickAddressFilterForPeer([], "lan-fast")).toBe("all");
    expect(pickAddressFilterForPeer(undefined, undefined)).toBe("wan-public");
  });

  it("returns \"all\" for any peer when local profile is lan-fast", async () => {
    const { pickAddressFilterForPeer } = await import("../src/outbound-dial-hints.js");
    const peerAddrs = [
      `/ip4/47.93.11.212/tcp/4001/p2p/${SPONSOR}`,
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${SPONSOR}`,
    ];
    expect(pickAddressFilterForPeer(peerAddrs, "lan-fast")).toBe("all");
  });
});
