/**
 * Save listing photos under `{profileDir}/shop-media/` (path-safe).
 * Also builds optional inline thumbs for market.announce Browse cards.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const MAX_BYTES = 8 * 1024 * 1024;
/** Raw base64 string ceiling (~before decode) — blocks huge WS payloads. */
const MAX_BASE64_CHARS = Math.ceil(MAX_BYTES * 1.4) + 64;
/** Inline announce thumb: keep envelopes small. */
export const MARKET_INLINE_THUMB_MAX_BYTES = 20 * 1024;

function safeExt(filename: string, mimeType?: string): string {
  const fromName = extname(filename).toLowerCase().replace(/^\./, "");
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (mimeType?.includes("png")) return "png";
  if (mimeType?.includes("webp")) return "webp";
  if (mimeType?.includes("gif")) return "gif";
  return "jpg";
}

function mimeFromExt(ext: string): "image/jpeg" | "image/png" | "image/webp" {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function saveShopListingMedia(
  profileDir: string,
  params: { filename: string; contentBase64: string; mimeType?: string },
): Promise<{ mediaPath: string }> {
  const raw = params.contentBase64?.trim() ?? "";
  if (!raw) throw new Error("contentBase64 is required");
  if (raw.length > MAX_BASE64_CHARS) throw new Error("Image too large (max 8MB)");
  const buf = Buffer.from(raw, "base64");
  if (buf.byteLength === 0) throw new Error("Empty image");
  if (buf.byteLength > MAX_BYTES) throw new Error("Image too large (max 8MB)");

  const ext = safeExt(basename(params.filename || "photo.jpg"), params.mimeType);
  const name = `listing_${randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;
  const dir = join(profileDir, "shop-media");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf, { mode: 0o600 });
  return { mediaPath: `shop-media/${name}` };
}

/** Load a shop-media path for announce thumbs / My Shop preview (path-safe). */
export async function readShopListingMediaFile(
  profileDir: string,
  mediaPath: string,
): Promise<{ contentBase64: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; byteLength: number } | null> {
  const rel = mediaPath.trim().replace(/^\/+/, "");
  if (!rel.startsWith("shop-media/") || rel.includes("..")) return null;
  const abs = join(profileDir, rel);
  try {
    const buf = await readFile(abs);
    const ext = extname(rel).toLowerCase().replace(/^\./, "");
    return {
      contentBase64: buf.toString("base64"),
      mimeType: mimeFromExt(ext),
      byteLength: buf.byteLength,
    };
  } catch {
    return null;
  }
}

/** Prefer first media file that fits the inline announce budget. */
export async function loadInlineListingThumbnail(
  profileDir: string,
  mediaPaths: string[] | undefined,
): Promise<
  | {
      thumbnailContentBase64: string;
      thumbnailMimeType: "image/jpeg" | "image/png" | "image/webp";
    }
  | undefined
> {
  for (const path of mediaPaths ?? []) {
    const file = await readShopListingMediaFile(profileDir, path);
    if (!file) continue;
    if (file.byteLength > MARKET_INLINE_THUMB_MAX_BYTES) continue;
    if (file.contentBase64.length > 28_000) continue;
    return {
      thumbnailContentBase64: file.contentBase64,
      thumbnailMimeType: file.mimeType,
    };
  }
  return undefined;
}
