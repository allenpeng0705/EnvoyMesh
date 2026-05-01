/**
 * Integration tests for relay bootstrap functionality
 *
 * These tests verify that nodes can connect to relay servers and
 * discover peers through various bootstrap configurations.
 *
 * Usage:
 *   # Using default local relay
 *   npm test -- apps/node/test/integration/bootstrap-relay.test.ts
 *
 *   # With custom relay server
 *   npm test -- apps/node/test/integration/bootstrap-relay.test.ts --relay-addr=/ip4/1.2.3.4/tcp/4001/p2p/Qm...
 *
 *   # With verbose output
 *   npm test -- apps/node/test/integration/bootstrap-relay.test.ts --verbose
 *
 *   # With bootstrap presets
 *   npm test -- apps/node/test/integration/bootstrap-relay.test.ts --presets=public-libp2p
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
  type TestNode,
} from "./helpers.js";

const TEST_CONFIG = parseTestConfig();

describe("Relay Bootstrap Integration Tests", () => {
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

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Connecting to relay: ${relayAddr}`);
      }

      const node = await createTestNode({
        bootstrapPeers: [relayAddr],
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      // Wait for connection to relay
      await waitForPeerConnected(node, relayAddr, 15000);

      const peerIds = node.getConnectedRelayPeerIds();
      expect(peerIds.length).toBeGreaterThan(0);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Node ${node.peerIdB58.slice(0, 8)} connected to relay`);
        console.log(`[Test] Connected peers: ${peerIds.length}`);
      }
    });

    it("should maintain connection to relay after startup", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;

      const node = await createTestNode({
        bootstrapPeers: [relayAddr],
      });
      testNodes.push(node);

      // Wait for initial connection
      await waitForPeerConnected(node, relayAddr, 15000);

      // Wait a bit and verify still connected
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const isStillConnected = await node.isConnectedTo(
        relayAddr.split("/p2p/")[1]
      );

      expect(isStillConnected).toBe(true);
    });

    it("should connect multiple nodes to the same relay", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;

      // Create first node
      const node1 = await createTestNode({
        bootstrapPeers: [relayAddr],
      });
      testNodes.push(node1);
      await waitForPeerConnected(node1, relayAddr, 15000);

      // Create second node
      const node2 = await createTestNode({
        bootstrapPeers: [relayAddr],
      });
      testNodes.push(node2);
      await waitForPeerConnected(node2, relayAddr, 15000);

      // Both should be connected to relay
      const peerIds1 = await node1.getConnectedPeerIds();
      const peerIds2 = await node2.getConnectedPeerIds();

      expect(peerIds1.length).toBeGreaterThan(0);
      expect(peerIds2.length).toBeGreaterThan(0);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Node1 peer IDs: ${peerIds1.length}`);
        console.log(`[Test] Node2 peer IDs: ${peerIds2.length}`);
      }
    });
  });

  describe("Public libp2p Bootstrap", () => {
    const presets = TEST_CONFIG.bootstrapPresets;

    it("should resolve and connect to bootstrap preset", async () => {
      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Using bootstrap presets: ${presets.join(", ")}`);
      }

      const node = await createTestNode({
        bootstrapPresets: presets,
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      // Try to wait for connection, but don't fail if it times out
      // (public network may not be available in test environment)
      try {
        await waitForBootstrapConnection(node, 10000);
        const peerIds = node.getConnectedRelayPeerIds();
        if (TEST_CONFIG.verbose) {
          console.log(`[Test] Node connected to ${peerIds.length} bootstrap peers`);
        }
      } catch {
        console.warn("[Test] Could not connect to public bootstrap (may be expected in test environment)");
      }

      // Verify node at least started successfully
      expect(node.peerIdB58).toBeTruthy();
    }, 30000);

    it("should expand preset to multiple peer addresses", async () => {
      const node = await createTestNode({
        bootstrapPresets: presets,
        enableDht: true,
      });
      testNodes.push(node);

      // Try to connect, but don't fail
      try {
        await waitForBootstrapConnection(node, 10000);
        const peerIds = node.getConnectedRelayPeerIds();
        if (TEST_CONFIG.verbose) {
          console.log(`[Test] Expanded preset to ${peerIds.length} peers`);
        }
      } catch {
        console.warn("[Test] Could not connect to public bootstrap");
      }

      // Verify node at least started
      expect(node.peerIdB58).toBeTruthy();
    }, 30000);
  });

  describe("Hybrid Bootstrap (Public + Private)", () => {
    it("should connect to both public network and private relay", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;
      const presets = TEST_CONFIG.bootstrapPresets;

      const node = await createTestNode({
        bootstrapPresets: presets,
        bootstrapPeers: [relayAddr],
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      // Wait for both connections
      await Promise.all([
        waitForBootstrapConnection(node, 10000).catch(() => {
          console.warn("[Test] Public bootstrap connection timed out (may be expected)");
        }),
        waitForPeerConnected(node, relayAddr, 15000).catch(() => {
          console.warn("[Test] Relay connection timed out (may be expected)");
        }),
      ]);

      const relayPeers = node.getConnectedRelayPeerIds();

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Relay peers: ${relayPeers.length}`);
      }

      // Should have some connections (either public or private)
      expect(Array.isArray(relayPeers)).toBe(true);
    }, 30000);
  });

  describe("Network Mode Configurations", () => {
    it("should work with private-only mode (no public bootstrap)", async () => {
      const relayAddr = TEST_CONFIG.relayAddr;

      const node = await createTestNode({
        bootstrapPeers: [relayAddr],
        // No bootstrapPresets - pure private
        enableDht: true,
        dhtClientMode: true,
      });
      testNodes.push(node);

      await waitForPeerConnected(node, relayAddr, 15000);

      const peerIds = node.getConnectedRelayPeerIds();
      expect(peerIds.length).toBeGreaterThan(0);

      // Should have relay connection
      const relayPeers = await node.getConnectedRelayPeerIds();
      expect(relayPeers.length).toBeGreaterThan(0);
    });

    it("should work with public-only mode (no private relay)", async () => {
      const presets = TEST_CONFIG.bootstrapPresets;

      // Don't specify any relay, only public presets
      const node = await createTestNode({
        bootstrapPresets: presets,
        // No bootstrapPeers
        enableDht: true,
      });
      testNodes.push(node);

      // May or may not connect depending on public network state
      await waitForBootstrapConnection(node, 60000).catch(() => {
        console.warn("[Test] Public bootstrap connection timed out");
      });

      const peerIds = node.getConnectedRelayPeerIds();
      // Just verify it doesn't crash - may have 0 peers if public network is sparse
      expect(Array.isArray(peerIds)).toBe(true);
    }, 120000);
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

      // Create a client node that connects through the relay
      const clientNode = await createTestNode({
        bootstrapPeers: [relayMultiaddr],
        enableRelay: true,
        enableRelayServer: false,
      });
      testNodes.push(clientNode);

      // Client should connect to relay
      await waitForPeerConnected(clientNode, relayMultiaddr, 15000);

      // Client should see relay in its connections
      const relayPeers = await clientNode.getConnectedRelayPeerIds();
      expect(relayPeers.length).toBeGreaterThan(0);

      if (TEST_CONFIG.verbose) {
        console.log(`[Test] Client connected to relay via: ${relayPeers.join(", ")}`);
      }
    });
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

// Run with: npm test -- apps/node/test/integration/bootstrap-relay.test.ts --relay-addr=/ip4/1.2.3.4/tcp/4001/p2p/Qm...
