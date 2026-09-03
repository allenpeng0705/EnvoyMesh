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
import { configureBondWarmFromConnectivity } from "./node-service-reachability.js";
import { resolveBootstrapAddresses } from "./bootstrap-resolver.js";
import { EnvoyMesh, filterBootstrapMultiaddrs, capBootstrapPeersForCircuitHoppability, isPrivateLanTcpDialHint, type EnvoyMeshOptions } from "@envoymesh/network";
import { seedAddrsForDiscoveryProfile } from "./peer-discovery-telemetry.js";
import { loadOrCreateLibp2pPrivateKey } from "./libp2p-key-loader.js";
import { runRelayClientCycle, startRelayClientScheduler, type RelayClientCycleDeps } from "./relay-client-cycle.js";
import { startNodeStatsInterval } from "./node-stats-log.js";
import { warmAndWatchRelayReservations, collectRelayControlTargets } from "./relay-reservation-health.js";
import {
  normalizeBootstrapPresetsForContactsOnly,
  type NodeProfile,
  type NodeStatus,
  type DiscoveryProfile,
} from "@envoymesh/api";
import type { AgentSetupContext } from "./node-service-agent-setup.js";
import type { CapabilityDiscoveryContext } from "./node-service-capability-discovery.js";
import type { RecordNodeErrorAccess } from "./node-service-connection-status.js";

/** True when first-launch auto-bond still needs a lean dial queue. */
export function shouldLeanBootstrapForPendingSponsorBond(config: {
  setupSponsorFriendEnabled?: boolean;
  setupSponsorFriendCompletedAt?: string;
}): boolean {
  return Boolean(config.setupSponsorFriendEnabled) && !config.setupSponsorFriendCompletedAt;
}

/**
 * True when the connectivity mode disables the public DHT (`quietWan` /
 * `aggressive`). In that mode the public-libp2p bootstrap presets are pure
 * churn — the DHT service is off, so bootstrapping into the IPFS swarm just
 * fills the connection pool with anonymous peers that can never be used for
 * routing. Narrow bootstrap to EnvoyMesh relays only (the `contacts-only`
 * preset set, which keeps `cn-relay` and any operator relays).
 *
 * See `docs/connectivity-internals-and-design.md` Solution A1.1.
 */
export function shouldLeanBootstrapForDhtOffMode(connectivityMode: string | undefined): boolean {
  return connectivityMode === "quietWan" || connectivityMode === "aggressive";
}

/**
 * Run CGNAT detection at startup and, when the node is *definitively* behind
 * carrier-grade NAT, override connectivityMode → quietWan. Only fires when
 * {@link shouldAllowCgnatQuietWanAutoApply} permits it. See cgnat-detection.ts.
 */
async function maybeAutoApplyQuietWanForCgnat(
  config: {
    profileDir: string;
    connectivityMode?: string;
    connectivityModeExplicit?: boolean;
    enableUpnp?: boolean;
  },
): Promise<{
  applied: boolean;
  revertedVpn?: boolean;
  detectedMode?: "quietWan";
  classification?: string;
  effectiveConnectivityMode?: string;
}> {
  const {
    detectCgnatAtStartup,
    persistCgnatAutoAppliedQuietWan,
    maybeRevertCgnatQuietWanForVpn,
    shouldAllowCgnatQuietWanAutoApply,
  } = await import("./cgnat-detection.js");

  // Undo false-positive quietWan when Tailscale / commercial VPN is up —
  // otherwise a prior auto-apply sticks forever and Online-direct dies.
  let mode = config.connectivityMode;
  let explicit = config.connectivityModeExplicit;
  let revertedVpn = false;
  try {
    revertedVpn = await maybeRevertCgnatQuietWanForVpn(config.profileDir);
    if (revertedVpn) {
      mode = "optimized";
      explicit = false;
      console.log(
        "[node-service] CGNAT quietWan reverted — overlay/VPN interface detected; restoring optimized for Online-direct",
      );
    }
  } catch (err) {
    console.warn(
      "[node-service] failed to revert CGNAT quietWan for VPN:",
      err instanceof Error ? err.message : err,
    );
  }

  // Skip network probes when already DHT-off or operator-locked.
  if (mode === "quietWan" || mode === "aggressive" || explicit === true) {
    return { applied: false, revertedVpn, effectiveConnectivityMode: mode };
  }
  // Just undid a cgnat-quietWan for VPN — do not re-probe and re-apply in the
  // same boot (STUN can still see ISP 100.64 under split-tunnel / commercial VPN).
  if (revertedVpn) {
    return { applied: false, revertedVpn: true, effectiveConnectivityMode: mode };
  }
  if (!shouldAllowCgnatQuietWanAutoApply({ connectivityMode: mode, connectivityModeExplicit: explicit })) {
    return { applied: false, revertedVpn, effectiveConnectivityMode: mode };
  }
  const result = await detectCgnatAtStartup({
    upnpEnabled: config.enableUpnp ?? true,
    connectivityMode: mode,
    connectivityModeExplicit: explicit,
  });
  console.log(
    `[node-service] CGNAT detection: classification=${result.classification} natType=${result.natType}` +
      (result.stunObservedIp ? ` stunIp=${result.stunObservedIp}` : "") +
      (result.upnpExternalIp ? ` upnpIp=${result.upnpExternalIp}` : "") +
      (result.likelyVpnActive ? " vpn=yes" : "") +
      (result.shouldAutoApplyQuietWan ? " → auto-applying quietWan" : ""),
  );
  if (result.shouldAutoApplyQuietWan) {
    try {
      await persistCgnatAutoAppliedQuietWan(config.profileDir);
    } catch (err) {
      console.warn(
        "[node-service] failed to persist CGNAT auto-applied quietWan:",
        err instanceof Error ? err.message : err,
      );
    }
    return {
      applied: true,
      revertedVpn,
      detectedMode: "quietWan",
      classification: result.classification,
      effectiveConnectivityMode: "quietWan",
    };
  }
  return {
    applied: false,
    revertedVpn,
    classification: result.classification,
    effectiveConnectivityMode: mode,
  };
}

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
    connectivityMode?: import("@envoymesh/api").ConnectivityMode;
    connectivityModeExplicit?: boolean;
    connectivityModeAutoAppliedReason?: "cgnat";
    maxConnections?: number;
    mdnsIntervalMs?: number;
    capabilityDiscoveryIntervalMs?: number;
    lazyCapabilityDiscovery?: boolean;
    idleTimerStretch?: boolean;
    advertiseAddrs?: string[];
    bootstrapPeers?: string[];
    bootstrapPresets?: string[];
    configuredRelays?: { enabled?: boolean; addr?: string }[];
    relayEnabled?: boolean;
    relayServerEnabled?: boolean;
    relayReservationEnabled?: boolean;
    setupSponsorFriendEnabled?: boolean;
    setupSponsorFriendCompletedAt?: string;
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
  /** Track the startup agent-card refresh timer so it can be cleared on stop. */
  setAgentCardRefreshStartupTimeout(timer: NodeJS.Timeout | undefined): void;
  setLastNodeError(value: string | undefined): void;
  setLastNodeErrorAt(value: string | undefined): void;
  setNodeProcessStartedAtMs(ms: number): void;
  startBondWarmInterval(): void;
  resyncBondedContactReachabilityTags(): Promise<void>;
  refreshAgentNetworkMembershipIndex(): Promise<void>;
  /** Re-fetch agent cards from all bonded peers. Called on startup so peer
   *  worker profiles (capabilityProvider flag, agentNetworkProfile) are fresh
   *  after a restart — without this, the Team jobs view shows stale cached
   *  cards that may not reflect the peer's current opt-in state. */
  refreshAgentNetworkWorkers(): Promise<{ requested: number; failed: number }>;
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

    // CGNAT auto-detection FIRST — before bootstrap resolution — so quietWan
    // also narrows public-libp2p presets (lean bootstrap). See design A1.1.
    const leanForSponsor = shouldLeanBootstrapForPendingSponsorBond(config);
    let effectiveConnectivityMode = config.connectivityMode;
    let vpnQuietWanReverted = false;
    if (!leanForSponsor) {
      const cgnat = await maybeAutoApplyQuietWanForCgnat({
        profileDir: config.profileDir,
        connectivityMode: config.connectivityMode,
        connectivityModeExplicit: config.connectivityModeExplicit,
        enableUpnp: (config as { enableUpnp?: boolean }).enableUpnp,
      });
      if (cgnat.applied && cgnat.detectedMode) {
        effectiveConnectivityMode = cgnat.detectedMode;
      } else if (cgnat.revertedVpn) {
        effectiveConnectivityMode = "optimized";
        vpnQuietWanReverted = true;
      } else if (cgnat.effectiveConnectivityMode) {
        effectiveConnectivityMode = cgnat.effectiveConnectivityMode as typeof effectiveConnectivityMode;
      }
    }

    // Compute effective bootstrap peers.
    const peerRecords = await ctx.getDiscoverySeedStore();
    const peerDirAddrCount = 0; // peerRecords is the discovery seed list; peer directory is separate
    // quietWan / aggressive disable the public DHT entirely, so the
    // public-libp2p bootstrap presets are pure churn — narrow to relays.
    // Use effectiveConnectivityMode (may have been CGNAT-auto-applied above).
    const leanForDhtOffMode = shouldLeanBootstrapForDhtOffMode(effectiveConnectivityMode);
    const leanBootstrap = leanForSponsor || leanForDhtOffMode;
    // Pending first-launch auto-bond OR DHT-off mode: ignore DHT/seed swarm
    // addrs so the dial queue is not flooded with peers that can never be
    // used for routing.
    const seedAddrs = leanBootstrap
      ? []
      : seedAddrsForDiscoveryProfile(
          config.discoveryProfile,
          await ctx.getDiscoverySeedStore()!.listSeedRecords(),
        );
    void peerRecords;
    void peerDirAddrCount;

    const resolvedPresetAddrs: string[] = [];
    const effectivePresets = leanBootstrap
      ? normalizeBootstrapPresetsForContactsOnly(config.bootstrapPresets ?? [])
      : (config.bootstrapPresets ?? []);
    if (leanBootstrap) {
      const reason = leanForDhtOffMode
        ? `connectivityMode=${effectiveConnectivityMode} (DHT off — strip public-libp2p swarm)`
        : "pending setupSponsorFriend (strip public-libp2p swarm)";
      console.log(
        `[node-service] lean bootstrap — ${reason} presets=${JSON.stringify(effectivePresets)}`,
      );
    }
    console.log(
      `[node-service] config.bootstrapPresets: ${JSON.stringify(config.bootstrapPresets)}`,
    );
    if (effectivePresets.length > 0) {
      console.log(
        `[node-service] Resolving ${effectivePresets.length} bootstrap presets: ${effectivePresets.join(", ")}`,
      );
      const resolvedResults = await resolveBootstrapAddresses(effectivePresets);
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
    const leanFilteredAddrs = leanForSponsor
      ? rawBootstrapAddrs.filter((a) => !isPrivateLanTcpDialHint(a) && !a.includes("/p2p-circuit/"))
      : rawBootstrapAddrs;
    console.log(
      `[node-service] rawBootstrapAddrs (${leanFilteredAddrs.length}${leanForSponsor ? ", lean-filtered" : ""}): ${leanFilteredAddrs.join(", ")}`,
    );
    console.log(
      `[node-service] config.bootstrapPeers: ${config.bootstrapPeers?.join(", ") ?? "undefined/empty"}`,
    );
    console.log(
      `[node-service] resolvedPresetAddrs: ${resolvedPresetAddrs.join(", ")}`,
    );
    const bootstrapPeers = capBootstrapPeersForCircuitHoppability(
      filterBootstrapMultiaddrs([...new Set(leanFilteredAddrs)]),
    );
    console.log(
      `[node-service] bootstrapPeers after hoppability cap: ${bootstrapPeers.length} - ${bootstrapPeers.join(", ")}`,
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
    // Lean mode uses relay-only so DHT peer churn cannot starve circuit CONNECT.
    // When CGNAT just auto-applied quietWan, ignore stale per-field overrides from
    // the previous optimized mode so maxConnections/timers match the quietWan preset.
    // Same for VPN revert: disk was rewritten to optimized, but in-memory config
    // still holds quietWan maxConnections — use mode-only tuning so the preset wins.
    const quietWanJustApplied =
      effectiveConnectivityMode === "quietWan" && config.connectivityMode !== "quietWan";
    const connectivityRuntime = resolveConnectivityRuntime({
      profile: leanForSponsor ? "relay-only" : config.discoveryProfile,
      enableMdns: config.enableMdns ?? true,
      tuning: quietWanJustApplied
        ? { connectivityMode: "quietWan" }
        : vpnQuietWanReverted
          ? { connectivityMode: "optimized" }
          : {
              connectivityMode: effectiveConnectivityMode,
              maxConnections: config.maxConnections,
              mdnsIntervalMs: config.mdnsIntervalMs,
              capabilityDiscoveryIntervalMs: config.capabilityDiscoveryIntervalMs,
              lazyCapabilityDiscovery: config.lazyCapabilityDiscovery,
              idleTimerStretch: config.idleTimerStretch,
            },
    });
    console.log(
      `[node-service] Creating EnvoyMesh mode=${connectivityRuntime.connectivityMode} enableDht=${connectivityRuntime.enableDht}`,
    );

    configureBondWarmFromConnectivity({
      intervalMs: connectivityRuntime.bondWarmIntervalMs,
      perContactCooldownMs: connectivityRuntime.bondWarmPerContactCooldownMs,
      eventDriven: connectivityRuntime.bondWarmEventDriven,
      maxConnections: connectivityRuntime.maxConnections,
    });

    const configuredRelayAddrs = collectRelayControlTargets({
      configuredRelays: config.configuredRelays,
      bootstrapPeers,
      bootstrapPresets: config.bootstrapPresets,
    });

    const meshOptions: EnvoyMeshOptions = {
      listen: ["/ip4/0.0.0.0/tcp/0"],
      advertiseAddrs: config.advertiseAddrs ?? [],
      enableMdns: connectivityRuntime.enableMdns,
      mdnsIntervalMs: connectivityRuntime.mdnsIntervalMs,
      connectionMonitorPingIntervalMs: connectivityRuntime.connectionMonitorPingIntervalMs,
      enableDht: connectivityRuntime.enableDht,
      dhtClientMode: true,
      bootstrapPeers,
      enableRelay: config.relayEnabled ?? true,
      enableRelayServer: config.relayServerEnabled ?? false,
      configuredRelayAddrs,
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

    // Circuit-relay reservation warmup (parity with CLI activateCliMesh).
    // Without this, NodeService/Tauri hubs never call requestRelayReservation
    // and stay unreachable inbound via /p2p-circuit/.
    if (config.relayEnabled ?? true) {
      try {
        await warmAndWatchRelayReservations(mesh, {
          configuredRelays: config.configuredRelays,
          bootstrapPeers,
          bootstrapPresets: config.bootstrapPresets,
          relayEnabled: config.relayEnabled ?? true,
          relayReservationEnabled: config.relayReservationEnabled ?? true,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`[p2p] relay reservation warmup (node-service) threw (non-fatal): ${message}`);
      }
    }

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
        configuredRelays: config.configuredRelays,
        bootstrapPresets: config.bootstrapPresets,
        inboundGuard,
        discoverySeedStore,
      };
      ctx.setRelayClientCycleDeps(relayDeps);
      await runRelayClientCycle(relayDeps as never);
      const stopFn = startRelayClientScheduler({
        ...relayDeps,
        intervalMs: connectivityRuntime.relayCycleBaseMs,
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
      maxConnections: connectivityRuntime.maxConnections,
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
    void ctx.refreshAgentNetworkMembershipIndex().catch((err) => {
      console.warn("[chain] refreshAgentNetworkMembershipIndex after node:online failed:", err);
    });
    // Re-fetch agent cards from bonded peers after going online so the
    // Team jobs view reflects each peer's current capabilityProvider /
    // agentNetworkProfile state. Retry with backoff because relay circuit
    // connections can take minutes to establish — a single 5s attempt fails
    // for any peer that isn't immediately reachable, leaving Team jobs empty
    // until a manual refresh. The schedule covers the first ~6 minutes after
    // startup, which is enough for even slow relay circuit reservations.
    const agentCardRetryDelays = [5_000, 30_000, 60_000, 120_000, 180_000];
    let agentCardRetryIndex = 0;
    const scheduleAgentCardRefresh = (): void => {
      if (agentCardRetryIndex >= agentCardRetryDelays.length) return;
      const delay = agentCardRetryDelays[agentCardRetryIndex++];
      const timer = setTimeout(() => {
        void ctx
          .refreshAgentNetworkWorkers()
          .then(({ failed }) => {
            if (failed > 0) {
              scheduleAgentCardRefresh();
            }
          })
          .catch((err) => {
            console.warn("[chain] refreshAgentNetworkWorkers after node:online failed:", err);
            scheduleAgentCardRefresh();
          });
      }, delay);
      ctx.setAgentCardRefreshStartupTimeout(timer);
    };
    scheduleAgentCardRefresh();
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