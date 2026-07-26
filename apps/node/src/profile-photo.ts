import {
  MAX_IMAGE_INPUT_BYTES,
  PROFILE_PHOTO_MIME_TYPES,
  type ProfilePhotoMime,
} from "@envoymesh/api";
import { createHash, randomUUID } from "node:crypto";
import { stripImageMetadata } from "@envoymesh/api";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { assertPathInsideVault, buildVaultIndex } from "@envoymesh/vault";
import { fitImageToMaxBytes } from "./image-fit.js";
import { isSafeVaultPath } from "./share-inbound.js";

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function extensionForProfileMime(mime: ProfilePhotoMime): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  return ".webp";
}

export function parseProfilePhotoMime(mime: string): ProfilePhotoMime {
  if ((PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(mime)) {
    return mime as ProfilePhotoMime;
  }
  throw new Error(`Unsupported image type: ${mime}`);
}

function withExtension(relativePath: string, mime: ProfilePhotoMime): string {
  const ext = extensionForProfileMime(mime);
  if (relativePath.toLowerCase().endsWith(ext)) return relativePath;
  return relativePath.replace(/\.[a-z0-9]+$/i, "") + ext;
}

export async function importProfilePhotoBytes(input: {
  vaultDir: string;
  relativePath: string;
  contentBase64: string;
  mimeType: ProfilePhotoMime;
  maxBytes: number;
}): Promise<{
  vaultRelativePath: string;
  contentSha256: string;
  mimeType: ProfilePhotoMime;
  sizeBytes: number;
}> {
  const raw = Buffer.from(input.contentBase64, "base64");
  if (raw.byteLength === 0) {
    throw new Error("Empty image");
  }
  if (raw.byteLength > MAX_IMAGE_INPUT_BYTES) {
    throw new Error("Image could not be processed");
  }

  const fitted = await fitImageToMaxBytes(raw, input.mimeType, input.maxBytes);
  let mime = parseProfilePhotoMime(fitted.mimeType);
  let bytes = Buffer.from(
    stripImageMetadata(new Uint8Array(fitted.bytes), mime),
  );
  if (bytes.byteLength > input.maxBytes) {
    const again = await fitImageToMaxBytes(bytes, mime, input.maxBytes);
    mime = parseProfilePhotoMime(again.mimeType);
    bytes = Buffer.from(stripImageMetadata(new Uint8Array(again.bytes), mime));
  }
  if (bytes.byteLength === 0 || bytes.byteLength > input.maxBytes) {
    throw new Error("Image could not be processed");
  }

  const norm = withExtension(
    input.relativePath.trim().replace(/^[\\/]+/, ""),
    mime,
  );
  if (!isSafeVaultPath(input.vaultDir, norm) || !norm.startsWith("profile/")) {
    throw new Error("Invalid profile photo path");
  }
  const abs = resolve(input.vaultDir, norm);
  assertPathInsideVault(input.vaultDir, abs);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes, { mode: 0o600 });
  const index = await buildVaultIndex({ rootDir: input.vaultDir });
  if (!index.documents.some((d) => d.relativePath === norm)) {
    throw new Error(`Profile photo not indexed: ${norm}`);
  }
  return {
    vaultRelativePath: norm,
    contentSha256: sha256Hex(bytes),
    mimeType: mime,
    sizeBytes: bytes.byteLength,
  };
}

export function profileThumbnailVaultPath(mime: ProfilePhotoMime): string {
  return `profile/thumbnail${extensionForProfileMime(mime)}`;
}

export function profileGalleryVaultPath(mime: ProfilePhotoMime, photoId?: string): string {
  const id = photoId?.trim() || randomUUID();
  return `profile/gallery/${id}${extensionForProfileMime(mime)}`;
}

export function photoIdFromGalleryPath(vaultRelativePath: string): string {
  const base = vaultRelativePath.split("/").pop() ?? "";
  return base.replace(extname(base), "");
}
