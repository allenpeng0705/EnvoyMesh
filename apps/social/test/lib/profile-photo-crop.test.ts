/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  clampCropPan,
  exportSquareThumbnail,
  minCoverScale,
  DEFAULT_THUMBNAIL_CROP,
} from "../../src/lib/profile-photo-crop.js";
import { MINIMAL_PNG_BASE64 } from "../fixtures/profile-photo-fixtures.js";

describe("profile-photo-crop", () => {
  it("minCoverScale fills a square viewport", () => {
    expect(minCoverScale(400, 200, 280)).toBeCloseTo(1.4);
    expect(minCoverScale(200, 400, 280)).toBeCloseTo(1.4);
    expect(minCoverScale(280, 280, 280)).toBeCloseTo(1);
  });

  it("clampCropPan enforces cover scale and pan bounds", () => {
    const clamped = clampCropPan(
      { scale: 0.5, offsetX: 500, offsetY: -500 },
      100,
      200,
      280,
    );
    expect(clamped.scale).toBeGreaterThanOrEqual(minCoverScale(100, 200, 280));
    expect(Math.abs(clamped.offsetX)).toBeLessThanOrEqual((100 * clamped.scale - 280) / 2 + 1);
    expect(Math.abs(clamped.offsetY)).toBeLessThanOrEqual((200 * clamped.scale - 280) / 2 + 1);
  });

  it("DEFAULT_THUMBNAIL_CROP starts centered", () => {
    expect(DEFAULT_THUMBNAIL_CROP).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("exportSquareThumbnail uses canvas when toBlob is available", async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    });
    const ctx = {
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toBlob,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });

    const img = { naturalWidth: 100, naturalHeight: 200 } as HTMLImageElement;
    const blob = await exportSquareThumbnail(img, { scale: 2, offsetX: 0, offsetY: 0 }, 512, "image/png");
    expect(blob.type).toBe("image/png");
    expect(toBlob).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
