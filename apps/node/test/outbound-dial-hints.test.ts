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
      expect(hints.some((h) => h.includes("/p2p-circuit/p2p/12D3KooW"))).toBe(true);
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
});
