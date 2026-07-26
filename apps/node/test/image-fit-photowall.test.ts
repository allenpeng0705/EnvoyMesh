import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fitImageToMaxBytes } from "../src/image-fit.js";
import {
  galleryPhotoWallStablePath,
  publishWebContentEntry,
  removeGalleryPhotoWallMirror,
  updateGalleryPhotoWallVisibility,
} from "../src/web-content-author.js";
import { createWebContentStore } from "../src/web-content-store.js";

/** Tiny valid JPEG (1x1) via sharp-friendly buffer — SOI + minimal. Use PNG 1x1 instead. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("fitImageToMaxBytes", () => {
  it("passes through when already under budget", async () => {
    const bytes = Buffer.from(PNG_1X1, "base64");
    const out = await fitImageToMaxBytes(bytes, "image/png", 1024 * 1024);
    expect(out.bytes.equals(bytes)).toBe(true);
    expect(out.mimeType).toBe("image/png");
  });

  it("bakes EXIF orientation even when under budget", async () => {
    const sharp = (await import("sharp")).default;
    const sideways = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(sideways.byteLength).toBeLessThan(50_000);
    const before = await sharp(sideways).metadata();
    expect(before.orientation).toBe(6);

    const out = await fitImageToMaxBytes(sideways, "image/jpeg", 5 * 1024 * 1024);
    const after = await sharp(out.bytes).metadata();
    expect(after.orientation === undefined || after.orientation === 1).toBe(true);
    // Orientation 6 → display as 20×40 (width/height swapped).
    expect(after.width).toBe(20);
    expect(after.height).toBe(40);
  });

  it("shrinks a large synthetic image under budget", async () => {
    // Build a large-ish PNG via sharp through fit by repeating — use a bigger raw encode.
    const sharp = (await import("sharp")).default;
    const big = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    })
      .png()
      .toBuffer();
    expect(big.byteLength).toBeGreaterThan(8_000);
    const out = await fitImageToMaxBytes(big, "image/png", 4_000);
    expect(out.bytes.byteLength).toBeLessThanOrEqual(4_000);
    expect(out.bytes.byteLength).toBeGreaterThan(0);
  });
});

describe("gallery PhotoWall mirror helpers", () => {
  let profileDir: string;
  afterEach(async () => {
    if (profileDir) await rm(profileDir, { recursive: true, force: true });
  });

  it("stablePath overwrites and remove/visibility helpers work", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-gallery-wall-"));
    const ownerId = "envoy:owner:alice";
    const photoId = "abc123";
    const path = galleryPhotoWallStablePath(photoId, "png");
    expect(path).toBe("photos/wall/gallery-abc123.png");

    const first = await publishWebContentEntry(profileDir, {
      template: "photo",
      title: "Trip",
      visibility: "public",
      ownerId,
      contentBase64: PNG_1X1,
      mimeType: "image/png",
      fileName: "trip.png",
      gallery: "wall",
      stablePath: path,
    });
    expect(first.path).toBe(path);

    const second = await publishWebContentEntry(profileDir, {
      template: "photo",
      title: "Trip v2",
      visibility: "bonded",
      ownerId,
      contentBase64: PNG_1X1,
      mimeType: "image/png",
      fileName: "trip.png",
      gallery: "wall",
      stablePath: path,
    });
    expect(second.path).toBe(path);
    expect(second.publishedAt).toBe(first.publishedAt);

    const store = createWebContentStore(join(profileDir, "web"));
    await store.reload();
    const photos = (await store.list({ kind: "photo" })).filter((e) =>
      e.path.startsWith("photos/wall/gallery-"),
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]!.title).toBe("Trip v2");

    const updated = await updateGalleryPhotoWallVisibility(
      profileDir,
      ownerId,
      photoId,
      "contacts",
      ["envoy:owner:bob"],
    );
    expect(updated).toBe(true);
    await store.reload();
    const afterVis = await store.findByPath(path);
    expect(afterVis?.visibility).toBe("contacts");
    expect(afterVis?.contactIds).toEqual(["envoy:owner:bob"]);

    const removed = await removeGalleryPhotoWallMirror(profileDir, ownerId, photoId);
    expect(removed).toBe(1);
    await store.reload();
    expect(await store.findByPath(path)).toBeUndefined();
    await expect(readFile(join(profileDir, "web", path))).rejects.toThrow();
  });
});
