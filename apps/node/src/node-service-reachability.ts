/**
 * Bond reachability tagging, LAN discovery warm, and periodic bond warm.
 *
 * Extracted from `node-service-impl.ts`.
 */
import type { BondRecord, NodeProfile, NodeStatus, PeerConnectionInfo, WarmContactConnectionOptions } from "@envoymesh/api";
import type { LocalPeerDirectoryStore, LocalTrustStore } from "@envoymesh/local-store";
import { isPrivateLanTcpDialHint, type EnvoyMesh } from "@envoymesh/network";
import {
  peerDiscoverySourceFromMultiaddrs,
  shouldPersistPeerDiscoverySeeds,
} from "./peer-discovery-telemetry.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { mergeDialablePeerListenAddrs } from "./outbound-dial-hints.js";
import { isOutboundPeerRecentlyVerified } from "./outbound-peer-freshness.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { NEARBY_PROFILE_PROBE_COOLDOWN_MS } from "./node-service-identity.js";

export const BOND_WARM_MAX_CONNECTIONS = 64;
export const BOND_WARM_PER_CONTACT_COOLDOWN_MS = 300_000;
const BOND_WARM_INITIAL_DELAY_MS = 45_000;
const BOND_WARM_INTERVAL_MS = 300_000;

/**
 * After this many consecutive failed profile probes a peer is considered a
 * non-EnvoyMesh device (printer, TV, etc.) and suppressed from the discovery
 * UI for NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS.
 */
export const NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES = 3;
/**
 * How long (ms) to suppress a known non-EnvoyMesh peer before retrying the
 * probe once.  5 minutes keeps the "People on this network" list clean while
 * still allowing a retry if the peer later becomes an EnvoyMesh node.
 */
export const NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS = 300_000;

export interface ReachabilityContext {
  getNodeStatus(): NodeStatus | string;
  getReachableMesh(): EnvoyMesh | undefined;
  /** Internal mesh only (bond warm skips external-only stacks). */
  getInternalMesh(): EnvoyMesh | undefined;
  getProfile(): NodeProfile | undefined;
  peerDirectoryStore: LocalPeerDirectoryStore;
  trustStore: LocalTrustStore;
  getDiscoverySeedStore(): DiscoverySeedStore | undefined;
  loadConfig(): Promise<PersistedNodeConfig | undefined>;
  getBonds(): Promise<BondRecord[]>;
  resolveLibp2pPeerForBondOwner(
    ownerId: string,
  ): Promise<{ transportPeerId: string; listenAddrs?: string[] } | undefined>;
  resolvePeerTransportForOwner(
    ownerId: string,
  ): Promise<{ transportPeerId: string; listenAddrs?: string[] }>;
  warmContactConnection(
    ownerId: string,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo>;
  getPeerConnectionInfo(ownerId: string): Promise<PeerConnectionInfo>;
  probeNearbyPeerProfileAfterDiscovery(peerId: string, multiaddrs: string[]): Promise<void>;
  maybeFireLanAutoBond(peerId: string): Promise<void>;
  emit(event: string, payload: unknown): void;
  getBondWarmTimer(): ReturnType<typeof setInterval> | undefined;
  setBondWarmTimer(timer: ReturnType<typeof setInterval> | undefined): void;
  getLastBondWarmAt(): Map<string, number>;
  /** Set of bootstrap peer IDs that should be excluded from discovery UI. */
  getBootstrapPeerIds(): Set<string>;
  /** Timestamp of last nearby-profile probe per peerId (shared with identity module). */
  getNearbyProfileProbeLastAt(): Map<string, number>;
  /** Cooldown ms for nearby-profile probes (shared with identity module). */
  getNearbyProfileProbeCooldownMs(): number;
  /** True when the peer has failed ≥ N consecutive probes and is within suppression cooldown. */
  isNonEnvoyPeerSuppressed(peerId: string): boolean;
  /** Record a failed probe attempt (increments fail count). */
  markNonEnvoyPeerFailed(peerId: string): void;
  /** Reset fail count (called on successful probe). */
  resetNonEnvoyPeerFailCount(peerId: string): void;
  /** Retry undelivered feed.notify outbox (peer was offline at publish). */
  flushFeedNotifyOutbox(): Promise<void>;
}

export function buildReachabilityContext(host: any): ReachabilityContext {
  return {
    getNodeStatus: () => host._nodeStatus,
    getReachableMesh: () => host._reachableMesh(),
    getInternalMesh: () => host._mesh ?? undefined,
    getProfile: () => host._profile,
    peerDirectoryStore: host._peerDirectoryStore,
    trustStore: host._trustStore,
    getDiscoverySeedStore: () => host._discoverySeedStore,
    loadConfig: () => host._configStore.load(),
    getBonds: () => host.getBonds(),
    resolveLibp2pPeerForBondOwner: (ownerId) => host._resolveLibp2pPeerForBondOwner(ownerId),
    resolvePeerTransportForOwner: (ownerId) => host._resolvePeerTransportForOwner(ownerId),
    warmContactConnection: (ownerId, options) => host.warmContactConnection(ownerId, options),
    getPeerConnectionInfo: (ownerId) => host.getPeerConnectionInfo(ownerId),
    probeNearbyPeerProfileAfterDiscovery: (peerId, multiaddrs) =>
      host._probeNearbyPeerProfileAfterDiscovery(peerId, multiaddrs),
    maybeFireLanAutoBond: (peerId) => host._maybeFireLanAutoBond(peerId),
    emit: (event, payload) => host.emit(event, payload),
    getBondWarmTimer: () => host._bondWarmTimer,
    setBondWarmTimer: (timer) => {
      host._bondWarmTimer = timer;
    },
    getLastBondWarmAt: () => host._lastBondWarmAt,
    getBootstrapPeerIds: () => host._bootstrapPeerIdSet ?? new Set<string>(),
    getNearbyProfileProbeLastAt: () => host._nearbyProfileProbeLastAt,
    getNearbyProfileProbeCooldownMs: () => NEARBY_PROFILE_PROBE_COOLDOWN_MS,
    isNonEnvoyPeerSuppressed: (peerId) => host._isNonEnvoyPeerSuppressed(peerId),
    markNonEnvoyPeerFailed: (peerId) => host._markNonEnvoyPeerFailed(peerId),
    resetNonEnvoyPeerFailCount: (peerId) => host._resetNonEnvoyPeerFailCount(peerId),
    flushFeedNotifyOutbox: () => host._flushFeedNotifyOutbox(),
  };
}

export function getReachableMesh(ctx: Pick<ReachabilityContext, "getReachableMesh">): EnvoyMesh | undefined {
  return ctx.getReachableMesh();
}

export async function scrubBondedContactDialStateViaRuntime(ctx: ReachabilityContext): Promise<void> {
  const mesh = ctx.getReachableMesh();
  if (!mesh) return;
  try {
    await ctx.peerDirectoryStore.compactListenAddrs();
    await ctx.peerDirectoryStore.sanitizeListenAddrs();
    const bonds = await ctx.getBonds();
    for (const bond of bonds) {
      if (bond.level !== "direct" && bond.level !== "referred") continue;
      const resolved = await ctx.resolveLibp2pPeerForBondOwner(bond.peerOwnerId);
      if (!resolved?.transportPeerId) continue;
      const dialable = mergeDialablePeerListenAddrs(resolved.transportPeerId, resolved.listenAddrs);
      await mesh.scrubPeerStoreDialHints(resolved.transportPeerId, dialable);
    }
  } catch (err) {
    console.warn("[reachability] bonded dial scrub failed:", err);
  }
}

export async function handleMeshPeerDiscoveredViaRuntime(
  ctx: ReachabilityContext,
  peerId: string,
  multiaddrs: string[],
): Promise<void> {
  try {
    const config = await ctx.loadConfig();
    const discoveryProfile = config?.discoveryProfile ?? "wan-default";
    const source = peerDiscoverySourceFromMultiaddrs(multiaddrs);
    const discoverySeedStore = ctx.getDiscoverySeedStore();

    // Skip bootstrap/relay infrastructure peers — they are not EnvoyMesh
    // contacts. We still do seed-store + peer-directory + dial-hint work
    // (below), but we skip UI emission and probing.
    const bootstrapPeerIds = ctx.getBootstrapPeerIds();
    const isInfrastructure = bootstrapPeerIds.has(peerId) || source === "relay";
    if (
      shouldPersistPeerDiscoverySeeds(discoveryProfile, source) &&
      multiaddrs.length > 0 &&
      discoverySeedStore
    ) {
      await discoverySeedStore.upsertMany(multiaddrs, "peer.discovery");
    }
    if (multiaddrs.length > 0) {
      await ctx.peerDirectoryStore.mergeListenAddrsForPeerId(peerId, multiaddrs);
    }
    const mesh = ctx.getReachableMesh();
    if (mesh && multiaddrs.length > 0) {
      const dialable = mergeDialablePeerListenAddrs(peerId, multiaddrs);
      void mesh.mergePeerStoreDialHints(peerId, dialable);
    }
    const profile = ctx.getProfile();
    if (mesh && profile && peerId === mesh.peerId) {
      return;
    }
    if (isInfrastructure) {
      return;
    }
    // --- Discovery placeholder suppression ---
    // Skip placeholder emission for peers whose profile probe recently
    // ran (success or failure).  The nearby-profile probe cooldown already
    // prevents redundant probes; this guard also prevents the useless
    // placeholder flicker in the UI for non-EnvoyMesh LAN devices that
    // mDNS re-discovers every few seconds.
    const probeLastAt = ctx.getNearbyProfileProbeLastAt();
    const lastProbeAt = probeLastAt.get(peerId) ?? 0;
    const probeCooldownMs = ctx.getNearbyProfileProbeCooldownMs();
    if (Date.now() - lastProbeAt < probeCooldownMs) {
      return;
    }
    // Peers that have failed ≥ N consecutive probes are known non-EnvoyMesh
    // devices (printers, TVs, etc.).  Suppress them for a longer cooldown
    // so they don't cycle in "People on this network".
    if (ctx.isNonEnvoyPeerSuppressed(peerId)) {
      return;
    }
    // Emit an immediate placeholder so the peer appears in "People on this
    // network" right away.  The probe runs in the background — on success it
    // emits an updated peer:discovered with the real displayName; on failure
    // it emits peer:lost to remove the placeholder.
    // Only set discoverySource for values valid in PeerSearchResult.
    // "relay" is already blocked by isInfrastructure above; "unknown" has
    // no matching PeerSearchResult variant so we omit it.
    const emitSource = source === "mdns" || source === "bootstrap"
      ? source
      : undefined;
    ctx.emit("peer:discovered", {
      nodeId: peerId,
      ownerId: "",
      displayName: "",
      interests: [],
      profileVisibility: "public" as const,
      ...(emitSource ? { discoverySource: emitSource } : {}),
    });
    void ctx.probeNearbyPeerProfileAfterDiscovery(peerId, multiaddrs);
    // Auto-bond is fired inside probeNearbyPeerProfileAfterDiscovery on
    // probe success — the peer must be connected (probe dials first) and
    // confirmed as an EnvoyMesh node before we attempt pairing.
    void warmBondedContactAfterLanDiscoveryViaRuntime(ctx, peerId, multiaddrs);
  } catch (err) {
    console.warn(`[node-service] handleMeshPeerDiscovered failed for ${peerId.slice(0, 12)}…:`, err);
  }
}

export async function warmBondedContactAfterLanDiscoveryViaRuntime(
  ctx: ReachabilityContext,
  peerId: string,
  multiaddrs: string[],
): Promise<void> {
  if (ctx.getNodeStatus() !== "running" || multiaddrs.length === 0) return;
  if (!multiaddrs.some((a) => isPrivateLanTcpDialHint(a))) return;
  try {
    const record = await ctx.peerDirectoryStore.getPeerByPeerId(peerId);
    const ownerId = record?.ownerId?.trim();
    if (!ownerId || ownerId === peerId) return;
    const trust = await ctx.trustStore.getTrustRecord(ownerId);
    if (!trust || trust.level === "blocked" || trust.level === "public") return;
    await ctx.warmContactConnection(ownerId);
  } catch {
    /* best-effort */
  }
}

export async function tagBondedContactReachabilityViaRuntime(
  ctx: ReachabilityContext,
  libp2pPeerId: string,
): Promise<void> {
  const mesh = ctx.getReachableMesh();
  if (!mesh) return;
  try {
    await mesh.tagContactForPersistentReachability(libp2pPeerId);
  } catch (e) {
    console.warn(`[reachability] tag failed for ${libp2pPeerId.slice(0, 12)}…:`, e);
  }
}

export async function untagReachabilityForOwnerViaRuntime(
  ctx: ReachabilityContext,
  peerOwnerId: string,
): Promise<void> {
  const mesh = ctx.getReachableMesh();
  if (!mesh) return;
  try {
    const rec = await ctx.peerDirectoryStore.getPeerByOwnerId(peerOwnerId);
    if (rec?.peerId) {
      await mesh.untagContactForPersistentReachability(rec.peerId);
    }
  } catch (e) {
    console.warn(`[reachability] untag failed for owner ${peerOwnerId}:`, e);
  }
}

export async function resyncBondedContactReachabilityTagsViaRuntime(ctx: ReachabilityContext): Promise<void> {
  const mesh = ctx.getReachableMesh();
  if (!mesh) return;
  try {
    const trust = await ctx.trustStore.listTrustRecords();
    for (const r of trust) {
      if (r.level === "blocked") continue;
      const dir = await ctx.peerDirectoryStore.getPeerByOwnerId(r.peerOwnerId);
      if (dir?.peerId) {
        await mesh.tagContactForPersistentReachability(dir.peerId);
      }
    }
  } catch (e) {
    console.warn(`[reachability] resync tags failed:`, e);
  }
}

export function startBondWarmIntervalViaRuntime(ctx: ReachabilityContext): void {
  const existing = ctx.getBondWarmTimer();
  if (existing) {
    clearInterval(existing);
  }
  const runWarm = (): void => {
    void warmAllBondedContactsViaRuntime(ctx);
  };
  setTimeout(runWarm, BOND_WARM_INITIAL_DELAY_MS);
  ctx.setBondWarmTimer(setInterval(runWarm, BOND_WARM_INTERVAL_MS));
}

export async function warmAllBondedContactsViaRuntime(ctx: ReachabilityContext): Promise<void> {
  if (ctx.getNodeStatus() !== "running") return;

  // Offline catch-up: retry feed.notify that failed while the peer was down.
  // Run even when only an external mesh is bound (CLI path has no _mesh).
  try {
    await ctx.flushFeedNotifyOutbox();
  } catch (err) {
    console.warn(
      "[feed.notify] outbox flush during bond warm failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const mesh = ctx.getInternalMesh();
  if (!mesh) return;

  const bonds = await ctx.getBonds();
  const selfOwnerId = ctx.getProfile()?.owner.ownerId?.trim();

  // The cap is enforced INSIDE the loop too. The pre-loop check is just a
  // fast-path that lets us skip the entire cycle when the cap is already
  // blown (e.g. 178 bonds but only 64 connection slots); without it we'd
  // walk every bond just to bail per-iteration. Each `warmContactConnection`
  // call below can ADD a connection (when the peer isn't already
  // connected), so the cap must also be re-checked before each warm call —
  // otherwise a single cycle can push totalConnections well past the cap
  // before the next cycle's pre-check has a chance to refuse.
  if (mesh.getConnectionStats().totalConnections >= BOND_WARM_MAX_CONNECTIONS) {
    console.warn(
      `[bond-warm] skipped: ${mesh.getConnectionStats().totalConnections} open connections (cap ${BOND_WARM_MAX_CONNECTIONS}). ` +
        `Reduce bonded contacts or increase the cap.`,
    );
    return;
  }

  const now = Date.now();
  const lastBondWarmAt = ctx.getLastBondWarmAt();

  for (const bond of bonds) {
    if (selfOwnerId && bond.peerOwnerId.trim() === selfOwnerId) continue;
    if (bond.level !== "direct" && bond.level !== "referred") continue;

    const lastWarm = lastBondWarmAt.get(bond.peerOwnerId);
    if (lastWarm && now - lastWarm < BOND_WARM_PER_CONTACT_COOLDOWN_MS) continue;

    // Per-iteration cap check — see comment above. Bail out of the cycle
    // (without breaking the cooldown) so the next 5-min cycle can re-
    // evaluate when the cap headroom grows.
    if (mesh.getConnectionStats().totalConnections >= BOND_WARM_MAX_CONNECTIONS) {
      console.warn(
        `[bond-warm] cap ${BOND_WARM_MAX_CONNECTIONS} reached mid-cycle at bond ${bond.peerOwnerId.slice(0, 12)}… — deferring remaining ${bonds.length - (bonds.indexOf(bond))} bonds to next cycle`,
      );
      break;
    }

    try {
      const info = await ctx.getPeerConnectionInfo(bond.peerOwnerId);
      if (info.connected) {
        try {
          const { transportPeerId } = await ctx.resolvePeerTransportForOwner(bond.peerOwnerId);
          if (isOutboundPeerRecentlyVerified(transportPeerId)) {
            lastBondWarmAt.set(bond.peerOwnerId, now);
            continue;
          }
        } catch {
          /* fall through */
        }
        lastBondWarmAt.set(bond.peerOwnerId, now);
        await ctx.warmContactConnection(bond.peerOwnerId, { keepAlive: true });
        continue;
      }
      lastBondWarmAt.set(bond.peerOwnerId, now);
      await ctx.warmContactConnection(bond.peerOwnerId);
    } catch {
      /* best-effort */
    }
  }
}
