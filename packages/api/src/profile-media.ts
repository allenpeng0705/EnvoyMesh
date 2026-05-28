import type { BondLevel } from "./bond-trust-rank.js";

export const PROFILE_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ProfilePhotoMime = (typeof PROFILE_PHOTO_MIME_TYPES)[number];

/** Owner-signed reference to a vault image (bytes are not inlined in the profile). */
export interface ProfilePhotoRef {
  vaultRelativePath: string;
  contentSha256: string;
  mimeType: ProfilePhotoMime;
}

/** Gallery photo visibility — thumbnail uses {@link ProfilePhotoRef} on `publicThumbnail` and is always public. */
export type ProfileGalleryPhotoVisibility = "public" | "referred" | "direct";

export interface ProfileGalleryPhoto extends ProfilePhotoRef {
  photoId: string;
  label?: string;
  visibility: ProfileGalleryPhotoVisibility;
}

export const MAX_PROFILE_THUMBNAIL_BYTES = 512 * 1024;
export const MAX_PROFILE_GALLERY_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_GALLERY_PHOTOS = 12;

const VISIBILITY_RANK: Record<ProfileGalleryPhotoVisibility, number> = {
  public: 0,
  referred: 1,
  direct: 2,
};

export interface ProfileMediaPolicy {
  /** Agent may share gallery photos (never applies to the always-public thumbnail metadata). */
  allowAgentShareGalleryPhotos: boolean;
  maxAutonomousShareTier: 0 | 1 | 2;
  autonomousShareBondLevels: BondLevel[];
  /** Minimum visibility label on a gallery item before the agent may share it autonomously. */
  autonomousShareMinVisibility: ProfileGalleryPhotoVisibility;
}

export const DEFAULT_PROFILE_MEDIA_POLICY: ProfileMediaPolicy = {
  allowAgentShareGalleryPhotos: false,
  maxAutonomousShareTier: 0,
  autonomousShareBondLevels: ["direct"],
  autonomousShareMinVisibility: "direct",
};

export function normalizeProfileMediaPolicy(partial?: Partial<ProfileMediaPolicy>): ProfileMediaPolicy {
  const tier = partial?.maxAutonomousShareTier;
  const minVis = partial?.autonomousShareMinVisibility;
  return {
    allowAgentShareGalleryPhotos: partial?.allowAgentShareGalleryPhotos === true,
    maxAutonomousShareTier: tier === 1 || tier === 2 ? tier : 0,
    autonomousShareBondLevels:
      partial?.autonomousShareBondLevels?.length ? [...partial.autonomousShareBondLevels] : ["direct"],
    autonomousShareMinVisibility:
      minVis === "public" || minVis === "referred" ? minVis : "direct",
  };
}

const BOND_RANK: Record<BondLevel, number> = {
  blocked: -1,
  public: 0,
  referred: 1,
  direct: 2,
};

/** Whether a viewer bond may see a gallery photo (not used for public thumbnail). */
/** Map gallery visibility to share.request sensitivity (UI + agent tools). */
export function galleryPhotoShareSensitivity(
  visibility: ProfileGalleryPhotoVisibility,
): "public" | "friends" {
  return visibility === "public" ? "public" : "friends";
}

export function canViewProfileGalleryPhoto(
  visibility: ProfileGalleryPhotoVisibility,
  bondLevel: BondLevel,
): boolean {
  if (bondLevel === "blocked") return false;
  if (visibility === "public") return true;
  if (visibility === "referred") return BOND_RANK[bondLevel] >= BOND_RANK.referred;
  return bondLevel === "direct";
}

export function canAgentAutonomousShareGalleryPhoto(input: {
  policy: ProfileMediaPolicy;
  photo: ProfileGalleryPhoto;
  bondLevel: BondLevel;
}): boolean {
  const { policy, photo, bondLevel } = input;
  if (!policy.allowAgentShareGalleryPhotos) return false;
  if (policy.maxAutonomousShareTier < 2) return false;
  if (!policy.autonomousShareBondLevels.includes(bondLevel)) return false;
  if (!canViewProfileGalleryPhoto(photo.visibility, bondLevel)) return false;
  return VISIBILITY_RANK[photo.visibility] <= VISIBILITY_RANK[policy.autonomousShareMinVisibility];
}
