/**
 * Identity + human profile runtime.
 *
 * Extracted from `node-service-impl.ts` (Identity section, lines ~2070–2944).
 * Owns owner DID presentation, human profile CRUD, peer profile cache,
 * discovery topic advertising, and profile photo/gallery updates.
 *
 * `syncProfileToBonds` stays a thin delegation in the impl class.
 */
import {
  buildOwnerDidPresentation,
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  deriveLocationDiscoveryTopics,
  isBootstrapRelayMultiaddr,
  profileCapabilityDiscoveryTopics,
  profileCapabilityTags,
  syncProfileTagsToManifestCapabilities,
  MAX_PROFILE_GALLERY_PHOTOS,
  MAX_PROFILE_GALLERY_PHOTO_BYTES,
  MAX_PROFILE_THUMBNAIL_BYTES,
  type AgentIdentityDocument,
  type BondRecord,
  type CreateHumanProfileInput,
  type HumanProfile,
  type NodeProfile,
  type PeerProfileView,
  type PeerReputationSummary,
  type ProfileGalleryPhotoVisibility,
  type SetPublicProfileThumbnailParams,
  type UpsertProfileGalleryPhotoParams,
  type UpdateProfileGalleryPhotoVisibilityParams,
} from "@envoymesh/api";
import { resolveDidImportInput, resolveDidExportInput } from "@envoymesh/api/did-import";
import { signHumanProfile, signUnsignedEnvelope } from "@envoymesh/identity";
import type {
  CachedPeerProfile,
  CapabilityManifestStore,
  ContactOwnerKeyStore,
  HumanProfileStore,
  LocalPeerDirectoryStore,
  PeerProfileCacheStore,
  PeerReputationStore,
  ReputationAnchorStore,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  createRendezvousRegisterPayload,
  createUnsignedEnvelope,
  ProfileGalleryPhotoSchema,
  ProfilePhotoRefSchema,
  type EnvoyEnvelope,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import { sendExpectReplyWithRetry } from "./chat-outbound-deliver.js";
import { dialHintsForTransportTarget } from "./mesh-outbound-helper.js";
import { probeNearbyPeerProfile } from "./nearby-profile-probe.js";
import { displayNameTopicFor, interestTopicFor } from "./capability-discovery.js";
import { raceWithTimeout } from "./node-service-outbound-messaging.js";
import {
  isPeerPathConnectionCapReached,
  PEER_PATH_SOFT_CONNECTION_CAP,
} from "./peer-path-slots.js";
import {
  importProfilePhotoBytes,
  parseProfilePhotoMime,
  photoIdFromGalleryPath,
  profileGalleryVaultPath,
  profileThumbnailVaultPath,
} from "./profile-photo.js";
import {
  handleInboundProfileRequest,
  handleInboundProfileSync,
} from "./profile-sync-inbound.js";
import {
  buildSignedProfilePayloadEnvelope,
  sendProfileResponse,
  sendProfileSyncToBonds,
} from "./profile-sync-outbound.js";

/**
 * Timeout for a single DHT provide/find operation (advertise topic, search
 * peers). The libp2p KadDHT provide() can take 30-60s when DHT peers are
 * slow to respond or the network is still bootstrapping (especially behind
 * NAT, or when bootstrap.libp2p.io DNS seeds are slow / partially blocked).
 *
 * 30s was too short for the cold-start case: a fresh node fires its first
 * topic advertisement at +5-15s after mesh.start(), and the KadDHT has not
 * yet finished bootstrapping its routing table. Every provide timed out and
 * 8 topics × 30s × sequential retry cycle (5 minutes apart) meant ~9 min
 * between attempts. Bumped to 60s so the first attempt has a real chance.
 */
export const DISCOVERY_TOPIC_OP_TIMEOUT_MS = 60_000;

/**
 * Adaptive retry intervals for the periodic re-advertise loop.
 *
 * `_advertisePublicDiscoveryTopics` reschedules itself based on the result
 * of the previous attempt:
 * - If any topic failed: retry quickly so a freshly-bootstrapped DHT can be
 *   picked up without waiting the full healthy interval.
 * - If all topics succeeded: back off to the healthy interval to avoid
 *   hammering the DHT.
 */
export const DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS = 60_000;
export const DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS = 5 * 60_000;
/** Maximum backoff after consecutive all-fail cycles (capped so a recovered DHT is picked up within 5 min). */
export const DISCOVERY_ADVERTISE_RETRY_BACKOFF_MAX_MS = 5 * 60_000;
export const NEARBY_PROFILE_PROBE_COOLDOWN_MS = 30_000;
/** @deprecated Prefer {@link PEER_PATH_SOFT_CONNECTION_CAP} — shared with PeerPath. */
export const BOND_WARM_MAX_CONNECTIONS = PEER_PATH_SOFT_CONNECTION_CAP;

export interface IdentityContext {
  getProfile(): NodeProfile | null | undefined;
  requireProfile(): NodeProfile;
  assertOnline(): void;
  getMesh(): EnvoyMesh | null | undefined;
  getExternalMesh(): EnvoyMesh | null | undefined;
  reachableMesh(): EnvoyMesh | null | undefined;
  requireMesh(): EnvoyMesh;
  getRelayPublicWsUrl(): string | null | undefined;
  getHumanProfileStore(): HumanProfileStore;
  getPeerReputationStore(): PeerReputationStore | undefined;
  getReputationAnchorStore(): ReputationAnchorStore | undefined;
  getPeerProfileCacheStore(): PeerProfileCacheStore | undefined;
  getContactOwnerKeyStore(): ContactOwnerKeyStore | undefined;
  getConfigStore(): { load(): Promise<{ bootstrapPresets?: string[]; configuredRelays?: Array<{ enabled?: boolean; addr?: string }>; bootstrapPeers?: string[] } | null | undefined> };
  getCapabilityManifestStore(): CapabilityManifestStore | undefined;
  getVaultDir(): string | null;
  getPeerDirectoryStore(): LocalPeerDirectoryStore;
  getBonds(): Promise<BondRecord[]>;
  requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }>;
  refreshAgentNetworkMembershipIndex(): Promise<void>;
  emit(event: string, payload: unknown): void;
  dialHintsForChat(peerId: string, listenAddrs?: string[]): Promise<string[]>;
  rememberBondedPeerTransportFromInbound(
    envelope: EnvoyEnvelope,
    context?: {
      transportPeerId?: string;
      remoteAddr?: string;
      replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
    },
  ): Promise<void>;
  resolveLibp2pPeerForBondOwner(
    ownerId: string,
  ): Promise<{ transportPeerId: string; listenAddrs: string[] } | undefined>;
  getAgentIdentityStore():
    | {
        load(): Promise<AgentIdentityDocument>;
        save(content: string): Promise<AgentIdentityDocument>;
      }
    | undefined;
  getAutoAdvertisedDiscoveryTopics(): string[];
  setAutoAdvertisedDiscoveryTopics(topics: string[]): void;
  getAdvertiseInterestsTimer(): ReturnType<typeof setInterval> | undefined;
  setAdvertiseInterestsTimer(timer: ReturnType<typeof setInterval> | undefined): void;
  getNearbyProfileProbeLastAt(): Map<string, number>;
  getNearbyProfileProbeInflight(): Set<string>;
  /** Record a failed probe attempt (for non-EnvoyMesh suppression). */
  markNonEnvoyPeerFailed(peerId: string): void;
  /** True when the peer has failed enough probes and is within suppression cooldown. */
  isNonEnvoyPeerSuppressed(peerId: string): boolean;
  /** Reset fail count on successful probe. */
  resetNonEnvoyPeerFailCount(peerId: string): void;
  /** Attempt LAN auto-bond (fire-and-forget, gated by cooldown + config). */
  maybeFireLanAutoBond(peerId: string): Promise<void>;
  /**
   * Notify active relay checkin scheduler of the topics currently being
   * advertised. The relay client uses this to populate `advertisements[]`
   * with topicHash entries so the relay server's roster can be queried by
   * topic (cross-NAT fallback for `searchPeers` when local DHT is empty).
   */
  notifyAdvertisedDiscoveryTopics?(topics: string[]): Promise<void> | void;
}

export function buildIdentityContext(host: any): IdentityContext {
  return {
    getProfile: () => host._profile,
    requireProfile: () => host._requireProfile(),
    assertOnline: () => host._assertOnline(),
    getMesh: () => host._mesh,
    getExternalMesh: () => host._externalMesh,
    reachableMesh: () => host._reachableMesh(),
    requireMesh: () => host._requireMesh(),
    getRelayPublicWsUrl: () => host._relayPublicWsUrl,
    getHumanProfileStore: () => host._humanProfileStore,
    getPeerReputationStore: () => host._peerReputationStore ?? undefined,
    getReputationAnchorStore: () => host._reputationAnchorStore ?? undefined,
    getPeerProfileCacheStore: () => host._peerProfileCacheStore ?? undefined,
    getContactOwnerKeyStore: () => host._contactOwnerKeyStore ?? undefined,
    getConfigStore: () => host._configStore,
    getCapabilityManifestStore: () => host._capabilityManifestStore ?? undefined,
    getVaultDir: () => host._vaultDir,
    getPeerDirectoryStore: () => host._peerDirectoryStore,
    getBonds: () => host.getBonds(),
    requestPeerProfile: (ownerId) => host.requestPeerProfile(ownerId),
    refreshAgentNetworkMembershipIndex: () => host.refreshAgentNetworkMembershipIndex(),
    emit: (event, payload) => host.emit(event, payload),
    dialHintsForChat: (peerId, listenAddrs) => host._dialHintsForChat(peerId, listenAddrs),
    rememberBondedPeerTransportFromInbound: (envelope, context) =>
      host._rememberBondedPeerTransportFromInbound(envelope, context),
    resolveLibp2pPeerForBondOwner: (ownerId) =>
      host._resolveLibp2pPeerForBondOwner(ownerId) as Promise<
        { transportPeerId: string; listenAddrs: string[] } | undefined
      >,
    getAgentIdentityStore: () => host._agentIdentityStore ?? undefined,
    getAutoAdvertisedDiscoveryTopics: () => host._autoAdvertisedDiscoveryTopics,
    setAutoAdvertisedDiscoveryTopics: (topics) => {
      host._autoAdvertisedDiscoveryTopics = topics;
    },
    getAdvertiseInterestsTimer: () => host._advertiseInterestsTimer,
    setAdvertiseInterestsTimer: (timer) => {
      host._advertiseInterestsTimer = timer;
    },
    getNearbyProfileProbeLastAt: () => host._nearbyProfileProbeLastAt,
    getNearbyProfileProbeInflight: () => host._nearbyProfileProbeInflight,
    markNonEnvoyPeerFailed: (peerId) => host._markNonEnvoyPeerFailed(peerId),
    isNonEnvoyPeerSuppressed: (peerId) => host._isNonEnvoyPeerSuppressed(peerId),
    resetNonEnvoyPeerFailCount: (peerId) => host._resetNonEnvoyPeerFailCount(peerId),
    maybeFireLanAutoBond: (peerId) => host._maybeFireLanAutoBond(peerId),
    notifyAdvertisedDiscoveryTopics: (topics) =>
      host._notifyAdvertisedDiscoveryTopics?.(topics) ?? Promise.resolve(),
  };
}

export function getProfileViaRuntime(ctx: IdentityContext): NodeProfile {
  return ctx.requireProfile();
}

export function getOwnerDidPresentationViaRuntime(ctx: IdentityContext) {
  const profile = ctx.requireProfile();
  return buildOwnerDidPresentation({
    ownerId: profile.owner.ownerId,
    publicKeyPem: profile.owner.publicKeyPem,
  });
}

export function exportDidDocumentViaRuntime(
  ctx: IdentityContext,
  input?: {
    services?: Array<{ id: string; type: string; serviceEndpoint: string; description?: string }>;
  },
): string {
  const profile = ctx.requireProfile();
  const services: Array<{ id: string; type: string; serviceEndpoint: string; description?: string }> = [];
  if (input?.services) {
    for (const s of input.services) services.push(s);
  } else {
    const mesh = ctx.getMesh() ?? ctx.getExternalMesh();
    if (mesh) {
      const relay = ctx.getRelayPublicWsUrl();
      if (relay) {
        services.push({
          id: "#envoy-relay",
          type: "EnvoyMeshRelay",
          serviceEndpoint: relay,
          description: "WebSocket relay for inbound envelopes",
        });
      }
      if (mesh.peerId) {
        services.push({
          id: "#envoy-agent",
          type: "EnvoyMeshAgent",
          serviceEndpoint: `envoy_agent_${mesh.peerId.slice(-12)}`,
          description: "Local agent peer id (last 12 chars)",
        });
      }
    }
  }

  const inner = buildOwnerDidPresentation({
    ownerId: profile.owner.ownerId,
    publicKeyPem: profile.owner.publicKeyPem,
    services,
  });
  const envelope = {
    envelope: "envoymesh-did-export-v1" as const,
    exportedAt: new Date().toISOString(),
    did: inner.did,
    ownerId: profile.owner.ownerId,
    publicKeyPem: profile.owner.publicKeyPem,
    document: inner.document,
  };
  return JSON.stringify(envelope);
}

export async function resolveDidImportViaRuntime(_ctx: IdentityContext | null, input: string) {
  return resolveDidImportInput(input);
}

export async function resolveDidExportViaRuntime(_ctx: IdentityContext | null, input: string) {
  return resolveDidExportInput(input);
}

export async function cacheDidContactKeyViaRuntime(
  ctx: IdentityContext,
  params: { ownerId: string; publicKeyPem: string },
): Promise<{ ok: boolean; reason?: string }> {
  const store = ctx.getContactOwnerKeyStore();
  if (!store) {
    return { ok: false, reason: "contact owner key store unavailable" };
  }
  const ownerId = params.ownerId.trim();
  const publicKeyPem = params.publicKeyPem.trim();
  if (!ownerId || !publicKeyPem) {
    return { ok: false, reason: "ownerId and publicKeyPem are required" };
  }
  await store.upsert(ownerId, publicKeyPem);
  return { ok: true };
}

export async function getPeerReputationSummaryViaRuntime(
  ctx: IdentityContext,
  peerOwnerId: string,
): Promise<PeerReputationSummary> {
  const id = peerOwnerId.trim();
  const localRecord = ctx.getPeerReputationStore()
    ? await ctx.getPeerReputationStore()!.getReputation(id)
    : undefined;
  const attestations = ctx.getReputationAnchorStore()
    ? await ctx.getReputationAnchorStore()!.listAttestations(id)
    : [];

  return {
    peerOwnerId: id,
    local: localRecord
      ? {
          successfulTasks: localRecord.successfulTasks,
          failedTasks: localRecord.failedTasks,
          avgLatencyMs: localRecord.avgLatencyMs,
          abuseFlags: localRecord.abuseFlags,
          lastUpdated: localRecord.lastUpdated,
        }
      : undefined,
    attestations,
  };
}

export async function getHumanProfileViaRuntime(ctx: IdentityContext): Promise<HumanProfile | undefined> {
  const profile = await ctx.getHumanProfileStore().loadHumanProfile();
  return profile as HumanProfile | undefined;
}

export async function updateHumanProfileViaRuntime(
  ctx: IdentityContext,
  input: CreateHumanProfileInput,
): Promise<HumanProfile> {
  // Human profile is persisted locally — do not require mesh online (first-run setup
  // writes node-config.json before libp2p starts).
  const selfProfile = ctx.requireProfile();

  if (!input.displayName || !input.displayName.trim()) {
    throw new Error("displayName is required");
  }
  if (!input.username || !/^[a-zA-Z0-9_]{3,30}$/.test(input.username)) {
    throw new Error("username must be 3-30 characters, letters, numbers, underscore only");
  }

  const existing = await ctx.getHumanProfileStore().loadHumanProfile();

  const updatedPayload: Omit<HumanProfilePayload, "signature"> = {
    version: "0.1",
    ownerId: selfProfile.owner.ownerId,
    displayName: input.displayName.trim(),
    username: input.username.trim(),
    bio: input.bio ?? existing?.bio,
    gender: input.gender ?? existing?.gender,
    hobbies: input.hobbies ?? existing?.hobbies,
    knowledge: input.knowledge ?? existing?.knowledge,
    profileVisibility: input.profileVisibility ?? existing?.profileVisibility ?? "private",
    discoveryLocation: input.discoveryLocation ?? existing?.discoveryLocation,
    discoveryLocationPrecision:
      input.discoveryLocationPrecision ?? existing?.discoveryLocationPrecision ?? "hidden",
    capabilities: input.capabilities ?? existing?.capabilities,
    publicThumbnail: existing?.publicThumbnail,
    galleryPhotos: existing?.galleryPhotos,
    updatedAt: new Date().toISOString(),
  };

  const signedProfile = await _signAndSaveHumanProfile(ctx, updatedPayload);

  const config = await ctx.getConfigStore().load();
  const isPublicNetwork = (config?.bootstrapPresets && config.bootstrapPresets.length > 0) ||
    (config?.bootstrapPeers && config.bootstrapPeers.length > 0);
  const interests = [...(updatedPayload.hobbies ?? []), ...(updatedPayload.knowledge ?? [])];
  const username = updatedPayload.username;
  const locationTopics = deriveLocationDiscoveryTopics({
    location: updatedPayload.discoveryLocation,
    precision: updatedPayload.discoveryLocationPrecision,
  });
  const previousProfileCapabilityTags = profileCapabilityTags(existing?.capabilities);
  const capabilityTags = profileCapabilityTags(updatedPayload.capabilities);
  const capabilityTopics = profileCapabilityDiscoveryTopics(capabilityTags);
  await _syncProfileCapabilitiesToManifest(ctx, previousProfileCapabilityTags, capabilityTags);

  void _applyProfileDiscoveryAdvertising(ctx, {
    profileVisibility: updatedPayload.profileVisibility,
    isPublicNetwork: Boolean(isPublicNetwork),
    interests,
    username,
    displayName: updatedPayload.displayName,
    locationTopics,
    capabilityTopics,
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[node-service] profile discovery advertising failed: ${msg}`);
  });

  return signedProfile;
}

export function _mapCachedPeerProfile(row: CachedPeerProfile): PeerProfileView {
  return {
    ownerId: row.ownerId,
    profile: row.profile as HumanProfile,
    cachedAt: row.cachedAt,
    thumbnailContentBase64: row.thumbnail?.contentBase64,
    thumbnailMimeType: row.thumbnail?.mimeType,
  };
}

export async function getPeerProfileViaRuntime(
  ctx: IdentityContext,
  ownerId: string,
): Promise<PeerProfileView | undefined> {
  const store = ctx.getPeerProfileCacheStore();
  if (!store) return undefined;
  const row = await store.get(ownerId);
  return row ? _mapCachedPeerProfile(row) : undefined;
}

export async function listPeerProfilesViaRuntime(ctx: IdentityContext): Promise<PeerProfileView[]> {
  const store = ctx.getPeerProfileCacheStore();
  if (!store) return [];
  const rows = await store.list();
  return rows.map((r) => _mapCachedPeerProfile(r));
}

export async function refreshBondPeerProfilesViaRuntime(
  ctx: IdentityContext,
): Promise<{ requested: number; failed: number }> {
  const mesh = ctx.reachableMesh();
  if (mesh && isPeerPathConnectionCapReached(mesh.getConnectionStats().totalConnections)) {
    console.warn(
      `[profile] refreshBondPeerProfiles skipped: ${mesh.getConnectionStats().totalConnections} open libp2p connections (PeerPath soft cap ${PEER_PATH_SOFT_CONNECTION_CAP})`,
    );
    return { requested: 0, failed: 0 };
  }
  const bonds = await ctx.getBonds();
  let failed = 0;
  let requested = 0;
  for (const bond of bonds) {
    if (bond.level !== "direct" && bond.level !== "referred") {
      continue;
    }
    requested += 1;
    const result = await ctx.requestPeerProfile(bond.peerOwnerId);
    if (!result.ok) failed += 1;
  }
  void ctx.refreshAgentNetworkMembershipIndex().catch((err) => {
    console.warn("[chain] refreshAgentNetworkMembershipIndex after bond refresh failed:", err);
  });
  return { requested, failed };
}

export async function _probeNearbyPeerProfileAfterDiscovery(
  ctx: IdentityContext,
  peerId: string,
  multiaddrs: string[],
  opts?: { force?: boolean },
): Promise<void> {
  const mesh = ctx.getMesh() ?? ctx.getExternalMesh() ?? ctx.reachableMesh();
  const profile = ctx.getProfile();
  const contactOwnerKeyStore = ctx.getContactOwnerKeyStore();
  const peerProfileCacheStore = ctx.getPeerProfileCacheStore();
  if (!mesh || !profile || !contactOwnerKeyStore || !peerProfileCacheStore) {
    // No pending placeholder was emitted — nothing to clear.
    return;
  }
  if (peerId === mesh.peerId) {
    return;
  }
  const lastAtMap = ctx.getNearbyProfileProbeLastAt();
  const inflight = ctx.getNearbyProfileProbeInflight();
  if (opts?.force) {
    lastAtMap.delete(peerId);
    ctx.resetNonEnvoyPeerFailCount(peerId);
  }
  const lastAt = lastAtMap.get(peerId) ?? 0;
  if (!opts?.force && Date.now() - lastAt < NEARBY_PROFILE_PROBE_COOLDOWN_MS) {
    return;
  }
  if (inflight.has(peerId)) {
    return;
  }
  inflight.add(peerId);
  try {
    // Fast path: already a bonded / directory-known Envoy contact. Skip
    // profile.request (can hang across Win↔Mac even when chat is online-direct).
    const known = await resolveKnownNearbyPeer(ctx, peerId, profile.owner.ownerId);
    if (known) {
      lastAtMap.set(peerId, Date.now());
      ctx.resetNonEnvoyPeerFailCount(peerId);
      ctx.emit("peer:discovered", { ...known, profileStatus: "resolved" as const });
      void ctx.maybeFireLanAutoBond(peerId);
      return;
    }

    // Newly discovered peers may not have an open connection yet.  The
    // profile expect-reply path (chat protocol) requires a live connection
    // and throws immediately when one is absent — so dial first.
    //
    // We use mesh.dial(addr) directly rather than ensurePeerReachable because
    // the hint-filtering pipeline inside ensurePeerReachable strips loopback
    // addresses (intentional for production WAN dials, but it breaks same-Mac
    // LAN testing where 127.0.0.1 is the only path).
    const connectedPeerIds = mesh.getConnectedPeerIds();
    if (!connectedPeerIds.includes(peerId)) {
      try {
        const tcpAddr = multiaddrs.find((a) =>
          a.includes("/tcp/") && !a.includes("/ws/") && !a.includes("/wss/"),
        );
        const dialTarget = tcpAddr ?? `/p2p/${peerId}`;
        await Promise.race([
          mesh.dial(dialTarget),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("nearby dial timeout")), 5_000);
          }),
        ]);
      } catch {
        // Dial failed — still attempt the probe (relay or another path
        // may succeed for WAN peers).
      }
    }

    const enriched = await probeNearbyPeerProfile({
      mesh,
      profile,
      contactOwnerKeyStore,
      peerProfileCache: peerProfileCacheStore,
      transportPeerId: peerId,
      listenAddrs: multiaddrs,
      dialHintsFor: (transportPeerId, addrs) => ctx.dialHintsForChat(transportPeerId, addrs ?? multiaddrs),
      selfPeerId: mesh.peerId,
      selfOwnerId: profile.owner.ownerId,
      // Discover refresh should finish quickly instead of hanging on dozens of strangers.
      timeoutMs: opts?.force ? 4_000 : undefined,
    });
    lastAtMap.set(peerId, Date.now());
    if (!enriched) {
      emitNearbyProfileProbeFailure(ctx, peerId, opts);
      return;
    }
    ctx.resetNonEnvoyPeerFailCount(peerId);
    // Persist the ownerId→peerId mapping so that sendHello and other
    // outbound operations can resolve the peer later.
    try {
      await ctx.getPeerDirectoryStore().ensurePeerFromInboundChat({
        ownerId: enriched.ownerId,
        peerId: enriched.nodeId,
        listenAddrs: multiaddrs,
      });
    } catch {
      // Non-critical — the events below still reach the UI.
    }
    ctx.emit("profile:updated", { ownerId: enriched.ownerId });
    ctx.emit("peer:discovered", { ...enriched, profileStatus: "resolved" as const });
    // Probe succeeded and a connection is open — fire LAN auto-bond now
    // (gated by cooldown + config inside _maybeFireLanAutoBond).
    void ctx.maybeFireLanAutoBond(peerId);
  } catch (err) {
    console.warn(`[node-service] nearby profile probe failed for ${peerId}:`, err);
    emitNearbyProfileProbeFailure(ctx, peerId, opts);
  } finally {
    inflight.delete(peerId);
  }
}

/**
 * When mDNS rediscovers a peer we already know (bond + peer directory),
 * build a People-nearby card without waiting on profile.request.
 */
async function resolveKnownNearbyPeer(
  ctx: IdentityContext,
  peerId: string,
  selfOwnerId: string,
): Promise<{
  nodeId: string;
  ownerId: string;
  displayName: string;
  username?: string;
  bio?: string;
  interests: string[];
  profileVisibility: "public" | "contacts" | "private";
  discoverySource: "mdns";
} | null> {
  let ownerId: string | undefined;
  try {
    const row = await ctx.getPeerDirectoryStore().getPeerByPeerId(peerId);
    ownerId = row?.ownerId?.trim() || undefined;
  } catch {
    ownerId = undefined;
  }
  const bonds = await ctx.getBonds();
  const bond =
    bonds.find((b) => b.libp2pPeerId === peerId) ??
    (ownerId ? bonds.find((b) => b.peerOwnerId === ownerId) : undefined);
  if (bond?.peerOwnerId?.trim()) {
    ownerId = bond.peerOwnerId.trim();
  }
  if (!ownerId || ownerId === selfOwnerId) {
    return null;
  }
  // Require a bond or a cached profile — directory-only strangers still probe.
  const cache = ctx.getPeerProfileCacheStore();
  const cached = cache ? await cache.get(ownerId).catch(() => undefined) : undefined;
  if (!bond && !cached?.profile) {
    return null;
  }
  const hp = cached?.profile;
  const displayName =
    hp?.displayName?.trim() ||
    bond?.displayName?.trim() ||
    ownerId.replace(/^envoy:owner:/, "").slice(0, 8) ||
    "Contact";
  return {
    nodeId: peerId,
    ownerId,
    displayName,
    username: hp?.username,
    bio: hp?.bio,
    interests: [...(hp?.hobbies ?? []), ...(hp?.knowledge ?? [])],
    profileVisibility: hp?.profileVisibility ?? "public",
    discoverySource: "mdns",
  };
}

/** Keep unresolved LAN peers visible until suppression; then drop them.
 * Background mDNS/DHT probes must NOT emit unreachable cards — that flooded
 * Discover with thousands of "heard on Wi‑Fi" rows. Force refresh still emits
 * so the Refresh button can report a count.
 */
function emitNearbyProfileProbeFailure(
  ctx: IdentityContext,
  peerId: string,
  opts?: { force?: boolean },
): void {
  if (!opts?.force) {
    ctx.markNonEnvoyPeerFailed(peerId);
    if (ctx.isNonEnvoyPeerSuppressed(peerId)) {
      ctx.emit("peer:lost", { nodeId: peerId });
    }
    return;
  }
  // Discover refresh: leave a short-lived unreachable marker for the RPC
  // summary, then the UI snapshot keeps only resolved people.
  ctx.emit("peer:discovered", {
    nodeId: peerId,
    ownerId: "",
    displayName: "",
    interests: [],
    profileVisibility: "public" as const,
    discoverySource: "mdns" as const,
    profileStatus: "unreachable" as const,
  });
}

export async function _broadcastProfileSyncToBonds(
  ctx: IdentityContext,
  humanProfile: HumanProfilePayload,
): Promise<void> {
  if (!humanProfile.publicThumbnail) return;
  const mesh = ctx.reachableMesh();
  if (!mesh) return;
  const profile = ctx.getProfile();
  if (!profile) return;
  const bonds = await ctx.getBonds();
  const bondOwnerIds = bonds.map((b) => b.peerOwnerId);
  if (bondOwnerIds.length === 0) return;

  try {
    await sendProfileSyncToBonds({
      mesh,
      profile,
      humanProfile,
      vaultDir: ctx.getVaultDir() ?? "",
      bondOwnerIds,
      resolveLibp2pPeer: async (ownerId) => {
        const resolved = await ctx.resolveLibp2pPeerForBondOwner(ownerId);
        if (!resolved) return undefined;
        return { peerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
      },
      dialHintsFor: (peerId, listenAddrs) => ctx.dialHintsForChat(peerId, listenAddrs),
    });
  } catch (err) {
    console.warn("[profile.sync] broadcast failed:", err);
  }
}

export async function handleInboundProfileIntentViaRuntime(
  ctx: IdentityContext,
  envelope: EnvoyEnvelope,
  context?: {
    transportPeerId?: string;
    remoteAddr?: string;
    replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
  },
): Promise<boolean> {
  const contactOwnerKeyStore = ctx.getContactOwnerKeyStore();
  const peerProfileCacheStore = ctx.getPeerProfileCacheStore();
  if (!contactOwnerKeyStore || !peerProfileCacheStore) return false;
  await ctx.rememberBondedPeerTransportFromInbound(envelope, context);
  if (
    envelope.intent !== "profile.sync" &&
    envelope.intent !== "profile.response" &&
    envelope.intent !== "profile.request"
  ) {
    return false;
  }
  if (envelope.intent === "profile.request") {
    const transportPeerId = context?.transportPeerId?.trim() ?? "";
    const result = await handleInboundProfileRequest({
      envelope,
      transportPeerId,
      contactOwnerKeyStore,
      loadLocalProfile: async () => ctx.getHumanProfileStore().loadHumanProfile(),
      sendProfileResponse: async (envelopeRecipientPeerId, local, replyTransportPeerId) => {
        const profile = ctx.requireProfile();
        const responseEnvelope = await buildSignedProfilePayloadEnvelope({
          profile,
          humanProfile: local,
          vaultDir: ctx.getVaultDir() ?? "",
          intent: "profile.response",
          recipientPeerId: envelopeRecipientPeerId,
        });
        if (context?.replyWithEnvelope) {
          try {
            await context.replyWithEnvelope(responseEnvelope);
            console.log(
              `[profile.response] replied on inbound stream to ${envelopeRecipientPeerId.slice(0, 16)}…`,
            );
            return;
          } catch (err) {
            console.warn(
              `[profile.response] inbound stream reply failed, dialing outbound:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        const mesh = ctx.requireMesh();
        const records = await ctx.getPeerDirectoryStore().listPeerRecords();
        const rec = records.find((row) => row.peerId === replyTransportPeerId);
        const listenAddrs = rec?.listenAddrs;
        await sendProfileResponse({
          mesh,
          profile,
          humanProfile: local,
          vaultDir: ctx.getVaultDir() ?? "",
          envelopeRecipientPeerId,
          transportPeerId: replyTransportPeerId,
          listenAddrs,
          dialHintsFor: (peerId, addrs) => ctx.dialHintsForChat(peerId, addrs ?? listenAddrs),
        });
      },
    });
    if (result.handled) {
      return true;
    }
    console.warn(`[profile.request] not handled: ${"reason" in result ? result.reason : "unknown"}`);
    return false;
  }
  const result = await handleInboundProfileSync({
    envelope,
    contactOwnerKeyStore,
    peerProfileCache: peerProfileCacheStore,
  });
  if (result.handled) {
    ctx.emit("profile:updated", { ownerId: result.ownerId });
    return true;
  }
  console.warn(`[${envelope.intent}] not handled: ${"reason" in result ? result.reason : "unknown"}`);
  return false;
}

export async function _loadHumanProfileForPhotoUpdate(ctx: IdentityContext): Promise<{
  existing: HumanProfilePayload;
  base: Omit<HumanProfilePayload, "signature">;
}> {
  ctx.assertOnline();
  const existing = await ctx.getHumanProfileStore().loadHumanProfile();
  if (!existing) {
    throw new Error("Create your profile before adding photos");
  }
  const { signature: _s, ...base } = existing;
  return { existing, base: { ...base, updatedAt: new Date().toISOString() } };
}

export async function setPublicProfileThumbnailViaRuntime(
  ctx: IdentityContext,
  params: SetPublicProfileThumbnailParams,
): Promise<HumanProfile> {
  const mime = parseProfilePhotoMime(params.mimeType);
  const imported = await importProfilePhotoBytes({
    vaultDir: ctx.getVaultDir() ?? "",
    relativePath: profileThumbnailVaultPath(mime),
    contentBase64: params.contentBase64,
    mimeType: mime,
    maxBytes: MAX_PROFILE_THUMBNAIL_BYTES,
  });
  const publicThumbnail = ProfilePhotoRefSchema.parse(imported);
  const { base } = await _loadHumanProfileForPhotoUpdate(ctx);
  return _signAndSaveHumanProfile(ctx, { ...base, publicThumbnail });
}

export async function upsertProfileGalleryPhotoViaRuntime(
  ctx: IdentityContext,
  params: UpsertProfileGalleryPhotoParams,
): Promise<HumanProfile> {
  const mime = parseProfilePhotoMime(params.mimeType);
  const visibility = params.visibility as ProfileGalleryPhotoVisibility;
  const { base, existing } = await _loadHumanProfileForPhotoUpdate(ctx);
  const gallery = [...(existing.galleryPhotos ?? [])];
  const photoId = params.photoId?.trim() || undefined;
  const existingIdx = photoId ? gallery.findIndex((p) => p.photoId === photoId) : -1;
  if (gallery.length >= MAX_PROFILE_GALLERY_PHOTOS && existingIdx < 0) {
    throw new Error(`Gallery limit reached (max ${MAX_PROFILE_GALLERY_PHOTOS} photos)`);
  }
  const vaultRelativePath = profileGalleryVaultPath(mime, photoId);
  const imported = await importProfilePhotoBytes({
    vaultDir: ctx.getVaultDir() ?? "",
    relativePath: vaultRelativePath,
    contentBase64: params.contentBase64,
    mimeType: mime,
    maxBytes: MAX_PROFILE_GALLERY_PHOTO_BYTES,
  });
  const entry = ProfileGalleryPhotoSchema.parse({
    ...imported,
    photoId: photoId ?? photoIdFromGalleryPath(vaultRelativePath),
    label: params.label?.trim() || undefined,
    visibility,
  });
  if (existingIdx >= 0) {
    gallery[existingIdx] = entry;
  } else {
    gallery.push(entry);
  }
  return _signAndSaveHumanProfile(ctx, { ...base, galleryPhotos: gallery });
}

export async function removeProfileGalleryPhotoViaRuntime(
  ctx: IdentityContext,
  params: { vaultRelativePath: string },
): Promise<HumanProfile> {
  const path = params.vaultRelativePath.trim().replace(/^[\\/]+/, "");
  const { base, existing } = await _loadHumanProfileForPhotoUpdate(ctx);
  const gallery = (existing.galleryPhotos ?? []).filter((p) => p.vaultRelativePath !== path);
  if (gallery.length === (existing.galleryPhotos ?? []).length) {
    throw new Error("Gallery photo not found on profile");
  }
  return _signAndSaveHumanProfile(ctx, { ...base, galleryPhotos: gallery });
}

export async function updateProfileGalleryPhotoVisibilityViaRuntime(
  ctx: IdentityContext,
  params: UpdateProfileGalleryPhotoVisibilityParams,
): Promise<HumanProfile> {
  const path = params.vaultRelativePath.trim().replace(/^[\\/]+/, "");
  const visibility = params.visibility as ProfileGalleryPhotoVisibility;
  const { base, existing } = await _loadHumanProfileForPhotoUpdate(ctx);
  const gallery = (existing.galleryPhotos ?? []).map((p) =>
    p.vaultRelativePath === path ? { ...p, visibility } : p,
  );
  if (!gallery.some((p) => p.vaultRelativePath === path)) {
    throw new Error("Gallery photo not found on profile");
  }
  return _signAndSaveHumanProfile(ctx, { ...base, galleryPhotos: gallery });
}

export async function getAgentIdentityViaRuntime(ctx: IdentityContext): Promise<AgentIdentityDocument> {
  const store = ctx.getAgentIdentityStore();
  if (!store) {
    throw new Error("Profile directory not initialized");
  }
  return store.load();
}

export async function updateAgentIdentityViaRuntime(
  ctx: IdentityContext,
  content: string,
): Promise<AgentIdentityDocument> {
  ctx.assertOnline();
  const store = ctx.getAgentIdentityStore();
  if (!store) {
    throw new Error("Profile directory not initialized");
  }
  return store.save(content);
}

export async function _signAndSaveHumanProfile(
  ctx: IdentityContext,
  payload: Omit<HumanProfilePayload, "signature">,
): Promise<HumanProfile> {
  const selfProfile = ctx.requireProfile();
  const signedProfile = signHumanProfile(payload, selfProfile.owner.privateKeyPem);
  await raceWithTimeout(
    ctx.getHumanProfileStore().saveHumanProfile(signedProfile),
    15_000,
    "saveHumanProfile",
  );
  void _broadcastProfileSyncToBonds(ctx, signedProfile).catch((err) => {
    console.warn("[profile.sync] broadcast failed:", err);
  });
  return signedProfile as HumanProfile;
}

export async function _applyProfileDiscoveryAdvertising(
  ctx: IdentityContext,
  input: {
    profileVisibility: HumanProfilePayload["profileVisibility"];
    isPublicNetwork: boolean;
    interests: string[];
    username: string;
    displayName: string;
    locationTopics: string[];
    capabilityTopics: string[];
  },
): Promise<void> {
  console.log(
    `[node-service] Checking DHT advertising: visibility=${input.profileVisibility}, isPublicNetwork=${input.isPublicNetwork}, interests=${JSON.stringify(input.interests)}, locationTopics=${JSON.stringify(input.locationTopics)}, capabilityTopics=${JSON.stringify(input.capabilityTopics)}`,
  );
  if (input.profileVisibility === "public" && input.isPublicNetwork) {
    await _advertisePublicDiscoveryTopics(ctx, {
      interests: input.interests,
      username: input.username,
      displayName: input.displayName,
      locationTopics: input.locationTopics,
      capabilityTopics: input.capabilityTopics,
    });
    // Keep relay.checkin identity scope in sync with DHT (profile edits,
    // interest removals, username/displayname changes). Without this,
    // NAT peers using relay.lookup keep stale topicHashes until restart.
    const interests = input.interests.map((s) => interestTopicFor(s)).filter(Boolean);
    const username = input.username.toLowerCase().trim();
    const usernameTopic = username ? `username:${username}` : "";
    const displayNameTopic = input.displayName
      ? displayNameTopicFor(input.displayName)
      : undefined;
    const allTopics = [
      ...interests,
      ...(usernameTopic ? [usernameTopic] : []),
      ...(displayNameTopic ? [displayNameTopic] : []),
      ...input.locationTopics,
      ...input.capabilityTopics,
    ];
    void ctx.notifyAdvertisedDiscoveryTopics?.(allTopics);
  } else {
    await _cancelAutoAdvertisedDiscoveryTopics(ctx);
    void ctx.notifyAdvertisedDiscoveryTopics?.([]);
  }
}

export async function _cancelDiscoveryTopics(ctx: IdentityContext, topics: string[]): Promise<void> {
  if (topics.length === 0) return;
  const mesh = ctx.getMesh() ?? ctx.getExternalMesh();
  if (!mesh) return;
  for (const topic of topics) {
    try {
      await raceWithTimeout(
        mesh.cancelCapabilityTopicReprovide(topic),
        DISCOVERY_TOPIC_OP_TIMEOUT_MS,
        `cancelCapabilityTopicReprovide(${topic})`,
      );
      console.log(`[node-service] Cancelled DHT topic: ${topic}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[node-service] Failed to cancel topic "${topic}": ${msg}`);
    }
  }
}

export async function _cancelAutoAdvertisedDiscoveryTopics(ctx: IdentityContext): Promise<void> {
  const removed = [...ctx.getAutoAdvertisedDiscoveryTopics()];
  ctx.setAutoAdvertisedDiscoveryTopics([]);
  const timer = ctx.getAdvertiseInterestsTimer();
  if (timer) {
    clearInterval(timer);
    ctx.setAdvertiseInterestsTimer(undefined);
  }
  await _cancelDiscoveryTopics(ctx, removed);
}

export async function _syncProfileCapabilitiesToManifest(
  ctx: IdentityContext,
  previousProfileTags: string[],
  nextProfileTags: string[],
): Promise<void> {
  const capabilityManifestStore = ctx.getCapabilityManifestStore();
  if (!capabilityManifestStore) {
    return;
  }
  if (previousProfileTags.length === 0 && nextProfileTags.length === 0) {
    return;
  }
  let manifest = await capabilityManifestStore.loadManifest();
  if (!manifest) {
    manifest = await capabilityManifestStore.createDefaultManifest();
  }
  const { capabilities, changed } = syncProfileTagsToManifestCapabilities({
    manifestCapabilities: manifest.capabilities,
    previousProfileTags,
    nextProfileTags,
  });
  if (!changed) {
    return;
  }
  await capabilityManifestStore.saveManifest({
    ...manifest,
    capabilities,
    updatedAt: new Date().toISOString(),
  });
}

export async function _advertisePublicDiscoveryTopics(
  ctx: IdentityContext,
  input: {
    interests: string[];
    username: string;
    displayName: string;
    locationTopics: string[];
    capabilityTopics?: string[];
  },
): Promise<void> {
  const topicSet = new Set<string>();
  for (const interest of input.interests) {
    // Defensively route through `interestTopicFor` so callers can pass
    // either raw hobbies ("music") OR pre-normalized topics
    // ("interest:music"). The production call site
    // (`computePublicDiscoveryTopics`) already pre-normalizes, so this
    // is a no-op for it. But tests + future callers can pass raw
    // values and still get the right on-wire topic. Without this
    // guard, the search side looks up "interest:music" via
    // `interestTopicFor` while the advertise side publishes "music",
    // and the two never meet.
    const topic = interestTopicFor(interest);
    if (topic) topicSet.add(topic);
  }
  topicSet.add(`username:${input.username.toLowerCase()}`);
  // Publish the display name as its own topic so name-based search can find
  // humans by what they call themselves in the UI, not just by their @handle.
  // The search side (node-service-discovery) routes raw query text through
  // the same `displayNameTopicFor` helper, so advertise and search agree.
  // `displayName` is optional (some test fixtures + a future "username
  // only" profile variant won't have one) — skip if missing.
  if (input.displayName) {
    const dnTopic = displayNameTopicFor(input.displayName);
    if (dnTopic) topicSet.add(dnTopic);
  }
  for (const geo of input.locationTopics) {
    topicSet.add(geo);
  }
  for (const capability of input.capabilityTopics ?? []) {
    topicSet.add(capability);
  }
  const allTopics = [...topicSet];

  const autoTopics = ctx.getAutoAdvertisedDiscoveryTopics();
  const removed = autoTopics.filter((topic) => !topicSet.has(topic));
  await _cancelDiscoveryTopics(ctx, removed);
  ctx.setAutoAdvertisedDiscoveryTopics(allTopics);

  const existingTimer = ctx.getAdvertiseInterestsTimer();
  if (existingTimer) {
    clearInterval(existingTimer);
    ctx.setAdvertiseInterestsTimer(undefined);
  }
  // A new call is a full restart of the schedule. If a previous retry was
  // hung on slow DHT provides, its async work may still be running in the
  // background — reset the in-flight flag so the new retry loop isn't
  // permanently blocked. The orphaned retry's reschedule check uses a stale
  // handle comparison (ctx.getAdvertiseInterestsTimer() !== itsHandle) and
  // will therefore not interfere with the new schedule.
  let retryInFlight = false;

  const advertisedTopics: string[] = [];
  let allSuccess = true;

  const advertiseOnce = async (topic: string): Promise<boolean> => {
    try {
      // provideCapabilityTopic now returns { timedOut } so we can
      // distinguish "put landed" from "put stalled waiting for DHT peers"
      // instead of just trusting the unconditional "Successfully
      // advertised" log. The outer raceWithTimeout is kept as a hard
      // safety net in case the inner race swallows something else.
      const result = await raceWithTimeout(
        ctx.requireMesh().provideCapabilityTopic(topic),
        DISCOVERY_TOPIC_OP_TIMEOUT_MS,
        `provideCapabilityTopic(${topic})`,
      );
      if (result.timedOut) {
        console.warn(
          `[node-service] advertiseTopic "${topic}" TIMED OUT — ` +
          `DHT likely has no reachable peers. Will retry next cycle.`,
        );
        return false;
      }
      console.log(`[node-service] Successfully advertised topic: ${topic}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[node-service] Failed to advertise topic "${topic}": ${msg}`);
      return false;
    }
  };

  // Cycle-level gate: if the DHT route table is empty from this node's
  // perspective, every `provide()` call below would hang for its full
  // 30 s timeout (no peers to receive the records). One CLEAR summary
  // per cycle is far better than 16 individual "provide timeout" lines
  // that say nothing actionable. We use `connectedPeerIds` rather than
  // the full peer-store because what we care about is "is there a peer
  // available to write through right now" — pending-bootstrap entries
  // don't count.
  //
  // Threshold: 2+ connected peers (1 is almost certainly the configured
  // relay; we need at least one more to route the provide record
  // through). This matches the user's 2026-07-10 symptom:
  // `[node-stats] totalPeers=1 relayRoster=1` produced 16 per-topic
  // timeouts every retry cycle against the community relay.
  // Threshold: skip DHT provide only when *zero* peers are connected.
  // Previously required 2+ (assuming 1 = community relay alone and DHT
  // was useless). On a home Mac behind NAT with only the cloud relay
  // connected, that skipped *all* provides forever — and topics never
  // landed even for relay-roster fallback timing. With ≥1 peer we still
  // attempt provide (may time out); relay-roster notify runs regardless.
  const connectedPeers = ctx.requireMesh().getConnectedPeerIds();
  const skipPublishThisCycle = connectedPeers.length < 1;
  if (skipPublishThisCycle) {
    console.warn(
      `[node-service] Discovery advertise cycle: no peers connected. ` +
      `Skipping ${allTopics.length} DHT topic publishes this cycle. ` +
      `Relay-roster advertisements are still updated so relay.lookup can work once a relay is dialable.`,
    );
  }

  // Advertise all topics concurrently — bounded by DISCOVERY_TOPIC_OP_TIMEOUT_MS
  // (60s) per topic. With 8 topics in parallel, the worst case for this
  // initial fan-out is ~60s instead of ~8 × 60s sequentially.
  const results = skipPublishThisCycle
    ? new Array<boolean>(allTopics.length).fill(false)
    : await Promise.all(allTopics.map((topic) => advertiseOnce(topic)));
  for (let i = 0; i < allTopics.length; i++) {
    if (results[i]) {
      advertisedTopics.push(allTopics[i]);
    } else {
      allSuccess = false;
    }
  }

  ctx.emit("discovery:advertising-complete", { topics: advertisedTopics, success: allSuccess });

  // Adaptive periodic re-advertisement.
  //
  // Previous behaviour: `setInterval(retry, 5 * 60_000)` with a SEQUENTIAL
  // `for` loop. With 8 topics × 30s timeout each, one full retry took up to
  // 4 minutes; combined with the 5-minute interval, an effective ~9-minute
  // gap between attempts when every topic was failing. Once the DHT
  // eventually came up, it took another full cycle before it was visible.
  //
  // New behaviour:
  // 1. Run all topics in parallel — total retry time = max(per-topic timeout)
  //    instead of sum(per-topic timeouts). With the bumped 60s timeout,
  //    one retry cycle is now bounded to ~60s.
  // 2. Self-rescheduling `setTimeout` (not `setInterval`) so we can pick
  //    the next interval based on the result of THIS attempt:
  //    - any topic failed → DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS (60s)
  //    - all topics succeeded → DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS (5 min)
  // 3. `inFlight` guard prevents overlapping cycles when a slow retry collides
  //    with the next scheduled tick. setInterval had no such guard and could
  //    fire the callback again while the previous one was still running.
  //
  // The timer handle is stored under the same `getAdvertiseInterestsTimer`
  // slot so existing stopNode / profile-change cleanup paths still work.
  // Adaptive periodic re-advertisement with exponential backoff on
  // consecutive failure cycles.
  //
  // Previous behaviour: 60s if any topic failed, 5 min if all succeeded —
  // binary, no growth. On a loaded community DHT this hammers the network
  // with 11+ parallel provides every minute indefinitely, never slowing.
  // (Symptoms: `[p2p] provideCapabilityTopic: provide timeout for <topic>`
  // repeats dominate the log.)
  //
  // New behaviour: each retry cycle that fails (any topic) doubles the
  // next-cycle delay, capped at the healthy interval (5 min). A single
  // all-success cycle resets the counter. So:
  //   cycle N: failure → next = 60s
  //   cycle N+1: failure → next = 120s
  //   cycle N+2: failure → next = 240s
  //   ...
  //   cycle N+k: failure → next = min(60s * 2^k, 5min)
  //   any cycle where all topics succeed → counter resets, next = 5 min.
  //
  // A recovered DHT is still picked up within one 5-min ceiling window; an
  // unavailable DHT no longer floods the network or pins the timeout timer.
  let consecutiveFailureCycles = allSuccess ? 0 : 1;
  const computeNextDelay = (hadAnyFailure: boolean): number => {
    if (!hadAnyFailure) {
      consecutiveFailureCycles = 0;
      return DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS;
    }
    consecutiveFailureCycles += 1;
    // 60s, 120s, 240s, ..., cap at BACKOFF_MAX (= HEALTHY). After ~6
    // failures we're already at the ceiling, so this doesn't grow without
    // bound.
    const proposed = DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS * 2 ** (consecutiveFailureCycles - 1);
    return Math.min(proposed, DISCOVERY_ADVERTISE_RETRY_BACKOFF_MAX_MS);
  };

  const scheduleRetry = (delayMs: number): ReturnType<typeof setTimeout> => {
    const handle = setTimeout(() => {
      if (retryInFlight) return;
      retryInFlight = true;
      void (async () => {
        try {
          const results = await Promise.all(allTopics.map((topic) => advertiseOnce(topic)));
          const allOk = results.every((ok) => ok);
          if (allOk) {
            if (consecutiveFailureCycles > 0) {
              // First successful cycle after a streak of failures — useful
              // recovery signal in the log without adding per-cycle noise.
              console.log(
                `[node-service] All topics successfully advertised after ${consecutiveFailureCycles} failed cycle(s); backoff reset.`,
              );
            } else {
              console.log("[node-service] All topics successfully advertised on retry");
            }
          } else if (consecutiveFailureCycles >= 3) {
            // Once we're well into the backoff curve, drop the per-topic
            // WARN to a single cycle-summary line — otherwise the log is
            // a wall of identical `[p2p] provideCapabilityTopic: provide
            // timeout for <topic>` entries every cycle, drowning out
            // operator-relevant messages.
            const failedCount = results.filter((ok) => !ok).length;
            console.warn(
              `[node-service] Discovery advertise cycle: ${failedCount}/${allTopics.length} topics timed out. ` +
              `Backoff streak: ${consecutiveFailureCycles} cycle(s); next attempt in ` +
              `${Math.round(
                Math.min(
                  DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS * 2 ** consecutiveFailureCycles,
                  DISCOVERY_ADVERTISE_RETRY_BACKOFF_MAX_MS,
                ) / 1000,
              )}s.`,
            );
          }
          // Re-schedule based on this attempt's outcome. If the timer was
          // cleared by stopNode / a profile change, ctx.getAdvertiseInterestsTimer()
          // will not match `handle` anymore and we won't loop.
          if (ctx.getAdvertiseInterestsTimer() === handle) {
            const nextDelay = computeNextDelay(!allOk);
            ctx.setAdvertiseInterestsTimer(scheduleRetry(nextDelay));
          }
        } finally {
          retryInFlight = false;
        }
      })();
    }, delayMs);
    return handle;
  };
  // First retry delay matches the initial fan-out outcome: if the initial
  // attempt already failed (DHT not ready, slow bootstrap, etc.), don't wait
  // the full 5-minute healthy interval before trying again — switch straight
  // to the fast backoff so a freshly-bootstrapped DHT is picked up promptly.
  const firstRetryDelay = allSuccess
    ? DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS
    : DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS;
  ctx.setAdvertiseInterestsTimer(scheduleRetry(firstRetryDelay));
}

/** @deprecated Use `_advertisePublicDiscoveryTopics` — kept as alias for tests. */
export async function _advertiseInterests(
  ctx: IdentityContext,
  interests: string[],
  username: string,
  displayName: string = "",
): Promise<void> {
  return _advertisePublicDiscoveryTopics(ctx, {
    interests,
    username,
    displayName,
    locationTopics: [],
  });
}

/**
 * Compute the topic strings published for a profile under wan-default discovery
 * (interests + username + location + capability tags). Used by both DHT
 * (`provideCapabilityTopic`) and relay-checkin advertising.
 */
export function computePublicDiscoveryTopics(profile: {
  hobbies?: string[];
  knowledge?: string[];
  username?: string;
  discoveryLocation?: unknown;
  discoveryLocationPrecision?: "country" | "region" | "city" | "town" | "hidden" | "nearby" | string | null;
  capabilities?: ReadonlyArray<{ tag?: string } | { type?: string } | { descriptor?: string }>;
}): { interests: string[]; usernameTopic: string; locationTopics: string[]; capabilityTopics: string[] } {
  // Normalize hobbies + knowledge into the canonical `interest:<slug>` topic
  // vocabulary. This MUST match the search-side normalization in
  // NodeDiscoveryRuntime.searchPeers (which also routes raw interests through
  // `interestTopicFor`) so advertise and search agree on the on-wire topic.
  const interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])]
    .map((s) => interestTopicFor(s))
    .filter(Boolean);
  const username = (profile.username ?? "").toLowerCase().trim();
  const usernameTopic = username ? `username:${username}` : "";
  const locationTopics = deriveLocationDiscoveryTopics({
    location: profile.discoveryLocation as Parameters<typeof deriveLocationDiscoveryTopics>[0]["location"],
    precision: (profile.discoveryLocationPrecision ?? undefined) as
      | Parameters<typeof deriveLocationDiscoveryTopics>[0]["precision"],
  });
  const capabilitiesForTags = (profile.capabilities ?? []).map((c) => ({
    tag: "tag" in c && typeof c.tag === "string" ? c.tag : "",
  }));
  const capabilityTags = profileCapabilityTags(
    capabilitiesForTags as Parameters<typeof profileCapabilityTags>[0],
  );
  const capabilityTopics = profileCapabilityDiscoveryTopics(capabilityTags);
  return { interests, usernameTopic, locationTopics, capabilityTopics };
}

export async function _advertiseInterestsIfPublic(ctx: IdentityContext): Promise<void> {
  // CLI path sets _externalMesh (via bindExternalMesh) while Tauri/mobile
  // path sets _mesh. Use either as the readiness signal.
  if (!ctx.getMesh() && !ctx.getExternalMesh()) return;
  const config = await ctx.getConfigStore().load();
  const profile = await ctx.getHumanProfileStore().loadHumanProfile();
  if (!config || !profile) return;

  const isPublicNetwork = (config.bootstrapPresets && config.bootstrapPresets.length > 0) ||
    (config.bootstrapPeers && config.bootstrapPeers.length > 0);
  console.log(
    `[advertiseInterests] visibility=${profile.profileVisibility} presets=${config.bootstrapPresets?.length ?? 0} peers=${config.bootstrapPeers?.length ?? 0} isPublicNetwork=${isPublicNetwork}`,
  );
  if (profile.profileVisibility === "public" && isPublicNetwork) {
    const { interests, usernameTopic, locationTopics, capabilityTopics } =
      computePublicDiscoveryTopics(profile);
    const username = (profile.username ?? "").toLowerCase();

    const displayNameTopic = profile.displayName ? displayNameTopicFor(profile.displayName) : undefined;
    const allTopics = [
      ...interests,
      ...(usernameTopic ? [usernameTopic] : []),
      ...(displayNameTopic ? [displayNameTopic] : []),
      ...locationTopics,
      ...capabilityTopics,
    ];
    console.log(
      `[advertiseInterests] advertising ${allTopics.length} topic(s): ${allTopics.slice(0, 5).join(", ")}${allTopics.length > 5 ? "…" : ""}`,
    );

    await _advertisePublicDiscoveryTopics(ctx, {
      interests,
      username: profile.username,
      displayName: profile.displayName,
      locationTopics,
      capabilityTopics,
    });

    void _registerWithRendezvousServers(ctx, interests, profile.username);
    // Notify any active relay checkins of the new topic set so the relay
    // server's roster (indexed by topicHash) reflects the current profile.
    // Include the displayName topic so relay.lookup by name works.
    void ctx.notifyAdvertisedDiscoveryTopics?.(allTopics);
  } else {
    console.log(
      `[advertiseInterests] SKIPPED — visibility=${profile.profileVisibility} isPublicNetwork=${isPublicNetwork}; clearing advertised topics`,
    );
    await _cancelAutoAdvertisedDiscoveryTopics(ctx);
    void ctx.notifyAdvertisedDiscoveryTopics?.([]);
  }
}

export async function _registerWithRendezvousServers(
  ctx: IdentityContext,
  interests: string[],
  username: string,
): Promise<void> {
  const mesh = ctx.getMesh() ?? ctx.getExternalMesh();
  if (!mesh) return;
  const profileForRendezvous = ctx.getProfile();
  if (!profileForRendezvous) {
    return;
  }

  const config = await ctx.getConfigStore().load();

  const capabilities = interests.map((interest) => ({ tag: interest.toLowerCase() }));
  capabilities.push({ tag: `username:${username.toLowerCase()}` });

  const relayAddrs: string[] = [];

  if (config?.configuredRelays) {
    for (const relay of config.configuredRelays) {
      if (relay.enabled && relay.addr) {
        relayAddrs.push(relay.addr);
      }
    }
  }

  if (config?.bootstrapPresets) {
    for (const preset of config.bootstrapPresets) {
      if (preset === "cn-relay") {
        relayAddrs.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
      }
    }
  }

  if (config?.bootstrapPeers) {
    for (const peer of config.bootstrapPeers) {
      // Only real relay/bootstrap multiaddrs — never sponsor /p2p-circuit/
      // dial hints or RFC1918 listens that WAN join invites may have merged in.
      if (isBootstrapRelayMultiaddr(peer) && !relayAddrs.includes(peer)) {
        relayAddrs.push(peer);
      }
    }
  }

  if (relayAddrs.length === 0) {
    console.log("[node-service] No relays configured for rendezvous registration");
    return;
  }

  console.log(`[node-service] Registering capabilities with ${relayAddrs.length} relay(s)`);

  const MAX_RETRIES = 3;
  const BASE_TIMEOUT_MS = 15000;

  for (const relayAddr of relayAddrs) {
    let success = false;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        console.log(
          `[node-service] Registering with rendezvous server: ${relayAddr} (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );

        const envelope = signUnsignedEnvelope(
          createUnsignedEnvelope({
            senderPeerId: mesh.peerId,
            senderPublicKey: profileForRendezvous.device.publicKeyPem,
            recipientPeerId: relayAddr,
            intent: "rendezvous.register",
            payload: createRendezvousRegisterPayload({
              peerId: mesh.peerId,
              multiaddr: mesh.multiaddrs[0] ?? `/p2p/${mesh.peerId}`,
              capabilities,
              ttlSeconds: 3600,
            }),
          }),
          profileForRendezvous.device.privateKeyPem,
        );

        await sendExpectReplyWithRetry({
          mesh,
          transportPeerId: relayAddr,
          envelope,
          dialHints: dialHintsForTransportTarget(relayAddr),
          timeoutMs: BASE_TIMEOUT_MS * Math.pow(2, attempt),
        });
        console.log(`[node-service] Successfully registered with relay ${relayAddr}`);
        success = true;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[node-service] Failed to register with relay ${relayAddr} (attempt ${attempt + 1}/${MAX_RETRIES}):`,
          lastError.message,
        );

        if (!success && attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, BASE_TIMEOUT_MS * Math.pow(2, attempt)));
        }
      }
    }

    if (!success) {
      console.warn(
        `[node-service] All ${MAX_RETRIES} attempts failed for relay ${relayAddr}: ${lastError?.message}`,
      );
    }
  }
}

export async function syncProfileToBondsViaRuntime(ctx: IdentityContext): Promise<void> {
  const hp = await getHumanProfileViaRuntime(ctx);
  if (hp) await _broadcastProfileSyncToBonds(ctx, hp);
}
