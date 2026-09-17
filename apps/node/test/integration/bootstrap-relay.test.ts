/**
 * Integration tests for relay bootstrap functionality
 *
 * These tests verify that nodes can connect to relay servers and
 * discover peers through various bootstrap configurations.
 *
 * Gating:
 *   - Everything inside `Relay Bootstrap Integration Tests` needs a reachable
 *     relay / the public libp2p network, so it only runs under
 *     `RUN_E2E=1 RUN_WAN_RELAY_TESTS=1`; `npm test` skips it (see
 *     `vitest.config.ts` and `vitest.setup.ts`).
 *   - `Bootstrap preset expansion (hermetic)` at the bottom is pure
 *     product-path resolution plus a loopback wiring assertion. It is NOT
 *     WAN-gated: under `RUN_E2E=1` it runs and proves that a preset expands to
 *     concrete peers and that `createTestNode` forwards them to `EnvoyMesh`.
 *
 * Prerequisite — a relay:
 *   - Default: the EnvoyMesh community relay from `getRelayAddress()`
 *     (repo-root `.env` `TEST_RELAY_ADDR`, loaded by `vitest.setup.ts`;
 *     the hard-coded fallback is cn-relay 47.93.11.212:4001).
 *   - Override with `TEST_RELAY_ADDR=/ip4/.../p2p/...` for a private relay
 *     (`scripts/run-relay.sh` can start one locally).
 *
 * Usage:
 *   RUN_E2E=1 RUN_WAN_RELAY_TESTS=1 \
 *     npx vitest run apps/node/test/integration/bootstrap-relay.test.ts
 *
 *   # With custom relay
 *   RUN_E2E=1 RUN_WAN_RELAY_TESTS=1 TEST_RELAY_ADDR=/ip4/1.2.3.4/tcp/4001/p2p/Qm... \
 *     npx vitest run apps/node/test/integration/bootstrap-relay.test.ts
 *
 *   # With verbose output
 *   RUN_E2E=1 RUN_WAN_RELAY_TESTS=1 \
 *     npx vitest run apps/node/test/integration/bootstrap-relay.test.ts --verbose
 *
 * Environment variables:
 *   TEST_RELAY_ADDR - Relay server multiaddr
 *   TEST_BOOTSTRAP_PRESETS - Comma-separated list of presets
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  createTestNode,
  cleanupTestNode,
  waitForPeerConnected,
  waitForBootstrapConnection,
  waitForRelayConnection,
  getRelayAddress,
  getBootstrapPresets,
  parseTestConfig,
  sleep,
  type TestNode,
} from "./helpers.js";
// The node product's own preset -> concrete-peer expansion. The tests below go
// through it (directly and via `createTestNode`) instead of hard-coding
// addresses, so a preset that stops resolving fails the test.
import { resolveBootstrapPresetPeers } from "../../src/args.js";

const TEST_CONFIG = parseTestConfig();

/** Hits a WAN relay (default in helpers). Off by default so `npm test` does not depend on public infra. */
const RUN_WAN_RELAY_TESTS = process.env.RUN_WAN_RELAY_TESTS === "1";

/**
 * Ceiling for establishing a WAN relay connection (and, for the in-process
 * relay test, a reservation). Measured from this network against cn-relay
 * (2026-09-16): the first direct dial via `@libp2p/bootstrap` took ~17.5 s,
 * while an explicitly configured relay (`configuredRelayAddrs`) connected in
 * ~0.4–3 s. 45 s is a safety ceiling (same value
 * `discovery-relay-robustness-e2e` uses), not the expected duration — the
 * waits poll and return as soon as the connection is open.
 */
const RELAY_WAIT_MS = 45_000;

describe.skipIf(!RUN_WAN_RELAY_TESTS)("Relay Bootstrap Integration Tests", () => {
  // Track all test nodes for cleanup
  const testNodes: TestNode[] = [];

  afterEach(async () => {
    // Cleanup all test nodes
    await Promise.all(testNodes.map((n) => cleanupTestNode(n)));
    testNodes.length = 0;
  });

  describe("Private Relay Bootstrap", () => {
    it("should connect to configured relay server", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;
      const relayPeerId = relayAddr.split("/p2p/")[1];

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Connecting to relay: ${relayAddr}`);
      }

      const node = await createTestNode({
        bootstrapPeers: [relayAddr],
        // Explicitly reserve on the configured relay. With bare `/p2p-circuit`
        // AutoRelay never reserves on the community relay, so the node would
        // be connected but unreachable inbound.
        configuredRelayAddrs: [relayAddr],
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      // Wait for connection to relay
      await waitForPeerConnected(node, relayAddr, RELAY_WAIT_MS);

      expect(node.getConnectedPeerIds()).toContain(relayPeerId);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Node ${node.peerIdB58.slice(0, 8)} connected to relay`);
        console.log(`[Test] Connected peers: ${node.getConnectedPeerIds().length}`);
      }
    }, 90_000);

    it("should maintain connection to relay after startup", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;

      const node = await createTestNode({
        bootstrapPeers: [relayAddr],
        configuredRelayAddrs: [relayAddr],
      });
      testNodes.push(node);

      // Wait for initial connection
      await waitForPeerConnected(node, relayAddr, RELAY_WAIT_MS);

      // Wait a bit and verify still connected
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const isStillConnected = node.isConnectedTo(
        relayAddr.split("/p2p/")[1]
      );

      expect(isStillConnected).toBe(true);
    }, 90_000);

    it("should connect multiple nodes to the same relay", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;
      const relayPeerId = relayAddr.split("/p2p/")[1];

      // Create first node
      const node1 = await createTestNode({
        bootstrapPeers: [relayAddr],
        configuredRelayAddrs: [relayAddr],
      });
      testNodes.push(node1);
      await waitForPeerConnected(node1, relayAddr, RELAY_WAIT_MS);

      // Create second node
      const node2 = await createTestNode({
        bootstrapPeers: [relayAddr],
        configuredRelayAddrs: [relayAddr],
      });
      testNodes.push(node2);
      await waitForPeerConnected(node2, relayAddr, RELAY_WAIT_MS);

      // Both should be connected to relay
      expect(node1.getConnectedPeerIds()).toContain(relayPeerId);
      expect(node2.getConnectedPeerIds()).toContain(relayPeerId);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Node1 peer IDs: ${node1.getConnectedPeerIds().length}`);
        console.log(`[Test] Node2 peer IDs: ${node2.getConnectedPeerIds().length}`);
      }
    }, 120_000);
  });

  describe("Public libp2p Bootstrap", () => {
    const presets = TEST_CONFIG.bootstrapPresets;

    it("should resolve and connect to bootstrap preset", async () => {
      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Using bootstrap presets: ${presets.join(", ")}`);
      }

      // A preset is a product-level id; the node must expand it to concrete
      // multiaddrs before EnvoyMesh sees anything.
      const resolvedPeers = resolveBootstrapPresetPeers(presets);
      const resolvedPeerIds = resolvedPeers
        .map((addr) => addr.split("/p2p/")[1])
        .filter((id): id is string => Boolean(id));
      expect(resolvedPeers.length).toBeGreaterThan(0);
      expect(resolvedPeerIds.length).toBe(resolvedPeers.length);

      const node = await createTestNode({
        bootstrapPresets: presets,
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      // The node must carry the *resolved* peers — not the raw ids, not [].
      expect(node.bootstrapPeers).toEqual(resolvedPeers);

      // The real claim: a peer *from the preset* is connected. A truthy peerId
      // or "some peer connected" is what made the old version vacuous — an
      // mDNS LAN neighbour or a DHT peer is not a bootstrap.
      const deadline = Date.now() + RELAY_WAIT_MS;
      let bootstrappedPeerId: string | undefined;
      while (Date.now() < deadline) {
        const connected = new Set(node.getConnectedPeerIds());
        bootstrappedPeerId = resolvedPeerIds.find((id) => connected.has(id));
        if (bootstrappedPeerId) break;
        await sleep(500);
      }

      if (TEST_CONFIG.verbose) {
        console.log(
          `[Test] Node ${node.peerIdB58.slice(0, 8)} bootstrapped via ${bootstrappedPeerId ?? "(none)"} ` +
            `(connected peers: ${node.getConnectedPeerIds().length})`,
        );
      }

      expect(
        bootstrappedPeerId,
        `no configured bootstrap peer connected. resolved=${resolvedPeers.join(", ")} ` +
          `connected=${node.getConnectedPeerIds().join(", ") || "(none)"}`,
      ).toBeDefined();
    }, 90_000);
  });

  describe("Hybrid Bootstrap (Public + Private)", () => {
    it("should connect to both public network and private relay", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;
      const relayPeerId = relayAddr.split("/p2p/")[1];
      const presets = TEST_CONFIG.bootstrapPresets;

      const node = await createTestNode({
        bootstrapPresets: presets,
        bootstrapPeers: [relayAddr],
        configuredRelayAddrs: [relayAddr],
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      // Wait for both connections
      await Promise.all([
        waitForBootstrapConnection(node, 10000).catch(() => {
          console.warn("[Test] Public bootstrap connection timed out (may be expected)");
        }),
        waitForPeerConnected(node, relayAddr, RELAY_WAIT_MS).catch(() => {
          console.warn("[Test] Relay connection timed out (may be expected)");
        }),
      ]);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Connected peers: ${node.getConnectedPeerIds().length}`);
      }

      // The private relay leg is deterministic once the relay is configured;
      // the public leg stays best-effort (public network may be unreachable).
      expect(node.getConnectedPeerIds()).toContain(relayPeerId);
    }, 90_000);
  });

  describe("Network Mode Configurations", () => {
    it("should work with private-only mode (no public bootstrap)", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;
      const relayPeerId = relayAddr.split("/p2p/")[1];

      const node = await createTestNode({
        bootstrapPeers: [relayAddr],
        configuredRelayAddrs: [relayAddr],
        // No bootstrapPresets - pure private
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      await waitForPeerConnected(node, relayAddr, RELAY_WAIT_MS);

      // Should have a direct connection to the relay. A live reservation is
      // deliberately not asserted here: over WAN the community relay grants it
      // variably (measured 0.4 s–15 s, sometimes >45 s under shared load), and
      // that stronger property is covered by discovery-relay-robustness-e2e.
      expect(node.getConnectedPeerIds()).toContain(relayPeerId);
    }, 120_000);

    it("should work with public-only mode (no private relay)", async () => {
      const presets = TEST_CONFIG.bootstrapPresets;

      // Public-only still has to resolve its presets: the node must see concrete
      // multiaddrs, never the product-level preset id. Same expansion the
      // public-bootstrap test above asserts, done before the node exists so a
      // resolution regression fails without waiting on the WAN.
      const resolvedPeers = resolveBootstrapPresetPeers(presets);
      const resolvedPeerIds = resolvedPeers
        .map((addr) => addr.split("/p2p/")[1])
        .filter((id): id is string => Boolean(id));
      expect(resolvedPeers.length).toBeGreaterThan(0);
      expect(resolvedPeerIds.length).toBe(resolvedPeers.length);

      // Don't specify any relay, only public presets
      const node = await createTestNode({
        bootstrapPresets: presets,
        // No bootstrapPeers
        enableDht: true,
      });
      testNodes.push(node);

      // Public-only means exactly the resolved preset set reaches EnvoyMesh —
      // not `[]` (the original defect: `createTestNode` accepted
      // `bootstrapPresets` and dropped them, so the node bootstrapped nothing
      // while the old `Array.isArray(...)` assertion still passed), and not the
      // raw preset id. This is the assertion that can fail.
      expect(node.bootstrapPeers).toEqual(resolvedPeers);

      // The dial is deliberately best-effort and NOT asserted. A public-only
      // node has no configured relay reservation, and measured from this network
      // against the community relay the bootstrap probe logs REACHABLE while the
      // node holds 0 sessions (the relay is a contact point here, not a wired
      // relay); the libp2p public bootstrap is sparse and its DNS does not
      // resolve everywhere. A hard "a preset peer connected" assertion would
      // therefore go red for environmental reasons, so the regression this test
      // guards is the wiring above and the dial only logs. The sibling
      // public-bootstrap test keeps the hard connect assertion because that is
      // the test that owns the public-network claim.
      await waitForBootstrapConnection(node, 10_000).catch(() => {
        console.warn("[Test] public-only dial: no session within 10s (best-effort)");
      });
    }, 120_000);
  });

  describe("Relay Server Functionality", () => {
    it("should act as relay when enableRelayServer is true", async () => {
      // Create a relay server node
      const relayNode = await createTestNode({
        enableRelayServer: true,
        enableDht: false, // Simpler config for relay
      });
      testNodes.push(relayNode);

      const relayMultiaddr = relayNode.multiaddrs[0].toString();

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Relay server multiaddr: ${relayMultiaddr}`);
      }

      // Create a client node that connects through the relay. The relay's
      // loopback base is dropped by libp2p's bootstrap filter, so configure it
      // as an explicit relay to make the dial (and reservation) deterministic.
      const clientNode = await createTestNode({
        bootstrapPeers: [relayMultiaddr],
        configuredRelayAddrs: [relayMultiaddr],
        enableRelay: true,
        enableRelayServer: false,
      });
      testNodes.push(clientNode);

      // Client should connect to relay
      await waitForPeerConnected(clientNode, relayMultiaddr, RELAY_WAIT_MS);

      // Client should see the relay server in its connections
      const relayPeers = clientNode.getConnectedPeerIds();
      expect(relayPeers).toContain(relayNode.peerId);

      // ...and the relay server should have granted it a live reservation.
      await waitForRelayConnection(clientNode, RELAY_WAIT_MS);
      expect(clientNode.hasLiveRelayReservation()).toBe(true);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Client connected to relay via: ${relayPeers.join(", ")}`);
      }
    }, 90_000);
  });

  describe("Error Handling", () => {
    it("should handle invalid relay address gracefully", async () => {
      // Use a valid-format peer ID but unreachable address
      const invalidAddr = "/ip4/10.255.255.1/tcp/59999/p2p/12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q";

      const node = await createTestNode({
        bootstrapPeers: [invalidAddr],
      });
      testNodes.push(node);

      // Should not throw, but also should not connect
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const peerIds = node.getConnectedRelayPeerIds();
      // May have 0 connections if invalid address can't be reached
      expect(Array.isArray(peerIds)).toBe(true);
    });

    it("should handle empty bootstrap configuration", async () => {
      const node = await createTestNode({
        // No bootstrapPeers or bootstrapPresets
        enableDht: false,
        enableRelay: false,
      });
      testNodes.push(node);

      // Should start without errors
      expect(node.peerIdB58).toBeTruthy();

      const peerIds = node.getConnectedRelayPeerIds();
      expect(peerIds.length).toBe(0);
    });
  });
});

/**
 * Preset expansion is a pure product computation plus a wiring step, so this
 * half is hermetic and deliberately NOT behind the WAN gate above: it runs in
 * the default `RUN_E2E=1` pass and fails if a preset stops resolving to
 * concrete peers, or if `createTestNode` accepts `bootstrapPresets` without
 * forwarding the expansion to `EnvoyMesh` (the original defect — the node
 * bootstrapped nothing and the test still passed on peerId truthiness).
 */
describe("Bootstrap preset expansion (hermetic)", () => {
  it("expands a preset to multiple peer addresses and configures the node with them", async () => {
    // Shipped preset the two Public-libp2p tests claimed to exercise: it must
    // yield concrete multiaddrs, not the preset id.
    const publicPeers = resolveBootstrapPresetPeers(["public-libp2p"]);
    expect(publicPeers.length).toBeGreaterThan(1);
    expect(publicPeers.every((addr) => /^\/.+\/p2p\/[^/]+$/.test(addr))).toBe(true);
    expect(new Set(publicPeers).size).toBe(publicPeers.length);

    // A custom preset (same code path as `--bootstrap-presets-file`) aimed at
    // loopback keeps the *wiring* assertion hermetic: EnvoyMesh filters
    // loopback out of `@libp2p/bootstrap`, so no WAN dial is made here.
    const relayPeerId = TEST_CONFIG.relayAddr.split("/p2p/")[1];
    const customPeers = [
      `/ip4/127.0.0.1/tcp/1/p2p/${relayPeerId}`,
      `/ip4/127.0.0.2/tcp/1/p2p/${relayPeerId}`,
    ];
    const registry = new Map([["test-loopback-preset", customPeers]]);

    const node = await createTestNode({
      bootstrapPresets: ["test-loopback-preset"],
      bootstrapPresetRegistry: registry,
      enableDht: false,
      enableRelay: false,
      enableRelayServer: false,
      enableAutoNat: false,
      enableDcutr: false,
    });
    try {
      // Pre-fix this was `[]`: the preset was accepted and dropped.
      expect(node.bootstrapPeers).toEqual(customPeers);
    } finally {
      await cleanupTestNode(node);
    }
  }, 30_000);
});

// Run with: npm test -- apps/node/test/integration/bootstrap-relay.test.ts --relay-addr=/ip4/1.2.3.4/tcp/4001/p2p/Qm...
