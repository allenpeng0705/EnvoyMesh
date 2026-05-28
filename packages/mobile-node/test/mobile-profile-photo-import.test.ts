/**
 * @vitest-environment jsdom
 * Unit: mobile profile photo vault import.
 */
import { describe, expect, it } from "vitest";
import { createMobileVault } from "@envoymesh/mobile-vault";
import { importMobileProfilePhotoBytes } from "../src/mobile-profile-photo.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("importMobileProfilePhotoBytes", () => {
  it("writes profile thumbnail to mobile vault", async () => {
    const vault = createMobileVault();
    const result = await importMobileProfilePhotoBytes({
      vault,
      relativePath: "profile/thumbnail.png",
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
      maxBytes: 512_000,
    });

    expect(result.vaultRelativePath).toBe("profile/thumbnail.png");
    const entry = await vault.readFile("/profile/thumbnail.png");
    expect(entry.content.byteLength).toBeGreaterThan(0);
  });

  it("rejects path traversal in gallery photoId paths", async () => {
    const vault = createMobileVault();
    await expect(
      importMobileProfilePhotoBytes({
        vault,
        relativePath: "profile/gallery/../escape.png",
        contentBase64: MINIMAL_PNG_BASE64,
        mimeType: "image/png",
        maxBytes: 512_000,
      }),
    ).rejects.toThrow(/Invalid profile photo path/i);
  });
});
