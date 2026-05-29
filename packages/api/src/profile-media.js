export const PROFILE_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PROFILE_THUMBNAIL_BYTES = 512 * 1024;
export const MAX_PROFILE_GALLERY_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_GALLERY_PHOTOS = 12;
const VISIBILITY_RANK = {
    public: 0,
    referred: 1,
    direct: 2,
};
export const DEFAULT_PROFILE_MEDIA_POLICY = {
    allowAgentShareGalleryPhotos: false,
    maxAutonomousShareTier: 0,
    autonomousShareBondLevels: ["direct"],
    autonomousShareMinVisibility: "direct",
};
export function normalizeProfileMediaPolicy(partial) {
    const tier = partial?.maxAutonomousShareTier;
    const minVis = partial?.autonomousShareMinVisibility;
    return {
        allowAgentShareGalleryPhotos: partial?.allowAgentShareGalleryPhotos === true,
        maxAutonomousShareTier: tier === 1 || tier === 2 ? tier : 0,
        autonomousShareBondLevels: partial?.autonomousShareBondLevels?.length ? [...partial.autonomousShareBondLevels] : ["direct"],
        autonomousShareMinVisibility: minVis === "public" || minVis === "referred" ? minVis : "direct",
    };
}
const BOND_RANK = {
    blocked: -1,
    public: 0,
    referred: 1,
    direct: 2,
};
/** Whether a viewer bond may see a gallery photo (not used for public thumbnail). */
/** Map gallery visibility to share.request sensitivity (UI + agent tools). */
export function galleryPhotoShareSensitivity(visibility) {
    return visibility === "public" ? "public" : "friends";
}
export function canViewProfileGalleryPhoto(visibility, bondLevel) {
    if (bondLevel === "blocked")
        return false;
    if (visibility === "public")
        return true;
    if (visibility === "referred")
        return BOND_RANK[bondLevel] >= BOND_RANK.referred;
    return bondLevel === "direct";
}
export function canAgentAutonomousShareGalleryPhoto(input) {
    const { policy, photo, bondLevel } = input;
    if (!policy.allowAgentShareGalleryPhotos)
        return false;
    if (policy.maxAutonomousShareTier < 2)
        return false;
    if (!policy.autonomousShareBondLevels.includes(bondLevel))
        return false;
    if (!canViewProfileGalleryPhoto(photo.visibility, bondLevel))
        return false;
    return VISIBILITY_RANK[photo.visibility] <= VISIBILITY_RANK[policy.autonomousShareMinVisibility];
}
//# sourceMappingURL=profile-media.js.map