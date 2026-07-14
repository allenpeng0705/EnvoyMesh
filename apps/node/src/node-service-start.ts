/**
 * startNode runtime (Step 20d).
 *
 * Extracted from `node-service-impl.ts` (Node Lifecycle section).
 * Owns the public `startNode` method that wires up stores,
 * creates + boots the mesh, and emits lifecycle events.
 *
 * The runtime takes a `StartNodeContext` with ~30 accessors for the
 * class state it reads or mutates. The class method collapses to a
 * 3-line delegation.
 */
import { join } from "node:path";
import {
  loadOrCreateNodeProfile,
  createLocalTaskStore,
  createRelayStateStore,
  createTaskRuntimeStateStore,
} from "@envoymesh/local-store";
import { createDiscoverySeedStore } from "./discovery-seed-store.js";
import { createInboundMessageGuard } from "./inbound-guard.js";
import { createTaskDispatcher } from "./task-dispatcher.js";
import { resolveConnectivityRuntime, type ResolvedConnectivityRuntime } from "./connectivity-runtime.js";
import { resolveBootstrapAddresses } from "./bootstrap-resolver.js";
import { EnvoyMesh, filterBootstrapMultiaddrs, type EnvoyMeshOptions } from "@envoymesh/network";
import { seedAddrsForDiscoveryProfile } from "./peer-discovery-telemetry.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { runRelayClientCycle, startRelayClientScheduler, type RelayClientCycleDeps } from "./relay-client-cycle.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS } from "@envoymesh/api";
import type { NodeProfile, NodeStatus, DiscoveryProfile } from "@envoymesh/api";
import type { AgentSetupContext } from "./node-service-agent-setup.js";
import type { CapabilityDiscoveryContext } from "./node-service-capability-discovery.js";
import type { RecordNodeErrorAccess } from "./node-service-connection-status.js";

export interface StartNodeContext {
  /** Current node lifecycle status string. */
  getNodeStatus(): NodeStatus;
  /** Replace the node lifecycle status string. */
  setNodeStatus(status: NodeStatus): void;
  /** Emit a lifecycle event. */
  emit(event: string, payload: unknown): void;

  // Stores (read/write via the class's private fields).
  getProfile(): NodeProfile | undefined;
  setProfile(profile: NodeProfile | undefined): void;
  getTaskStore(): ReturnType<typeof createLocalTaskStore> | undefined;
  setTaskStore(store: ReturnType<typeof createLocalTaskStore> | undefined): void;
  getRelayStateStore(): ReturnType<typeof createRelayStateStore> | undefined;
  setRelayStateStore(store: ReturnType<typeof createRelayStateStore> | undefined): void;
  getDiscoverySeedStore(): ReturnType<typeof createDiscoverySeedStore> | undefined;
  setDiscoverySeedStore(store: ReturnType<typeof createDiscoverySeedStore> | undefined): void;
  getTaskRuntimeStore(): ReturnType<typeof createTaskRuntimeStateStore> | undefined;
  setTaskRuntimeStore(store: ReturnType<typeof createTaskRuntimeStateStore> | undefined): void;
  getInboundGuard(): ReturnType<typeof createInboundMessageGuard> | undefined;
  setInboundGuard(guard: ReturnType<typeof createInboundMessageGuard> | undefined): void;
  getTaskDispatcher(): ReturnType<typeof createTaskDispatcher> | undefined;
  setTaskDispatcher(d: ReturnType<typeof createTaskDispatcher> | undefined): void;

  /** Load persisted config. */
  loadConfig(): Promise<{
    profileDir: string;
    discoveryProfile: DiscoveryProfile;
    enableMdns?: boolean;
    maxConnections?: number;
    mdnsIntervalMs?: number;
    capabilityDiscoveryIntervalMs?: number;
    lazyCapabilityDiscovery?: boolean;
    idleTimerStretch?: boolean;
    advertiseAddrs?: string[];
    bootstrapPeers?: string[];
    bootstrapPresets?: string[];
    relayEnabled?: boolean;
    relayServerEnabled?: boolean;
  } | undefined>;

  /** Set bootstrap peer IDs so the reachability layer can filter them from discovery UI. */
  setBootstrapPeerIds(ids: Set<string>): void;

  // Mesh + lifecycle wiring
  getMesh(): unknown | undefined;
  setMesh(mesh: unknown): void;
  wireMeshEvents(): void;
  setRelayBootstrapPeers(addrs: string[]): void;
  setStopRelayClientScheduler(fn: (() => void) | undefined): void;
  setStopNodeStatsLogging(fn: (() => void) | undefined): void;
  setCapabilityDiscoveryTimer(timer: NodeJS.Timeout | undefined): void;
  setAdvertiseInterestsStartupTimeout(timer: NodeJS.Timeout | undefined): void;
  setLastNodeError(value: string | undefined): void;
  setLastNodeErrorAt(value: string | undefined): void;
  setNodeProcessStartedAtMs(ms: number): void;
  startBondWarmInterval(): void;
  resyncBondedContactReachabilityTags(): Promise<void>;
  refreshCapabilityIndex(): Promise<void>;
  scheduleDeferredProfileRefresh(reason: string): void;
  advertiseInterestsIfPublic(): Promise<void>;
  loadHumanProfile(): Promise<import("@envoymesh/api").HumanProfile | undefined>;
  loadPublishedLibraryFromDisk(): Promise<void>;
  loadIntentHistoryFromDisk(): Promise<void>;
  recordNodeError(context: string, err: unknown): void;
  /** The two existing runtimes, for direct call. */
  ensureAgentStores(): Promise<boolean>;
  runCapabilityDiscoveryCycle(source: "startup", opts: { connectivityRuntime: ResolvedConnectivityRuntime }): Promise<void>;
  startCapabilityDiscoveryScheduler(connectivityRuntime: ResolvedConnectivityRuntime): void;
  /**
   * Persist the relay-client cycle deps so the discovery runtime can issue
   * `relay.lookup` queries (cross-NAT topic fallback) without reconstructing
   * the scheduler.
   */
  setRelayClientCycleDeps(deps: RelayClientCycleDeps): void;
}

export async function startNodeViaRuntime(ctx: StartNodeContext): Promise<void> {
  if (ctx.getNodeStatus() === "running") {
    await ctx.ensureAgentStores();
    return;
  }

  if (ctx.getNodeStatus() === "starting") {
    throw new Error("Node is already starting");
  }

  try {
    const config = await ctx.loadConfig();
    if (!config) {
      throw new Error("No node config found. Call initNode() first.");
    }

    // Load stores before emitting "starting" so Assistant RPC cannot race
    // an empty task store.
    ctx.setProfile(await loadOrCreateNodeProfile(config.profileDir));
    ctx.setTaskStore(createLocalTaskStore(config.profileDir));
    ctx.setRelayStateStore(createRelayStateStore(config.profileDir));
    ctx.setDiscoverySeedStore(
      ctx.getDiscoverySeedStore() ?? createDiscoverySeedStore(config.profileDir),
    );
    ctx.setTaskRuntimeStore(createTaskRuntimeStateStore(config.profileDir));
    ctx.setInboundGuard(createInboundMessageGuard());
    ctx.setTaskDispatcher(createTaskDispatcher());

    await ctx.loadPublishedLibraryFromDisk();
    await ctx.loadIntentHistoryFromDisk();

    ctx.setNodeStatus("starting");
    ctx.emit("node:status", { status: ctx.getNodeStatus() });

    // Compute effective bootstrap peers.
    const peerRecords = await ctx.getDiscoverySeedStore();
    const peerDirAddrCount = 0; // peerRecords is the discovery seed list; peer directory is separate
    const seedAddrs = seedAddrsForDiscoveryProfile(
      config.discoveryProfile,
      await ctx.getDiscoverySeedStore()!.listSeedRecords(),
    );
    void peerRecords;
    void peerDirAddrCount;

    const resolvedPresetAddrs: string[] = [];
    console.log(
      `[node-service] config.bootstrapPresets: ${JSON.stringify(config.bootstrapPresets)}`,
    );
    if (config.bootstrapPresets && config.bootstrapPresets.length > 0) {
      console.log(
        `[node-service] Resolving ${config.bootstrapPresets.length} bootstrap presets: ${config.bootstrapPresets.join(", ")}`,
      );
      const resolvedResults = await resolveBootstrapAddresses(config.bootstrapPresets);
      for (const result of resolvedResults) {
        resolvedPresetAddrs.push(...result.resolved);
        if (result.resolved.length === 0) {
          console.warn(
            `[node-service] WARNING: Preset ${result.original} resolved to 0 addresses (using as-is)`,
          );
        }
        console.log(
          `[node-service] Preset ${result.original} → ${result.resolved.length} addresses: ${result.resolved.join(", ")}`,
        );
      }
    }

    const rawBootstrapAddrs = [
      ...(config.bootstrapPeers ?? []),
      ...resolvedPresetAddrs,
      ...seedAddrs,
    ].filter(
      (addr): addr is string =>
        typeof addr === "string" && addr.trim().length > 0 && addr.startsWith("/"),
    );
    console.log(
      `[node-service] rawBootstrapAddrs (${rawBootstrapAddrs.length}): ${rawBootstrapAddrs.join(", ")}`,
    );
    console.log(
      `[node-service] config.bootstrapPeers: ${config.bootstrapPeers?.join(", ") ?? "undefined/empty"}`,
    );
    console.log(
      `[node-service] resolvedPresetAddrs: ${resolvedPresetAddrs.join(", ")}`,
    );
    const bootstrapPeers = filterBootstrapMultiaddrs([...new Set(rawBootstrapAddrs)]);
    console.log(
      `[node-service] bootstrapPeers after filterBootstrapMultiaddrs: ${bootstrapPeers.length} - ${bootstrapPeers.join(", ")}`,
    );

    // Extract bootstrap peer IDs and wire them into the reachability layer
    // so they are filtered from the discovery UI.
    const bootstrapPeerIdSet = new Set<string>();
    for (const addr of bootstrapPeers) {
      const p2pIdx = addr.lastIndexOf("/p2p/");
      if (p2pIdx >= 0) {
        bootstrapPeerIdSet.add(addr.substring(p2pIdx + 5));
      }
    }
    if (bootstrapPeerIdSet.size > 0) {
      ctx.setBootstrapPeerIds(bootstrapPeerIdSet);
    }

    console.log(`[node-service] Bootstrap peers resolved: ${bootstrapPeers.length} addresses`);
    for (const bp of bootstrapPeers) {
      console.log(`  - ${bp}`);
    }

    // Resolve connectivity runtime for DHT / mdns / intervals.
    const connectivityRuntime = resolveConnectivityRuntime({
      profile: config.discoveryProfile,
      enableMdns: config.enableMdns ?? true,
      tuning: {
        maxConnections: config.maxConnections,
        mdnsIntervalMs: config.mdnsIntervalMs,
        capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
        lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
        idleTimerStretch: config.idleTimerStretch,
      },
    });
    console.log(
      `[node-service] Creating EnvoyMesh with enableDht=${connectivityRuntime.enableDht}`,
    );

    const meshOptions: EnvoyMeshOptions = {
      listen: ["/ip4/0.0.0.0/tcp/0"],
      advertiseAddrs: config.advertiseAddrs ?? [],
      enableMdns: connectivityRuntime.enableMdns,
      mdnsIntervalMs: connectivityRuntime.mdnsIntervalMs,
      enableDht: connectivityRuntime.enableDht,
      dhtClientMode: true,
      bootstrapPeers,
      enableRelay: config.relayEnabled ?? true,
      enableRelayServer: config.relayServerEnabled ?? false,
      enableAutoNat: true,
      enableDcutr: true,
      ...(connectivityRuntime.maxConnections != null
        ? { maxConnections: connectivityRuntime.maxConnections }
        : {}),
      libp2pPrivateKey: await loadOrCreateLibp2pPrivateKey(
        join(config.profileDir, "libp2p-private.key"),
      ),
    };

    const mesh = new EnvoyMesh(meshOptions);
    ctx.setMesh(mesh);

    // Wire mesh events
    ctx.wireMeshEvents();

    // Start mesh
    await mesh.start();
    ctx.setLastNodeError(undefined);
    ctx.setLastNodeErrorAt(undefined);

    void ctx.resyncBondedContactReachabilityTags();

    ctx.setRelayBootstrapPeers(bootstrapPeers);
    const inboundGuard = ctx.getInboundGuard();
    const discoverySeedStore = ctx.getDiscoverySeedStore();
    if ((config.relayEnabled ?? true) && inboundGuard && discoverySeedStore) {
      ctx.setStopRelayClientScheduler(undefined);
      const humanProfile = await ctx.loadHumanProfile();
      const relayDeps: RelayClientCycleDeps = {
        mesh: mesh as never,
        profile: ctx.getProfile()!,
        displayName: humanProfile?.displayName,
        bootstrapPeers,
        inboundGuard,
        discoverySeedStore,
      };
      ctx.setRelayClientCycleDeps(relayDeps);
      await runRelayClientCycle(relayDeps as never);
      const stopFn = startRelayClientScheduler({
        ...relayDeps,
        intervalMs: DEFAULT_RELAY_CLIENT_CYCLE_INTERVAL_MS,
      } as never);
      ctx.setStopRelayClientScheduler(() => stopFn);
    }

    if (ctx.getTaskStore() && discoverySeedStore) {
      void ctx.runCapabilityDiscoveryCycle("startup", { connectivityRuntime });
      ctx.startCapabilityDiscoveryScheduler(connectivityRuntime);
    }

    ctx.setNodeProcessStartedAtMs(Date.now());
    ctx.setStopNodeStatsLogging(undefined);
    const stopStats = startNodeStatsInterval(mesh as never, {
      processStartedAtMs: Date.now(),
    });
    ctx.setStopNodeStatsLogging(() => stopStats);

    ctx.setNodeStatus("running");
    ctx.emit("node:status", {
      status: ctx.getNodeStatus(),
      peerId: mesh.peerId,
    });
    ctx.emit("node:online", {
      peerId: mesh.peerId,
      multiaddrs: mesh.multiaddrs.map((a: { toString(): string }) => a.toString()),
    });
    ctx.scheduleDeferredProfileRefresh("node:online");
    void ctx.refreshCapabilityIndex().catch((err) => {
      console.warn("[chain] refreshCapabilityIndex after node:online failed:", err);
    });
    ctx.startBondWarmInterval();

    // Wait for DHT to populate the routing table before advertising.
    const timeout = setTimeout(() => {
      void ctx.advertiseInterestsIfPublic();
    }, 15000);
    ctx.setAdvertiseInterestsStartupTimeout(timeout);
  } catch (error) {
    console.error("[node-service] startNode failed:", error);
    ctx.recordNodeError("startNode", error);
    // (advertiseInterestsStartupTimeout cleanup isn't easy here without
    // a getter; the class handles it in stopNode.)
    ctx.setNodeStatus("offline");
    ctx.emit("node:status", { status: ctx.getNodeStatus() });
    throw error;
  }
}

/* ---------- helper: build a single combined context ---------- */

export interface StartNodeDeps {
  agentSetup: AgentSetupContext;
  capabilityDiscovery: CapabilityDiscoveryContext;
  recordNodeError: RecordNodeErrorAccess;
  startNode: StartNodeContext;
}