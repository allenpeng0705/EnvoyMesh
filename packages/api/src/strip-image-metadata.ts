import type { ProfilePhotoMime } from "./profile-media.js";

/** Remove JPEG APP (EXIF) segments; keep image structure intact. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes;
  }
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!;
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return new Uint8Array(out);
    }
    if (marker === 0xda) {
      out.push(...bytes.subarray(i));
      return new Uint8Array(out);
    }
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) break;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (!isApp) {
      out.push(...bytes.subarray(i, i + 2 + len));
    }
    i += 2 + len;
  }
  return bytes;
}

/** Drop eXIf / iTXt / tIME / zTXt ancillary PNG chunks. */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 8) return bytes;
  let matches = true;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) {
      matches = false;
      break;
    }
  }
  if (!matches) return bytes;
  const drop = new Set(["eXIf", "iTXt", "tEXt", "zTXt", "tIME"]);
  const out: number[] = [...sig];
  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const chunkTotal = 12 + length + 4;
    if (chunkTotal <= 0 || offset + chunkTotal > bytes.length) break;
    if (!drop.has(type)) {
      out.push(...bytes.subarray(offset, offset + chunkTotal));
    }
    offset += chunkTotal;
  }
  return new Uint8Array(out);
}

/** Drop EXIF/XMP/ICCP chunks from RIFF WebP; keep VP8/VP8L image bitstreams. */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12) return bytes;
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff !== "RIFF" || webp !== "WEBP") return bytes;
  const drop = new Set(["EXIF", "XMP ", "ICCP"]);
  const out: number[] = [...bytes.subarray(0, 12)];
  let offset = 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 <= bytes.length) {
    const tag = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const size = view.getUint32(offset + 4, true);
    const padded = size + (size % 2);
    const chunkTotal = 8 + padded;
    if (chunkTotal <= 0 || offset + chunkTotal > bytes.length) break;
    if (!drop.has(tag)) {
      out.push(...bytes.subarray(offset, offset + chunkTotal));
    }
    offset += chunkTotal;
  }
  const bodyLen = out.length - 8;
  out[4] = bodyLen & 0xff;
  out[5] = (bodyLen >> 8) & 0xff;
  out[6] = (bodyLen >> 16) & 0xff;
  out[7] = (bodyLen >> 24) & 0xff;
  return new Uint8Array(out);
}

export function stripImageMetadata(bytes: Uint8Array, mime: ProfilePhotoMime): Uint8Array {
  if (mime === "image/jpeg") return stripJpegMetadata(bytes);
  if (mime === "image/png") return stripPngMetadata(bytes);
  if (mime === "image/webp") return stripWebpMetadata(bytes);
  return bytes;
}
