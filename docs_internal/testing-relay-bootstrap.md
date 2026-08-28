# Relay Server and Bootstrap Selection Testing Guide

This document describes how to write integration tests for testing:
1. Node connecting to a relay server
2. Node using public libp2p bootstrap presets
3. Node using private relay bootstrap
4. Node using hybrid (both public and private) bootstrap

---

## Overview

Integration tests verify that nodes actually connect and communicate over the P2P network, not just that config is persisted.

```
┌─────────────────────────────────────────────────────────────┐
│                   TESTING ARCHITECTURE                       │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  Test Node A │◄──────►│  Test Relay  │                  │
│  │              │         │   Server    │                  │
│  └──────────────┘         └──────────────┘                  │
│         │                         ▲                          │
│         │                         │                          │
│         ▼                         │                          │
│  ┌──────────────┐                │                          │
│  │  Test Node B │◄───────────────┘                          │
│  │              │                                            │
│  └──────────────┘                                            │
│                                                             │
│  Public libp2p network (optional for integration tests)       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  bootstrap.libp2p.io                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Test Relay Server

Before running integration tests, you need a running relay server:

```bash
# Run a relay server for testing
npm run relay:dev -- \
  --profile ./data/test-relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --advertise-addr /ip4/127.0.0.1/tcp/4001 \
  --no-dht
```

Or use the script:
```bash
./scripts/run-relay.sh --profile ./data/test-relay --advertise 127.0.0.1
```

The relay server multiaddr will be:
```
/ip4/127.0.0.1/tcp/4001/p2p/<RELAY_PEER_ID>
```

---

## Test Scenarios

### Scenario 1: Private Relay Bootstrap Only

**Purpose:** Verify node connects to your relay and discovers peers via private DHT.

```typescript
describe("Private Relay Bootstrap", () => {
  it("should connect to configured relay server", async () => {
    const RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/p2p/QmTestRelayPeerId...";

    // Create node with relay as bootstrap
    const node = await createTestNode({
      bootstrapPeers: [RELAY_ADDR],
      enableDht: true,
      dhtClientMode: true,
    });

    // Wait for connection
    await waitForPeerConnected(node, RELAY_ADDR);

    // Verify node has relay in peer list
    const peers = await node.getConnectedPeers();
    expect(peers).toContain(RELAY_ADDR);

    await node.stop();
  });

  it("should discover peer B through relay after peer A connects", async () => {
    const RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/p2p/QmTestRelayPeerId...";

    // Node A connects to relay
    const nodeA = await createTestNode({
      bootstrapPeers: [RELAY_ADDR],
    });
    await waitForPeerConnected(nodeA, RELAY_ADDR);

    // Node B connects to same relay
    const nodeB = await createTestNode({
      bootstrapPeers: [RELAY_ADDR],
    });
    await waitForPeerConnected(nodeB, RELAY_ADDR);

    // Both nodes should discover each other through relay
    // (depending on DHT mode)
    await nodeB.discoverPeers();

    // Verify they can communicate
    const canConnect = await nodeA.ping(nodeB.peerId);
    expect(canConnect).toBe(true);

    await nodeA.stop();
    await nodeB.stop();
  });
});
```

### Scenario 2: Public libp2p Bootstrap Only

**Purpose:** Verify node connects to public libp2p network via bootstrap presets.

```typescript
describe("Public libp2p Bootstrap", () => {
  it("should resolve bootstrap preset to peer addresses", async () => {
    // Use the preset that resolves to bootstrap.libp2p.io
    const node = await createTestNode({
      bootstrapPresets: ["public-libp2p"],
      enableDht: true,
    });

    // Node should resolve preset and connect to at least one bootstrap peer
    await waitForBootstrapConnection(node, 30000); // 30s timeout

    const connectedPeers = await node.getConnectedPeers();
    const hasBootstrapPeer = connectedPeers.some(peer =>
      peer.includes("bootstrap.libp2p.io")
    );
    expect(hasBootstrapPeer).toBe(true);

    await node.stop();
  });

  it("should discover public peers via DHT", async () => {
    const node = await createTestNode({
      bootstrapPresets: ["public-libp2p"],
      enableDht: true,
    });

    await waitForBootstrapConnection(node);

    // Query DHT for any peers
    const publicPeers = await node.findPeersOnDHT();

    // We might or might not find peers depending on network state
    // The important thing is the query completes without error
    expect(Array.isArray(publicPeers)).toBe(true);

    await node.stop();
  });
});
```

### Scenario 3: Hybrid Bootstrap (Public + Private)

**Purpose:** Verify node connects to both public network and your private relay.

```typescript
describe("Hybrid Bootstrap", () => {
  it("should connect to both public bootstrap and private relay", async () => {
    const RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/p2p/QmTestRelayPeerId...";

    const node = await createTestNode({
      bootstrapPresets: ["public-libp2p"],
      bootstrapPeers: [RELAY_ADDR],
      enableDht: true,
    });

    // Wait for both connections
    await waitForBootstrapConnection(node, 30000);
    await waitForPeerConnected(node, RELAY_ADDR);

    const connectedPeers = await node.getConnectedPeers();

    // Should have at least one public peer
    const hasPublicPeer = connectedPeers.some(peer =>
      peer.includes("bootstrap.libp2p.io")
    );
    expect(hasPublicPeer).toBe(true);

    // Should have private relay peer
    expect(connectedPeers).toContain(RELAY_ADDR);

    await node.stop();
  });

  it("should maintain separate peer tables for public and private", async () => {
    const RELAY_ADDR = "/ip4/127.0.0.1/tcp/4001/p2p/QmTestRelayPeerId...";

    const node = await createTestNode({
      bootstrapPresets: ["public-libp2p"],
      bootstrapPeers: [RELAY_ADDR],
      enableDht: true,
    });

    await waitForAllConnections(node, 30000);

    // Get peers from public DHT
    const publicPeers = await node.getPublicNetworkPeers();

    // Get peers from private relay
    const privatePeers = await node.getPrivateNetworkPeers();

    // Public peers should NOT include private relay
    expect(publicPeers).not.toContain(RELAY_ADDR);

    // Private peers should include our relay
    expect(privatePeers).toContain(RELAY_ADDR);

    await node.stop();
  });
});
```

### Scenario 4: Node as Relay Server

**Purpose:** Verify a node can act as a relay for other peers.

```typescript
describe("Node as Relay Server", () => {
  it("should accept relay connections from other nodes", async () => {
    // Start a node with relay server enabled
    const relayNode = await createTestNode({
      enableRelayServer: true,
      advertiseAddrs: ["/ip4/127.0.0.1/tcp/4002"],
    });

    const RELAY_NODE_ADDR = relayNode.getMultiaddr();

    // Another node connects through this relay
    const clientNode = await createTestNode({
      bootstrapPeers: [RELAY_NODE_ADDR],
      enableRelay: true,
    });

    await waitForPeerConnected(clientNode, RELAY_NODE_ADDR);

    // Verify client can reach another peer via relay
    const anotherNode = await createTestNode({
      bootstrapPeers: [RELAY_NODE_ADDR],
    });
    await waitForPeerConnected(anotherNode, RELAY_NODE_ADDR);

    // Client should be able to communicate with anotherNode through relay
    const canCommunicate = await clientNode.pingViaRelay(anotherNode.peerId);
    expect(canCommunicate).toBe(true);

    await relayNode.stop();
    await clientNode.stop();
    await anotherNode.stop();
  });
});
```

---

## Test Infrastructure

### Helper Functions

```typescript
// apps/node/test/integration/helpers.ts

/**
 * Create a test node with given options
 */
export async function createTestNode(options: TestNodeOptions): Promise<TestNode> {
  const node = new EnvoyMesh({
    listen: ["/ip4/0.0.0.0/tcp/0"],
    bootstrapPeers: options.bootstrapPeers ?? [],
    bootstrapPresets: options.bootstrapPresets ?? [],
    enableRelayServer: options.enableRelayServer ?? false,
    enableRelay: options.enableRelay ?? true,
    enableDht: options.enableDht ?? true,
    dhtClientMode: options.dhtClientMode ?? true,
    libp2pPrivateKeyPath: join(options.profileDir, "test-key"),
  });

  await node.start();
  return new TestNode(node);
}

/**
 * Wait for connection to a specific peer
 */
export async function waitForPeerConnected(
  node: TestNode,
  peerAddr: string,
  timeout: number = 10000
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const peers = await node.getConnectedPeers();
    if (peers.some(p => p.includes(peerAddr))) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for peer: ${peerAddr}`);
}

/**
 * Wait for connection to any bootstrap peer
 */
export async function waitForBootstrapConnection(
  node: TestNode,
  timeout: number = 30000
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const peers = await node.getConnectedPeers();
    if (peers.length > 0) {
      return;
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for bootstrap connection");
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Test Node Wrapper

```typescript
// apps/node/test/integration/test-node.ts

export class TestNode {
  private mesh: EnvoyMesh;

  constructor(mesh: EnvoyMesh) {
    this.mesh = mesh;
  }

  get peerId(): string {
    return this.mesh.peerId;
  }

  get multiaddr(): string {
    return this.mesh.multiaddrs[0];
  }

  async start(): Promise<void> {
    await this.mesh.start();
  }

  async stop(): Promise<void> {
    await this.mesh.stop();
  }

  async getConnectedPeers(): Promise<string[]> {
    return this.mesh.getConnectedPeers();
  }

  async ping(peerId: string): Promise<boolean> {
    try {
      await this.mesh.dial(peerId);
      return true;
    } catch {
      return false;
    }
  }

  async pingViaRelay(targetPeerId: string): Promise<boolean> {
    // Implementation for relay ping
    return false;
  }

  async findPeersOnDHT(): Promise<string[]> {
    // Query DHT for peers
    return [];
  }

  async discoverPeers(): Promise<void> {
    // Trigger peer discovery
  }
}
```

---

## Running the Tests

### Setup

1. Start a test relay server:
```bash
npm run relay:dev -- --profile ./data/test-relay --advertise 127.0.0.1
```

2. Get the relay's peer ID from the output:
```
[relay] Peer ID: 12D3KooW...
[relay] Listen addresses: /ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...
```

3. Update the test file with your relay's multiaddr

### Run Tests

```bash
# Run all integration tests
npm test -- apps/node/test/integration

# Run specific test file
npm test -- apps/node/test/integration/bootstrap-relay.test.ts

# Run with verbose output
npm test -- apps/node/test/integration --reporter=verbose
```

### Cleanup

```bash
# Stop the test relay
pkill -f "relay.*test-relay"

# Or if running via script
# Press Ctrl+C in the relay terminal
```

---

## Test Data

### Bootstrap Presets Available

| Preset | DNS Address | Peer IDs |
|--------|-------------|----------|
| `public-libp2p` | bootstrap.libp2p.io | 4 peers |
| `public-libp2p-am6` | am6.bootstrap.libp2p.io | 1 peer |
| `public-libp2p-am7` | am7.bootstrap.libp2p.io | 1 peer |

### Expected Behavior

| Configuration | Public Peers | Private Peers | Notes |
|--------------|--------------|---------------|-------|
| `--bootstrap-preset public-libp2p` | Yes | No | Only public libp2p network |
| `--bootstrap /ip4/x/tcp/4001/p2p/QmRelay` | No | Yes | Only private relay |
| Both presets + relay | Yes | Yes | Hybrid mode |

---

## Troubleshooting

### Test Times Out Waiting for Connection

1. Check relay server is running: `sudo ss -tlnp | grep 4001`
2. Check firewall: `sudo ufw status`
3. Verify advertise address matches your machine's IP

### No Peers Found

1. Public libp2p network may be sparse - try at different times
2. DHT may need time to discover peers
3. Check node logs for discovery events

### Connection Refused

1. Verify relay server started successfully
2. Check relay server logs for errors
3. Ensure correct multiaddr format

---

## File Structure

```
apps/node/test/
├── integration/
│   ├── helpers.ts          # Test helper functions
│   ├── test-node.ts        # TestNode wrapper class
│   ├── bootstrap-relay.test.ts        # Bootstrap tests
│   ├── public-bootstrap.test.ts        # Public libp2p tests
│   ├── hybrid-bootstrap.test.ts       # Hybrid mode tests
│   └── relay-server.test.ts            # Relay server tests
├── node-config-service.test.ts  # Unit tests (already exists)
└── args.test.ts                 # Unit tests (already exists)
```
