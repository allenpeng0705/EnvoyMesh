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
import {
  hasSameSubnetLanDialEvidence,
  mergeDialablePeerListenAddrs,
} from "./outbound-dial-hints.js";
import { isOutboundPeerRecentlyVerified } from "./outbound-peer-freshness.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { NEARBY_PROFILE_PROBE_COOLDOWN_MS } from "./node-service-identity.js";
import {
  configurePeerPathSoftConnectionCap,
  getPeerPathSoftConnectionCap,
  isPeerPathConnectionCapReached,
  PEER_PATH_SOFT_CONNECTION_CAP,
} from "./peer-path.js";
import { PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD, assessDialBudget } from "@envoymesh/network";

/** @deprecated Prefer {@link getPeerPathSoftConnectionCap} — soft cap tracks maxConnections. */
export const BOND_WARM_MAX_CONNECTIONS = PEER_PATH_SOFT_CONNECTION_CAP;
export const BOND_WARM_PER_CONTACT_COOLDOWN_MS = 300_000;
/**
 * After a *failed* warm, stay cool only this long so startup reconnect is not
 * stuck waiting for the full {@link BOND_WARM_PER_CONTACT_COOLDOWN_MS} (5 min)
 * — that matched the Win→Mac "Offline until Online-Relay ~5 min" report.
 * Raised 20s → 120s so offline bonds do not redial every few seconds on 24/7 homes.
 */
export const BOND_WARM_FAILURE_COOLDOWN_MS = 120_000;
/**
 * After an Online-Relay warm that did not upgrade to Direct, become eligible
 * again quickly. Applying the full 5‑minute success cooldown here was why
 * same-LAN peers sat on Online-Relay for minutes.
 */
export const BOND_WARM_RELAY_UPGRADE_COOLDOWN_MS = 5_000;
/**
 * Aggressive Relay→Direct retries after we first see Online-Relay (identify +
 * LAN dial). Independent of the 5‑minute bond-warm interval.
 */
export const BOND_WARM_RELAY_UPGRADE_RETRY_DELAYS_MS = [2_000, 5_000, 12_000, 25_000] as const;
/**
 * Extra warm pulses after the node comes online. The steady-state interval is
 * still ~5 min; without these, a failed first dial waited until the next
 * interval (~5 min) before Online appeared.
 */
export const BOND_WARM_STARTUP_RETRY_DELAYS_MS = [5_000, 20_000, 45_000, 90_000] as const;

/** Per-owner timers for Relay→Direct upgrade pulses (cleared on Direct / stop). */
const relayUpgradeRetryTimers = new Map<string, Array<ReturnType<typeof setTimeout>>>();
/** @deprecated Prefer {@link BOND_WARM_STARTUP_RETRY_DELAYS_MS}[0]. */
export const BOND_WARM_INITIAL_DELAY_MS = BOND_WARM_STARTUP_RETRY_DELAYS_MS[0];
const BOND_WARM_INTERVAL_MS = 300_000;

/** Runtime-overridable bond-warm timers (from connectivity mode preset). */
let configuredBondWarmIntervalMs = BOND_WARM_INTERVAL_MS;
let configuredBondWarmCooldownMs = BOND_WARM_PER_CONTACT_COOLDOWN_MS;
let configuredBondWarmEventDriven = false;

export function configureBondWarmFromConnectivity(input: {
  intervalMs: number;
  perContactCooldownMs: number;
  eventDriven: boolean;
  maxConnections?: number;
}): void {
  configuredBondWarmIntervalMs = input.intervalMs;
  configuredBondWarmCooldownMs = input.perContactCooldownMs;
  configuredBondWarmEventDriven = input.eventDriven;
  configurePeerPathSoftConnectionCap(input.maxConnections);
}

/** Test helper */
export function resetBondWarmConnectivityConfigForTests(): void {
  configuredBondWarmIntervalMs = BOND_WARM_INTERVAL_MS;
  configuredBondWarmCooldownMs = BOND_WARM_PER_CONTACT_COOLDOWN_MS;
  configuredBondWarmEventDriven = false;
  configurePeerPathSoftConnectionCap(undefined);
  for (const ownerId of [...relayUpgradeRetryTimers.keys()]) {
    clearRelayUpgradeRetryTimers(ownerId);
  }
}

function clearRelayUpgradeRetryTimers(ownerId: string): void {
  const timers = relayUpgradeRetryTimers.get(ownerId);
  if (!timers) return;
  for (const t of timers) clearTimeout(t);
  relayUpgradeRetryTimers.delete(ownerId);
}

/**
 * Schedule short Relay→Direct upgrade attempts. Cooldown alone is not enough —
 * the steady warm interval is 5 minutes; these pulses drive identify/LAN dial
 * within seconds of first Online-Relay.
 */
function scheduleRelayToDirectUpgradeRetries(
  ctx: ReachabilityContext,
  ownerId: string,
): void {
  clearRelayUpgradeRetryTimers(ownerId);
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  for (const delayMs of BOND_WARM_RELAY_UPGRADE_RETRY_DELAYS_MS) {
    timers.push(
      setTimeout(() => {
        void (async () => {
          try {
            if (ctx.getNodeStatus() !== "running") return;
            const info = await ctx.getPeerConnectionInfo(ownerId);
            if (!info.connected) return;
            if (info.direct) {
              clearRelayUpgradeRetryTimers(ownerId);
              markBondWarmCooldown(ctx.getLastBondWarmAt(), ownerId, true);
              return;
            }
            const upgraded = await ctx.warmContactConnection(ownerId, {
              upgradeRelayToDirect: true,
            });
            if (upgraded.direct) {
              clearRelayUpgradeRetryTimers(ownerId);
              markBondWarmCooldown(ctx.getLastBondWarmAt(), ownerId, true);
              return;
            }
            if (upgraded.connected) {
              markBondWarmCooldown(
                ctx.getLastBondWarmAt(),
                ownerId,
                /* connected */ false,
                Date.now(),
                BOND_WARM_RELAY_UPGRADE_COOLDOWN_MS,
              );
            }
          } catch {
            /* best-effort */
          }
        })();
      }, delayMs),
    );
  }
  relayUpgradeRetryTimers.set(ownerId, timers);
}

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
  probeNearbyPeerProfileAfterDiscovery(
    peerId: string,
    multiaddrs: string[],
    opts?: { force?: boolean },
  ): Promise<void>;
  maybeFireLanAutoBond(peerId: string): Promise<void>;
  emit(event: string, payload: unknown): void;
  getBondWarmTimer(): ReturnType<typeof setInterval> | undefined;
  setBondWarmTimer(timer: ReturnType<typeof setInterval> | undefined): void;
  getLastBondWarmAt(): Map<string, number>;
  /** Set of bootstrap peer IDs that should be excluded from discovery UI. */
  getBootstrapPeerIds(): Set<string>;
  /** Allow a peer under strictDialPolicy (Discover / mDNS) before dial. */
  noteStrictDialPeer?(peerId: string, seedAddr?: string): void;
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
  /** Retry undelivered feed.engage (like/comment) outbox. */
  flushFeedEngageOutbox(): Promise<void>;
  /** Request agent card from a bonded peer (best-effort, no throw). */
  requestAgentCard?(ownerId: string): Promise<{ ok: boolean }>;
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
    probeNearbyPeerProfileAfterDiscovery: (peerId, multiaddrs, opts) =>
      host._probeNearbyPeerProfileAfterDiscovery(peerId, multiaddrs, opts),
    maybeFireLanAutoBond: (peerId) => host._maybeFireLanAutoBond(peerId),
    emit: (event, payload) => host.emit(event, payload),
    getBondWarmTimer: () => host._bondWarmTimer,
    setBondWarmTimer: (timer) => {
      host._bondWarmTimer = timer;
    },
    getLastBondWarmAt: () => host._lastBondWarmAt,
    getBootstrapPeerIds: () => host._bootstrapPeerIdSet ?? new Set<string>(),
    noteStrictDialPeer: (peerId, seedAddr) => host.noteStrictDialPeer(peerId, seedAddr),
    getNearbyProfileProbeLastAt: () => host._nearbyProfileProbeLastAt,
    getNearbyProfileProbeCooldownMs: () => NEARBY_PROFILE_PROBE_COOLDOWN_MS,
    isNonEnvoyPeerSuppressed: (peerId) => host._isNonEnvoyPeerSuppressed(peerId),
    markNonEnvoyPeerFailed: (peerId) => host._markNonEnvoyPeerFailed(peerId),
    resetNonEnvoyPeerFailCount: (peerId) => host._resetNonEnvoyPeerFailCount(peerId),
    flushFeedNotifyOutbox: () => host._flushFeedNotifyOutbox(),
    flushFeedEngageOutbox: () => host._flushFeedEngageOutbox(),
    requestAgentCard: (ownerId) => host.requestAgentCard(ownerId),
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
  opts?: { force?: boolean },
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
    // Strict-dial allow-set: only LAN/mDNS (and forced nearby refresh) — never
    // anonymous DHT "unknown" sightings, or the gater allow-list grows with the swarm.
    if (opts?.force === true || source === "mdns") {
      ctx.noteStrictDialPeer?.(peerId);
      if (multiaddrs.length > 0) {
        for (const addr of multiaddrs) ctx.noteStrictDialPeer?.(peerId, addr);
      }
    }
    if (
      shouldPersistPeerDiscoverySeeds(discoveryProfile, source) &&
      multiaddrs.length > 0 &&
      discoverySeedStore
    ) {
      await discoverySeedStore.upsertMany(multiaddrs, "peer.discovery");
    }
    // Same gate as discovery-seeds: do not rewrite peer-directory from anonymous
    // DHT ("unknown") sightings — that refreshed stub lastSeenAt forever and
    // defeated directory caps. LAN (mdns) + relay hops still merge.
    if (
      multiaddrs.length > 0 &&
      shouldPersistPeerDiscoverySeeds(discoveryProfile, source)
    ) {
      await ctx.peerDirectoryStore.mergeListenAddrsForPeerId(peerId, multiaddrs);
    }
    const mesh = ctx.getReachableMesh();
    if (mesh && multiaddrs.length > 0) {
      // mergeDialable strips tcp/0 high ports — but same-LAN nodes listen on
      // tcp/0, and those mDNS/identify addrs are required for Relay→Direct.
      // mergePeerStoreDialHints already keeps ephemeral private-LAN hints.
      const sameSubnet = hasSameSubnetLanDialEvidence(mesh.multiaddrs, multiaddrs, {
        hostNicFallback: true,
      });
      void mesh.mergePeerStoreDialHints(
        peerId,
        sameSubnet ? multiaddrs : mergeDialablePeerListenAddrs(peerId, multiaddrs),
      );
    }
    const profile = ctx.getProfile();
    if (mesh && profile && peerId === mesh.peerId) {
      return;
    }
    if (isInfrastructure) {
      return;
    }
    // --- Discovery placeholder suppression ---
    // Skip probe dispatch for peers whose profile probe recently ran
    // (success or failure). Prevents UI flicker from mDNS re-discovery.
    // Discover tab refresh passes force=true to bypass this cooldown.
    const probeLastAt = ctx.getNearbyProfileProbeLastAt();
    if (opts?.force) {
      probeLastAt.delete(peerId);
    }
    const lastProbeAt = probeLastAt.get(peerId) ?? 0;
    const probeCooldownMs = ctx.getNearbyProfileProbeCooldownMs();
    if (!opts?.force && Date.now() - lastProbeAt < probeCooldownMs) {
      // Only kick auto-bond when we already have a live connection — otherwise
      // every mDNS re-ad of printers/TVs would spam device.pair.request.
      const meshForBond = ctx.getReachableMesh();
      if (meshForBond?.getConnectedPeerIds().includes(peerId)) {
        void ctx.maybeFireLanAutoBond(peerId);
      }
      return;
    }
    // Peers that have failed ≥ N consecutive probes are known non-EnvoyMesh
    // devices (printers, TVs, etc.).  Suppress them for a longer cooldown —
    // but never while we still have a live connection (one-way LAN probes
    // often fail outbound while the peer is connected inbound).
    if (!opts?.force && ctx.isNonEnvoyPeerSuppressed(peerId)) {
      const meshLive = ctx.getReachableMesh();
      if (!meshLive?.getConnectedPeerIds().includes(peerId)) {
        return;
      }
    }
    // Do NOT emit a pending placeholder here — pending→lost→rediscover
    // cycles flash the Discover page after restart. The probe emits a
    // single resolved or unreachable result when it finishes.
    if (opts?.force) {
      // Discover refresh awaits probes so hydrate can show results immediately.
      await ctx.probeNearbyPeerProfileAfterDiscovery(peerId, multiaddrs, opts);
    } else {
      void ctx.probeNearbyPeerProfileAfterDiscovery(peerId, multiaddrs);
    }
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
    // Fresh mDNS LAN: force Relay→Direct upgrade (not a passive keep-alive).
    await ctx.warmContactConnection(ownerId, { upgradeRelayToDirect: true });
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

function markBondWarmCooldown(
  lastBondWarmAt: Map<string, number>,
  ownerId: string,
  connected: boolean,
  now = Date.now(),
  /** Override failure/partial cooldown (e.g. still Online-Relay). */
  partialCooldownMs = BOND_WARM_FAILURE_COOLDOWN_MS,
): void {
  if (connected) {
    lastBondWarmAt.set(ownerId, now);
    return;
  }
  // Failed / still-relay: become eligible again after partialCooldownMs
  // (encoded relative to the configured success cooldown window).
  lastBondWarmAt.set(
    ownerId,
    now - configuredBondWarmCooldownMs + partialCooldownMs,
  );
}

export function startBondWarmIntervalViaRuntime(ctx: ReachabilityContext): void {
  const existing = ctx.getBondWarmTimer();
  if (existing) {
    clearInterval(existing);
  }
  const runWarm = (): void => {
    void warmAllBondedContactsViaRuntime(ctx);
  };
  // Startup pulses — do not rely on the 5-minute interval for first Online.
  for (const delayMs of BOND_WARM_STARTUP_RETRY_DELAYS_MS) {
    setTimeout(runWarm, delayMs);
  }
  ctx.setBondWarmTimer(setInterval(runWarm, configuredBondWarmIntervalMs));
}

export async function warmAllBondedContactsViaRuntime(ctx: ReachabilityContext): Promise<void> {
  if (ctx.getNodeStatus() !== "running") return;

  // Offline catch-up: retry feed.notify / feed.engage that failed while peer was down.
  // Run even when only an external mesh is bound (CLI path has no _mesh).
  try {
    await ctx.flushFeedNotifyOutbox();
  } catch (err) {
    console.warn(
      "[feed.notify] outbox flush during bond warm failed:",
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await ctx.flushFeedEngageOutbox();
  } catch (err) {
    console.warn(
      "[feed.engage] outbox flush during bond warm failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const mesh = ctx.getInternalMesh();
  if (!mesh) return;

  const bonds = await ctx.getBonds();
  const selfOwnerId = ctx.getProfile()?.owner.ownerId?.trim();

  // The cap is enforced INSIDE the loop too. The pre-loop check is just a
  // fast-path that lets us skip the entire cycle when the soft cap is already
  // reached (near libp2p maxConnections); without it we'd walk every bond just
  // to bail per-iteration. Each `warmContactConnection` call below can ADD a
  // connection (when the peer isn't already connected), so the cap must also
  // be re-checked before each warm call — otherwise a single cycle can push
  // totalConnections well past the soft cap before the next cycle's pre-check
  // has a chance to refuse.
  const softCap = getPeerPathSoftConnectionCap();
  const connStats = mesh.getConnectionStats();
  const dialBudget = assessDialBudget(connStats.dialQueueLength);
  if (dialBudget.deferBondWarm) {
    console.warn(
      `[bond-warm] skipped: dialQueue=${dialBudget.dialQueueLength} (>${PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD}) — deferring until congestion clears`,
    );
    return;
  }
  if (isPeerPathConnectionCapReached(connStats.totalConnections)) {
    console.warn(
      `[bond-warm] skipped: ${connStats.totalConnections} open connections (cap ${softCap}). ` +
        `PeerPath soft cap — reduce bonded contacts or wait for idle.`,
    );
    return;
  }

  const now = Date.now();
  const lastBondWarmAt = ctx.getLastBondWarmAt();

  for (const bond of bonds) {
    if (selfOwnerId && bond.peerOwnerId.trim() === selfOwnerId) continue;
    if (bond.level !== "direct" && bond.level !== "referred") continue;

    const lastWarm = lastBondWarmAt.get(bond.peerOwnerId);
    if (lastWarm && now - lastWarm < configuredBondWarmCooldownMs) continue;

    // Per-iteration cap check — see comment above. Bail out of the cycle
    // (without breaking the cooldown) so the next cycle can re-
    // evaluate when the cap headroom grows.
    if (isPeerPathConnectionCapReached(mesh.getConnectionStats().totalConnections)) {
      console.warn(
        `[bond-warm] cap ${softCap} reached mid-cycle at bond ${bond.peerOwnerId.slice(0, 12)}… — deferring remaining ${bonds.length - (bonds.indexOf(bond))} bonds to next cycle`,
      );
      break;
    }

    try {
      const info = await ctx.getPeerConnectionInfo(bond.peerOwnerId);
      if (info.connected) {
        // Stuck Online-Relay: identify + LAN dial, short cooldown, and schedule
        // aggressive upgrade pulses (do not apply the 5‑minute success cooldown).
        if (!info.direct) {
          const upgraded = await ctx.warmContactConnection(bond.peerOwnerId, {
            upgradeRelayToDirect: true,
          });
          if (upgraded.direct) {
            clearRelayUpgradeRetryTimers(bond.peerOwnerId);
            markBondWarmCooldown(lastBondWarmAt, bond.peerOwnerId, true);
          } else if (upgraded.connected) {
            markBondWarmCooldown(
              lastBondWarmAt,
              bond.peerOwnerId,
              false,
              Date.now(),
              BOND_WARM_RELAY_UPGRADE_COOLDOWN_MS,
            );
            scheduleRelayToDirectUpgradeRetries(ctx, bond.peerOwnerId);
          } else {
            markBondWarmCooldown(lastBondWarmAt, bond.peerOwnerId, false);
          }
          continue;
        }
        clearRelayUpgradeRetryTimers(bond.peerOwnerId);
        try {
          const { transportPeerId } = await ctx.resolvePeerTransportForOwner(bond.peerOwnerId);
          // Optimized+ always skips recently verified; Smart/Aggressive also treat
          // any connected path as warm enough for background (event-driven warm).
          if (
            isOutboundPeerRecentlyVerified(transportPeerId) ||
            (configuredBondWarmEventDriven && info.connected)
          ) {
            markBondWarmCooldown(lastBondWarmAt, bond.peerOwnerId, true);
            continue;
          }
        } catch {
          /* fall through */
        }
        const kept = await ctx.warmContactConnection(bond.peerOwnerId, { keepAlive: true });
        markBondWarmCooldown(lastBondWarmAt, bond.peerOwnerId, kept.connected);
        continue;
      }
      // Peer was disconnected — warm, then fetch agent card if it just came online.
      // Do NOT apply the full 5-minute cooldown before the dial: a failed first
      // attempt used to block every retry until the next 5-minute interval.
      const warmed = await ctx.warmContactConnection(bond.peerOwnerId);
      if (warmed.connected && !warmed.direct) {
        markBondWarmCooldown(
          lastBondWarmAt,
          bond.peerOwnerId,
          false,
          Date.now(),
          BOND_WARM_RELAY_UPGRADE_COOLDOWN_MS,
        );
        scheduleRelayToDirectUpgradeRetries(ctx, bond.peerOwnerId);
      } else {
        markBondWarmCooldown(lastBondWarmAt, bond.peerOwnerId, warmed.connected);
        if (warmed.direct) clearRelayUpgradeRetryTimers(bond.peerOwnerId);
      }
      if (warmed.connected && ctx.requestAgentCard) {
        void ctx
          .requestAgentCard(bond.peerOwnerId)
          .catch((err) =>
            console.warn(
              `[bond-warm] requestAgentCard for ${bond.peerOwnerId.slice(0, 16)}… failed:`,
              err instanceof Error ? err.message : err,
            ),
          );
      }
    } catch {
      // Attempt threw — treat as failure so startup pulses can retry soon.
      markBondWarmCooldown(lastBondWarmAt, bond.peerOwnerId, false);
    }
  }
}
