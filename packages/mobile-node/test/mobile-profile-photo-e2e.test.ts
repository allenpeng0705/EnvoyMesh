/**
 * @vitest-environment jsdom
 * E2E: MobileNode profile thumbnail + public gallery photo (mobile vault + localStorage profile).
 */
import { describe, expect, it } from "vitest";
import { createMobileVault } from "@envoymesh/mobile-vault";
import { MobileNode } from "../src/index.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("E2E MobileNode profile photos", () => {
  it("setPublicProfileThumbnail stores bytes in vault and updates profile", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/mobile-profile-photo-thumb",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/mobile-profile-photo-thumb");
    await node.startNode();
    await node.updateHumanProfile({ displayName: "Mobile Alice", username: "malice" });

    const updated = await node.setPublicProfileThumbnail({
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
    });

    expect(updated.publicThumbnail?.vaultRelativePath).toMatch(/^profile\/thumbnail\.png$/);

    const entry = await vault.readFile(`/${updated.publicThumbnail!.vaultRelativePath}`);
    expect(entry.content.byteLength).toBeGreaterThan(0);

    const loaded = await node.getHumanProfile();
    expect(loaded?.publicThumbnail?.contentSha256).toBe(updated.publicThumbnail?.contentSha256);
  });

  it("upsertProfileGalleryPhoto with public visibility appears on profile", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/mobile-profile-photo-gallery",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/mobile-profile-photo-gallery");
    await node.startNode();
    await node.updateHumanProfile({ displayName: "Mobile Bob", username: "mbob01" });

    const updated = await node.upsertProfileGalleryPhoto({
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
      visibility: "public",
      label: "Beach",
    });

    expect(updated.galleryPhotos).toHaveLength(1);
    expect(updated.galleryPhotos![0]!.visibility).toBe("public");
    expect(updated.galleryPhotos![0]!.label).toBe("Beach");

    const path = updated.galleryPhotos![0]!.vaultRelativePath;
    const stored = await vault.readFile(`/${path}`);
    expect(stored.content.byteLength).toBeGreaterThan(0);
  });

  it("rejects gallery photoId path traversal", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/mobile-profile-photo-bad",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/mobile-profile-photo-bad");
    await node.startNode();
    await node.updateHumanProfile({ displayName: "Mobile", username: "mob01" });

    await expect(
      node.upsertProfileGalleryPhoto({
        contentBase64: MINIMAL_PNG_BASE64,
        mimeType: "image/png",
        visibility: "public",
        photoId: "../escape",
      }),
    ).rejects.toThrow(/Invalid profile photo path/i);
  });
});
