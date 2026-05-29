import type { BondLevel } from "./bond-trust-rank.js";
export declare const PROFILE_PHOTO_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp"];
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
export declare const MAX_PROFILE_THUMBNAIL_BYTES: number;
export declare const MAX_PROFILE_GALLERY_PHOTO_BYTES: number;
export declare const MAX_PROFILE_GALLERY_PHOTOS = 12;
export interface ProfileMediaPolicy {
    /** Agent may share gallery photos (never applies to the always-public thumbnail metadata). */
    allowAgentShareGalleryPhotos: boolean;
    maxAutonomousShareTier: 0 | 1 | 2;
    autonomousShareBondLevels: BondLevel[];
    /** Minimum visibility label on a gallery item before the agent may share it autonomously. */
    autonomousShareMinVisibility: ProfileGalleryPhotoVisibility;
}
export declare const DEFAULT_PROFILE_MEDIA_POLICY: ProfileMediaPolicy;
export declare function normalizeProfileMediaPolicy(partial?: Partial<ProfileMediaPolicy>): ProfileMediaPolicy;
/** Whether a viewer bond may see a gallery photo (not used for public thumbnail). */
/** Map gallery visibility to share.request sensitivity (UI + agent tools). */
export declare function galleryPhotoShareSensitivity(visibility: ProfileGalleryPhotoVisibility): "public" | "friends";
export declare function canViewProfileGalleryPhoto(visibility: ProfileGalleryPhotoVisibility, bondLevel: BondLevel): boolean;
export declare function canAgentAutonomousShareGalleryPhoto(input: {
    policy: ProfileMediaPolicy;
    photo: ProfileGalleryPhoto;
    bondLevel: BondLevel;
}): boolean;
//# sourceMappingURL=profile-media.d.ts.map