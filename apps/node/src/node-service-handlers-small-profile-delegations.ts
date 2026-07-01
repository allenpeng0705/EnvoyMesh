/**
 * Small profile + DID delegation methods (Step 47).
 *
 * Extracted from `node-service-impl.ts`. Owns 4 small public
 * methods that wrap store reads/writes:
 *   - cacheDidContactKey (10 lines)
 *   - setPublicProfileThumbnail (12 lines)
 *   - getAgentIdentity (4 lines)
 *   - updateAgentIdentity (6 lines)
 *
 * The class methods collapse to 1-line delegations.
 */
import {
  importProfilePhotoBytes,
  parseProfilePhotoMime,
  profileThumbnailVaultPath,
} from "./profile-photo.js";
import {
  MAX_PROFILE_THUMBNAIL_BYTES,
  type AgentIdentityDocument,
  type HumanProfile,
  type SetPublicProfileThumbnailParams,
} from "@envoymesh/api";
import { ProfilePhotoRefSchema } from "@envoymesh/protocol";
import type { ContactOwnerKeyStore } from "@envoymesh/local-store";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SmallProfileDelegationsContext {
  /** Contact-owner-key store (or undefined if not initialised). */
  getContactOwnerKeyStore(): ContactOwnerKeyStore | undefined;
  /** Local vault dir. */
  getVaultDir(): string | null;
  /** Sign + save the updated human profile. */
  signAndSaveHumanProfile(update: { publicThumbnail?: unknown; galleryPhotos?: unknown[]; [key: string]: unknown }): Promise<HumanProfile>;
  /** Load the human profile for a photo update (returns base + existing). */
  loadHumanProfileForPhotoUpdate(): Promise<{ base: any; existing: any }>;
  /** Agent identity store (or undefined if not initialised). */
  getAgentIdentityStore(): {
    load(): Promise<AgentIdentityDocument>;
    save(content: string): Promise<AgentIdentityDocument>;
  } | undefined;
  /** Assert that the node is online. */
  assertOnline(): void;
}

export async function cacheDidContactKeyViaRuntime(
  ctx: SmallProfileDelegationsContext,
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

export async function setPublicProfileThumbnailViaRuntime(
  ctx: SmallProfileDelegationsContext,
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
  const { base } = await ctx.loadHumanProfileForPhotoUpdate();
  return ctx.signAndSaveHumanProfile({ ...base, publicThumbnail });
}

export async function getAgentIdentityViaRuntime(
  ctx: SmallProfileDelegationsContext,
): Promise<AgentIdentityDocument> {
  const store = ctx.getAgentIdentityStore();
  if (!store) {
    throw new Error("Profile directory not initialized");
  }
  return store.load();
}

export async function updateAgentIdentityViaRuntime(
  ctx: SmallProfileDelegationsContext,
  content: string,
): Promise<AgentIdentityDocument> {
  ctx.assertOnline();
  const store = ctx.getAgentIdentityStore();
  if (!store) {
    throw new Error("Profile directory not initialized");
  }
  return store.save(content);
}