/**
 * Shrink / re-encode images so they fit a storage budget.
 * Callers should accept large inputs and rely on this instead of rejecting on size.
 *
 * Always applies EXIF orientation (sharp `.rotate()`) before returning when the
 * image will later have metadata stripped — otherwise phone photos that store
 * sideways pixels + Orientation tag appear rotated after EXIF is removed.
 *
 * sharp is loaded lazily so a missing platform binary (common when packaging
 * omits optionalDeps) fails image ops instead of crashing the whole home node.
 */
import { MAX_IMAGE_INPUT_BYTES } from "@envoymesh/api";

export { MAX_IMAGE_INPUT_BYTES };

type SharpFn = typeof import("sharp").default;

let sharpLoad: Promise<SharpFn | null> | undefined;

async function loadSharp(): Promise<SharpFn | null> {
  if (sharpLoad) return sharpLoad;
  sharpLoad = import("sharp")
    .then((m) => m.default)
    .catch((err) => {
      console.warn(
        "[image-fit] sharp unavailable (platform binary missing?). Image compress/orient disabled:",
        err instanceof Error ? err.message : err,
      );
      return null;
    });
  return sharpLoad;
}

type OutMime = "image/jpeg" | "image/png" | "image/webp";

function normalizeOutMime(mime: string): OutMime | null {
  const key = mime.trim().toLowerCase();
  if (key === "image/jpeg" || key === "image/jpg") return "image/jpeg";
  if (key === "image/png") return "image/png";
  if (key === "image/webp") return "image/webp";
  return null;
}

async function encodeAt(
  sharp: SharpFn,
  input: Buffer,
  width: number,
  height: number,
  mime: OutMime,
  quality: number,
): Promise<Buffer> {
  const pipeline = sharp(input, { failOn: "none" }).rotate().resize({
    width,
    height,
    fit: "inside",
    withoutEnlargement: true,
  });
  if (mime === "image/jpeg") {
    return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  if (mime === "image/webp") {
    return pipeline.webp({ quality }).toBuffer();
  }
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/** Bake EXIF orientation into pixels and drop the orientation tag. */
async function bakeOrientation(sharp: SharpFn, input: Buffer, mime: OutMime): Promise<Buffer> {
  const pipeline = sharp(input, { failOn: "none" }).rotate();
  if (mime === "image/jpeg") {
    return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
  if (mime === "image/webp") {
    return pipeline.webp({ quality: 92 }).toBuffer();
  }
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * If `bytes` already fits `maxBytes`, return as-is **unless** EXIF orientation
 * needs baking. Otherwise scale down and/or lower quality until under the budget
 * (or throw). Prefers keeping the original mime; may fall back to JPEG when
 * PNG/WebP stay too large.
 */
export async function fitImageToMaxBytes(
  bytes: Uint8Array | Buffer,
  mimeType: string,
  maxBytes: number,
): Promise<{ bytes: Buffer; mimeType: OutMime | string }> {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (input.byteLength === 0) {
    throw new Error("Empty image");
  }
  if (input.byteLength > MAX_IMAGE_INPUT_BYTES) {
    throw new Error("Image could not be processed");
  }
  const preferred = normalizeOutMime(mimeType);
  if (!preferred) {
    if (input.byteLength <= maxBytes) {
      return { bytes: input, mimeType: mimeType.trim() || "application/octet-stream" };
    }
    throw new Error("Image could not be processed");
  }

  const sharp = await loadSharp();
  if (!sharp) {
    // Without sharp we cannot bake EXIF or recompress — pass through only if
    // already under budget so profile/avatar flows don't hard-fail the node.
    if (input.byteLength <= maxBytes) {
      return { bytes: input, mimeType: preferred };
    }
    throw new Error("Image could not be processed");
  }

  const meta = await sharp(input, { failOn: "none" }).metadata();
  const needsOrient = Boolean(meta.orientation && meta.orientation !== 1);

  if (input.byteLength <= maxBytes && !needsOrient) {
    return { bytes: input, mimeType: preferred };
  }

  if (input.byteLength <= maxBytes && needsOrient) {
    const oriented = await bakeOrientation(sharp, input, preferred);
    if (oriented.byteLength <= maxBytes) {
      return { bytes: oriented, mimeType: preferred };
    }
    // Oriented re-encode grew past budget — fall through to shrink loop.
  }

  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("Image could not be processed");
  }
  // After auto-orient, swap display dimensions for 90°/270° tags.
  if (meta.orientation && [5, 6, 7, 8].includes(meta.orientation)) {
    const tmp = width;
    width = height;
    height = tmp;
  }

  const formats: OutMime[] =
    preferred === "image/jpeg" ? ["image/jpeg"] : [preferred, "image/jpeg"];

  for (const format of formats) {
    let w = width;
    let h = height;
    for (let attempt = 0; attempt < 10; attempt++) {
      const scale = Math.max(0.12, 1 - attempt * 0.09);
      const targetW = Math.max(32, Math.round(w * scale));
      const targetH = Math.max(32, Math.round(h * scale));
      const quality = Math.max(38, 90 - attempt * 5);
      const encoded = await encodeAt(sharp, input, targetW, targetH, format, quality);
      if (encoded.byteLength <= maxBytes) {
        return { bytes: encoded, mimeType: format };
      }
      w = targetW;
      h = targetH;
    }
  }

  throw new Error("Image could not be processed");
}
