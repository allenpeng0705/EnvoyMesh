/**
 * Unit: profile photo vault import (EXIF strip, path safety, indexing).
 */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importProfilePhotoBytes } from "../src/profile-photo.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-profile-import-"));
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(vaultDir, { recursive: true, force: true });
});

describe("importProfilePhotoBytes", () => {
  it("writes under profile/ and returns content hash", async () => {
    const result = await importProfilePhotoBytes({
      vaultDir,
      relativePath: "profile/thumbnail.png",
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
      maxBytes: 512_000,
    });

    expect(result.vaultRelativePath).toBe("profile/thumbnail.png");
    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/i);

    const bytes = await readFile(join(vaultDir, "profile/thumbnail.png"));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("rejects paths outside profile/", async () => {
    await expect(
      importProfilePhotoBytes({
        vaultDir,
        relativePath: "docs/not-profile.png",
        contentBase64: MINIMAL_PNG_BASE64,
        mimeType: "image/png",
        maxBytes: 512_000,
      }),
    ).rejects.toThrow(/Invalid profile photo path/i);
  });
});
