import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { EnvoyMesh } from "@envoymesh/network";
import { type PeerId } from "@libp2p/interface-peer-id";
import { type Multiaddr } from "@multiformats/multiaddr";

export interface TestNodeOptions {
  /** Listen address for the node */
  listen?: string[];
  /** Bootstrap peer multiaddrs */
  bootstrapPeers?: string[];
  /** Bootstrap presets (e.g., ["public-libp2p"]) */
  bootstrapPresets?: string[];
  /** Enable relay server functionality */
  enableRelayServer?: boolean;
  /** Enable relay client functionality */
  enableRelay?: boolean;
  /** Enable DHT */
  enableDht?: boolean;
  /** DHT client mode (vs server mode) */
  dhtClientMode?: boolean;
  /** Enable AutoNAT */
  enableAutoNat?: boolean;
  /** Enable DCUtR (hole punching) */
  enableDcutr?: boolean;
  /** Profile directory for this test node */
  profileDir?: string;
  /** TCP port to listen on (default: 0 = random) */
  port?: number;
}

export interface TestNodeStats {
  connectedPeers: string[];
  discoveredPeers: string[];
  relayConnections: string[];
  dhtProviders: number;
}

/**
 * Wrapper class for a test EnvoyMesh node
 */
export class TestNode {
  private mesh: EnvoyMesh;
  private _started: boolean = false;
  private _profileDir: string;

  constructor(mesh: EnvoyMesh, profileDir: string) {
    this.mesh = mesh;
    this._profileDir = profileDir;
  }

  get peerId(): string {
    return this.mesh.peerId;
  }

  get peerIdB58(): string {
    return this.mesh.peerId;
  }

  get multiaddrs(): string[] {
    return this.mesh.multiaddrs;
  }

  get started(): boolean {
    return this._started;
  }

  async start(): Promise<void> {
    if (this._started) return;
    await this.mesh.start();
    this._started = true;
  }

  async stop(): Promise<void> {
    if (!this._started) return;
    await this.mesh.stop();
    this._started = false;
  }

  /**
   * Get peer IDs of relay-connected peers
   */
  getConnectedRelayPeerIds(): string[] {
    return this.mesh.getConnectedRelayPeerIds();
  }

  /**
   * Check if connected to a specific peer by peer ID
   */
  isConnectedTo(peerIdB58: string): boolean {
    const relayPeers = this.getConnectedRelayPeerIds();
    return relayPeers.includes(peerIdB58);
  }

  /**
   * Check if connected to a relay with given multiaddr substring
   */
  isConnectedToRelay(relayAddr: string): boolean {
    const relayPeers = this.getConnectedRelayPeerIds();
    return relayPeers.some((p) => relayAddr.includes(p) || p.includes(relayAddr.split("/p2p/")[1] || ""));
  }

  /**
   * Dial a peer by multiaddr
   */
  async dial(peerAddr: string): Promise<void> {
    await this.mesh.dial(peerAddr);
  }

  /**
   * Get stats about this node's network state
   */
  getStats(): TestNodeStats {
    const relayConnections = this.getConnectedRelayPeerIds();

    return {
      connectedPeers: relayConnections,
      discoveredPeers: [],
      relayConnections,
      dhtProviders: 0,
    };
  }

  /**
   * Log node info for debugging
   */
  log(): void {
    console.log(`[TestNode ${this.peerIdB58.slice(0, 8)}]`);
    console.log(`  Listen: ${this.multiaddrs.join(", ")}`);
  }
}

/**
 * Create a test node with the given options
 */
export async function createTestNode(options: TestNodeOptions = {}): Promise<TestNode> {
  const {
    listen = ["/ip4/0.0.0.0/tcp/0"],
    bootstrapPeers = [],
    bootstrapPresets = [],
    enableRelayServer = false,
    enableRelay = true,
    enableDht = true,
    dhtClientMode = true,
    enableAutoNat = true,
    enableDcutr = true,
    profileDir = join("/tmp", `envoymesh-test-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  } = options;

  // Ensure profile directory exists
  mkdirSync(profileDir, { recursive: true });

  // Create the EnvoyMesh instance
  const mesh = new EnvoyMesh({
    listen,
    bootstrapPeers,
    bootstrapPresets,
    enableRelayServer,
    enableRelay,
    enableDht,
    dhtClientMode,
    enableAutoNat,
    enableDcutr,
    libp2pPrivateKeyPath: join(profileDir, "libp2p-key"),
  });

  const node = new TestNode(mesh, profileDir);
  await node.start();

  return node;
}

/**
 * Wait for connection to a specific peer (by peer ID substring or multiaddr)
 */
export async function waitForPeerConnected(
  node: TestNode,
  peerIdOrAddr: string,
  timeout: number = 10000
): Promise<void> {
  const deadline = Date.now() + timeout;
  const peerIdPart = peerIdOrAddr.includes("/p2p/")
    ? peerIdOrAddr.split("/p2p/")[1]
    : peerIdOrAddr;

  while (Date.now() < deadline) {
    const relayPeers = node.getConnectedRelayPeerIds();
    if (relayPeers.some((p) => p.includes(peerIdPart) || peerIdPart.includes(p))) {
      return;
    }
    await sleep(500);
  }

  const stats = node.getStats();
  throw new Error(
    `Timed out waiting for peer: ${peerIdOrAddr}. ` +
    `Relay peers: ${stats.relayConnections.join(", ") || "none"}`
  );
}

/**
 * Wait for connection to any bootstrap peer (relay peers)
 */
export async function waitForBootstrapConnection(
  node: TestNode,
  timeout: number = 30000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const relayPeers = node.getConnectedRelayPeerIds();
    if (relayPeers.length > 0) {
      return;
    }
    await sleep(1000);
  }

  throw new Error("Timed out waiting for bootstrap connection");
}

/**
 * Wait for relay connection
 */
export async function waitForRelayConnection(
  node: TestNode,
  timeout: number = 15000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const relayPeers = node.getConnectedRelayPeerIds();
    if (relayPeers.length > 0) {
      return;
    }
    await sleep(500);
  }

  throw new Error("Timed out waiting for relay connection");
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean up a test node and its profile directory
 */
export async function cleanupTestNode(node: TestNode): Promise<void> {
  try {
    await node.stop();
  } catch (e) {
    console.warn("Error stopping node:", e);
  }

  // Clean up profile directory
  try {
    const profileDir = (node as unknown as { _profileDir: string })._profileDir;
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create multiple test nodes connected to the same relay
 */
export async function createTestNodesOnRelay(
  relayAddr: string,
  count: number,
  options: Partial<TestNodeOptions> = {}
): Promise<TestNode[]> {
  const nodes: TestNode[] = [];

  try {
    for (let i = 0; i < count; i++) {
      const node = await createTestNode({
        ...options,
        bootstrapPeers: [relayAddr],
      });
      nodes.push(node);
    }

    // Wait for all to connect
    await Promise.all(
      nodes.map((node, i) =>
        waitForPeerConnected(node, relayAddr, 10000).catch((e) => {
          console.error(`Node ${i} failed to connect to relay:`, e.message);
        })
      )
    );

    return nodes;
  } catch (e) {
    // Cleanup on error
    await Promise.all(nodes.map((n) => cleanupTestNode(n)));
    throw e;
  }
}

/**
 * Get relay server address from environment or default
 */
export function getRelayAddress(): string {
  // Check environment variable
  const envRelay = process.env.TEST_RELAY_ADDR;
  if (envRelay) {
    return envRelay;
  }

  // Check command line argument (--relay-addr=xxx)
  const args = process.argv;
  for (const arg of args) {
    if (arg.startsWith("--relay-addr=")) {
      return arg.replace("--relay-addr=", "");
    }
  }

  // Default for local testing - replace with your actual relay peer ID
  return "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWJNFm9sPAcC1xKjJEqe7N3KKH7tM8hT4Z3s8X9vR2qLmK";
}

/**
 * Get bootstrap presets from environment or default
 */
export function getBootstrapPresets(): string[] {
  const envPresets = process.env.TEST_BOOTSTRAP_PRESETS;
  if (envPresets) {
    return envPresets.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Check command line argument (--presets=public-libp2p,public-libp2p-am6)
  const args = process.argv;
  for (const arg of args) {
    if (arg.startsWith("--presets=")) {
      return arg.replace("--presets=", "").split(",").map((s) => s.trim());
    }
  }

  return ["public-libp2p"];
}

/**
 * Parse command line arguments for test configuration
 */
export interface TestConfig {
  relayAddr: string;
  bootstrapPresets: string[];
  verbose: boolean;
}

export function parseTestConfig(): TestConfig {
  const config: TestConfig = {
    relayAddr: getRelayAddress(),
    bootstrapPresets: getBootstrapPresets(),
    verbose: false,
  };

  const args = process.argv;
  for (const arg of args) {
    if (arg === "--verbose" || arg === "-v") {
      config.verbose = true;
    }
  }

  return config;
}
