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
import { raceWithTimeout } from "./node-service-outbound-messaging.js";
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

export const DISCOVERY_TOPIC_OP_TIMEOUT_MS = 10_000;
export const NEARBY_PROFILE_PROBE_COOLDOWN_MS = 30_000;
export const BOND_WARM_MAX_CONNECTIONS = 64;

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
  refreshCapabilityIndex(): Promise<void>;
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
    refreshCapabilityIndex: () => host.refreshCapabilityIndex(),
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
  const persistedConfig = await ctx.getConfigStore().load();
  // First-run setup writes node-config.json before libp2p is up; allow profile save then.
  if (!persistedConfig) {
    ctx.assertOnline();
  }
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
  const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
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
  if (mesh && mesh.getConnectionStats().totalConnections >= BOND_WARM_MAX_CONNECTIONS) {
    console.warn(
      `[profile] refreshBondPeerProfiles skipped: ${mesh.getConnectionStats().totalConnections} open libp2p connections`,
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
  void ctx.refreshCapabilityIndex().catch((err) => {
    console.warn("[chain] refreshCapabilityIndex after bond refresh failed:", err);
  });
  return { requested, failed };
}

export async function _probeNearbyPeerProfileAfterDiscovery(
  ctx: IdentityContext,
  peerId: string,
  multiaddrs: string[],
): Promise<void> {
  const mesh = ctx.getMesh();
  const profile = ctx.getProfile();
  const contactOwnerKeyStore = ctx.getContactOwnerKeyStore();
  const peerProfileCacheStore = ctx.getPeerProfileCacheStore();
  if (!mesh || !profile || !contactOwnerKeyStore || !peerProfileCacheStore) {
    return;
  }
  if (peerId === mesh.peerId) {
    return;
  }
  const lastAtMap = ctx.getNearbyProfileProbeLastAt();
  const inflight = ctx.getNearbyProfileProbeInflight();
  const lastAt = lastAtMap.get(peerId) ?? 0;
  if (Date.now() - lastAt < NEARBY_PROFILE_PROBE_COOLDOWN_MS) {
    return;
  }
  if (inflight.has(peerId)) {
    return;
  }
  inflight.add(peerId);
  try {
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
    });
    lastAtMap.set(peerId, Date.now());
    if (!enriched) {
      return;
    }
    ctx.emit("profile:updated", { ownerId: enriched.ownerId });
    ctx.emit("peer:discovered", enriched);
  } catch (err) {
    console.warn(`[node-service] nearby profile probe failed for ${peerId}:`, err);
  } finally {
    inflight.delete(peerId);
  }
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
      locationTopics: input.locationTopics,
      capabilityTopics: input.capabilityTopics,
    });
  } else {
    await _cancelAutoAdvertisedDiscoveryTopics(ctx);
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
    locationTopics: string[];
    capabilityTopics?: string[];
  },
): Promise<void> {
  const topicSet = new Set<string>();
  for (const interest of input.interests) {
    topicSet.add(interest.toLowerCase());
  }
  topicSet.add(`username:${input.username.toLowerCase()}`);
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

  const advertisedTopics: string[] = [];
  let allSuccess = true;

  const advertiseOnce = async (topic: string): Promise<boolean> => {
    try {
      await raceWithTimeout(
        ctx.requireMesh().provideCapabilityTopic(topic),
        DISCOVERY_TOPIC_OP_TIMEOUT_MS,
        `provideCapabilityTopic(${topic})`,
      );
      console.log(`[node-service] Successfully advertised topic: ${topic}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[node-service] Failed to advertise topic "${topic}": ${msg}`);
      return false;
    }
  };

  for (const topic of allTopics) {
    const success = await advertiseOnce(topic);
    if (success) {
      advertisedTopics.push(topic);
    } else {
      allSuccess = false;
    }
  }

  ctx.emit("discovery:advertising-complete", { topics: advertisedTopics, success: allSuccess });

  const timer = setInterval(async () => {
    console.log(`[node-service] Periodic re-advertisement for ${allTopics.length} topics...`);
    let retrySuccess = true;
    for (const topic of allTopics) {
      const success = await advertiseOnce(topic);
      if (!success) retrySuccess = false;
    }
    if (retrySuccess) {
      console.log(`[node-service] All topics successfully advertised on retry`);
    }
  }, 5 * 60 * 1000);
  ctx.setAdvertiseInterestsTimer(timer);
}

/** @deprecated Use `_advertisePublicDiscoveryTopics` — kept as alias for tests. */
export async function _advertiseInterests(
  ctx: IdentityContext,
  interests: string[],
  username: string,
): Promise<void> {
  return _advertisePublicDiscoveryTopics(ctx, { interests, username, locationTopics: [] });
}

export async function _advertiseInterestsIfPublic(ctx: IdentityContext): Promise<void> {
  if (!ctx.getMesh()) return;
  const config = await ctx.getConfigStore().load();
  const profile = await ctx.getHumanProfileStore().loadHumanProfile();
  if (!config || !profile) return;

  const isPublicNetwork = config.bootstrapPresets && config.bootstrapPresets.length > 0;
  if (profile.profileVisibility === "public" && isPublicNetwork) {
    const interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];
    const locationTopics = deriveLocationDiscoveryTopics({
      location: profile.discoveryLocation,
      precision: profile.discoveryLocationPrecision,
    });
    const capabilityTopics = profileCapabilityDiscoveryTopics(
      profileCapabilityTags(profile.capabilities),
    );

    await _advertisePublicDiscoveryTopics(ctx, {
      interests,
      username: profile.username,
      locationTopics,
      capabilityTopics,
    });

    void _registerWithRendezvousServers(ctx, interests, profile.username);
  } else {
    await _cancelAutoAdvertisedDiscoveryTopics(ctx);
  }
}

export async function _registerWithRendezvousServers(
  ctx: IdentityContext,
  interests: string[],
  username: string,
): Promise<void> {
  const mesh = ctx.getMesh();
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
      if (peer.includes("/p2p/") && !relayAddrs.includes(peer)) {
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
