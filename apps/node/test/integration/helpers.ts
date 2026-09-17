import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { EnvoyMesh } from "@envoymesh/network";
import { type Multiaddr } from "@multiformats/multiaddr";
import { resolveBootstrapPresetPeers } from "../../src/args.js";

export interface TestNodeOptions {
  /** Listen address for the node */
  listen?: string[];
  /** Bootstrap peer multiaddrs */
  bootstrapPeers?: string[];
  /**
   * Relay bases to reserve a circuit slot on (e.g. the EnvoyMesh community
   * relays). Without this, `enableRelay` only listens on a bare
   * `/p2p-circuit`, which hands reservation to AutoRelay — AutoRelay does not
   * reserve on the community relay, so the node stays unreserved and
   * unreachable inbound. See `buildConfiguredRelayCircuitListenAddrs` in
   * `packages/network/src/index.ts`.
   */
  configuredRelayAddrs?: string[];
  /**
   * Bootstrap preset ids (e.g. `["public-libp2p"]`). `EnvoyMeshOptions` has no
   * preset option — presets are a node-product concept — so
   * {@link createTestNode} expands them with the product's own
   * {@link resolveBootstrapPresetPeers} (`apps/node/src/args.ts`) before
   * constructing the mesh, exactly as the CLI does. Resolved peers are merged
   * into {@link TestNodeOptions.bootstrapPeers} and exposed on
   * {@link TestNode.bootstrapPeers}. Unknown ids throw (as they do in the CLI).
   */
  bootstrapPresets?: string[];
  /**
   * Custom preset table (the in-memory form of `--bootstrap-presets-file`).
   * Lets a test point a preset at a controlled peer without touching the
   * shipped public tables.
   */
  bootstrapPresetRegistry?: Map<string, string[]>;
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
  private _bootstrapPeers: string[];

  constructor(mesh: EnvoyMesh, profileDir: string, bootstrapPeers: string[] = []) {
    this.mesh = mesh;
    this._profileDir = profileDir;
    this._bootstrapPeers = [...bootstrapPeers];
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

  /**
   * Concrete bootstrap multiaddrs this node was constructed with — after
   * `bootstrapPresets` were expanded through the product path. Assert on this
   * to catch "the preset was accepted but never wired to EnvoyMesh".
   */
  get bootstrapPeers(): string[] {
    return [...this._bootstrapPeers];
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
   * Peer IDs of peers connected *via* the circuit relay (a `/p2p-circuit`
   * remote address), NOT the relay server itself: a node bootstrapped or
   * reserved directly on a relay has a plain transport connection to it.
   * Prefer {@link getConnectedPeerIds} unless you specifically need circuits.
   */
  getConnectedRelayPeerIds(): string[] {
    return this.mesh.getConnectedRelayPeerIds();
  }

  /** Peer IDs with any open connection (direct or `/p2p-circuit`). */
  getConnectedPeerIds(): string[] {
    return this.mesh.getConnectedPeerIds();
  }

  /** True when this client currently holds a usable circuit-relay reservation. */
  hasLiveRelayReservation(): boolean {
    return this.mesh.hasLiveRelayReservation();
  }

  /**
   * Check if connected to a specific peer by peer ID
   */
  isConnectedTo(peerIdB58: string): boolean {
    return this.getConnectedPeerIds().includes(peerIdB58);
  }

  /**
   * Check if connected to a relay with given multiaddr substring
   */
  isConnectedToRelay(relayAddr: string): boolean {
    const peerId = relayAddr.includes("/p2p/") ? relayAddr.split("/p2p/")[1] : relayAddr;
    return this.getConnectedPeerIds().some((p) => p === peerId || p.includes(peerId));
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
      connectedPeers: this.getConnectedPeerIds(),
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
    bootstrapPresetRegistry = new Map<string, string[]>(),
    configuredRelayAddrs = [],
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

  // Expand presets through the product's own table before handing anything to
  // EnvoyMesh. Passing the raw ids through (or dropping them) means the node
  // bootstraps nothing while the test still looks green.
  const resolvedBootstrapPeers = [
    ...new Set([
      ...bootstrapPeers,
      ...resolveBootstrapPresetPeers(bootstrapPresets, bootstrapPresetRegistry),
    ]),
  ];

  // Create the EnvoyMesh instance
  const mesh = new EnvoyMesh({
    listen,
    bootstrapPeers: resolvedBootstrapPeers,
    configuredRelayAddrs,
    enableRelayServer,
    enableRelay,
    enableDht,
    dhtClientMode,
    enableAutoNat,
    enableDcutr,
  });

  const node = new TestNode(mesh, profileDir, resolvedBootstrapPeers);
  await node.start();

  return node;
}

/**
 * Wait for an open connection to a specific peer (by peer ID or multiaddr).
 *
 * Polls *all* open connections ({@link TestNode.getConnectedPeerIds}) — a
 * `/p2p-circuit` filter would never match the relay server itself, only peers
 * reached through it, so `waitForPeerConnected(node, relayAddr)` would time
 * out even on a healthy, fully-reserved relay link.
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
    const peers = node.getConnectedPeerIds();
    if (peers.some((p) => p.includes(peerIdPart) || peerIdPart.includes(p))) {
      return;
    }
    await sleep(500);
  }

  const stats = node.getStats();
  throw new Error(
    `Timed out waiting for peer: ${peerIdOrAddr}. ` +
    `Connected peers: ${stats.connectedPeers.join(", ") || "none"}. ` +
    `Circuit peers: ${stats.relayConnections.join(", ") || "none"}`
  );
}

/**
 * Wait for an open connection to any bootstrap peer.
 */
export async function waitForBootstrapConnection(
  node: TestNode,
  timeout: number = 30000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (node.getConnectedPeerIds().length > 0) {
      return;
    }
    await sleep(1000);
  }

  throw new Error("Timed out waiting for bootstrap connection");
}

/**
 * Wait for a usable circuit-relay reservation (inbound reachability).
 *
 * A relay server connection alone is not enough: without a live reservation
 * the node cannot be dialled through the relay, so this is the right gate
 * before asserting WAN reachability. Mirrors
 * `discovery-relay-robustness-e2e.test.ts`.
 */
export async function waitForRelayConnection(
  node: TestNode,
  timeout: number = 60000
): Promise<void> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (node.hasLiveRelayReservation()) {
      return;
    }
    await sleep(500);
  }

  throw new Error("Timed out waiting for relay reservation");
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

  // Default: EnvoyMesh community relay
  return "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
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
