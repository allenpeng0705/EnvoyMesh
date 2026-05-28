import { describe, expect, it } from "vitest";
import {
  canAgentAutonomousShareGalleryPhoto,
  canViewProfileGalleryPhoto,
  DEFAULT_PROFILE_MEDIA_POLICY,
  galleryPhotoShareSensitivity,
  normalizeProfileMediaPolicy,
} from "../src/profile-media.js";

describe("profile media policy", () => {
  it("normalizes defaults to proposals-only", () => {
    expect(normalizeProfileMediaPolicy()).toEqual(DEFAULT_PROFILE_MEDIA_POLICY);
  });

  it("maps gallery visibility to share sensitivity", () => {
    expect(galleryPhotoShareSensitivity("public")).toBe("public");
    expect(galleryPhotoShareSensitivity("referred")).toBe("friends");
    expect(galleryPhotoShareSensitivity("direct")).toBe("friends");
  });

  it("gates gallery visibility by bond", () => {
    expect(canViewProfileGalleryPhoto("direct", "direct")).toBe(true);
    expect(canViewProfileGalleryPhoto("direct", "referred")).toBe(false);
    expect(canViewProfileGalleryPhoto("public", "public")).toBe(true);
    expect(canViewProfileGalleryPhoto("referred", "direct")).toBe(true);
  });

  it("agent autonomous share requires tier 2 and matching visibility", () => {
    const policy = normalizeProfileMediaPolicy({
      allowAgentShareGalleryPhotos: true,
      maxAutonomousShareTier: 2,
      autonomousShareBondLevels: ["direct"],
      autonomousShareMinVisibility: "referred",
    });
    const photo = {
      photoId: "a",
      vaultRelativePath: "profile/gallery/a.jpg",
      contentSha256: "a".repeat(64),
      mimeType: "image/jpeg" as const,
      visibility: "public" as const,
    };
    expect(
      canAgentAutonomousShareGalleryPhoto({ policy, photo, bondLevel: "direct" }),
    ).toBe(true);
    expect(
      canAgentAutonomousShareGalleryPhoto({
        policy,
        photo: { ...photo, visibility: "direct" },
        bondLevel: "referred",
      }),
    ).toBe(false);
  });
});
