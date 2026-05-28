import { describe, expect, it } from "vitest";
import {
  stripImageMetadata,
  stripJpegMetadata,
  stripPngMetadata,
  stripWebpMetadata,
} from "../src/strip-image-metadata.js";

/** Minimal JPEG SOI + APP1 (EXIF) + EOI — stripped should drop APP segment. */
function jpegWithExifApp(): Uint8Array {
  const exifPayload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0" + pad
  const appLen = exifPayload.length + 2;
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (appLen >> 8) & 0xff, appLen & 0xff, ...exifPayload,
    0xff, 0xd9,
  ]);
}

describe("stripImageMetadata", () => {
  it("stripImageMetadata preserves JPEG SOI/EOI markers", () => {
    const input = jpegWithExifApp();
    const out = stripImageMetadata(input, "image/jpeg");
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9);
  });

  it("leaves non-JPEG bytes unchanged for stripJpegMetadata", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(stripJpegMetadata(png)).toEqual(png);
  });

  it("drops WebP EXIF chunk and updates RIFF size", () => {
    const header = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ]);
    const exifChunk = new Uint8Array([
      0x45, 0x58, 0x49, 0x46, 0x04, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    ]);
    const vp8Chunk = new Uint8Array([
      0x56, 0x50, 0x38, 0x20, 0x04, 0x00, 0x00, 0x00, 0x0a, 0x0b, 0x0c, 0x0d,
    ]);
    const input = new Uint8Array([...header, ...exifChunk, ...vp8Chunk]);
    const out = stripWebpMetadata(input);
    expect(out.length).toBeLessThan(input.length);
    expect(stripImageMetadata(input, "image/webp")).toEqual(out);
    const bodyLen = out[4]! | (out[5]! << 8) | (out[6]! << 16) | (out[7]! << 24);
    expect(bodyLen).toBe(out.length - 8);
  });

  it("drops PNG metadata ancillary chunks", () => {
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrLen = 13;
    const ihdr = new Uint8Array([
      0x00, 0x00, 0x00, ihdrLen,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
      0x1f, 0x15, 0xc4, 0x89,
    ]);
    const textChunk = new Uint8Array([
      0x00, 0x00, 0x00, 0x04,
      0x74, 0x45, 0x58, 0x74,
      0x61, 0x62, 0x63, 0x64,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const input = new Uint8Array([...sig, ...ihdr, ...textChunk]);
    const out = stripPngMetadata(input);
    expect(out.length).toBeLessThan(input.length);
    expect(stripImageMetadata(input, "image/png")).toEqual(out);
  });
});
