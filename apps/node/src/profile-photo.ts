import {
  MAX_PROFILE_GALLERY_PHOTO_BYTES,
  MAX_PROFILE_THUMBNAIL_BYTES,
  PROFILE_PHOTO_MIME_TYPES,
  type ProfilePhotoMime,
} from "@envoymesh/api";
import { createHash, randomUUID } from "node:crypto";
import { stripImageMetadata } from "@envoymesh/api";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { assertPathInsideVault, buildVaultIndex } from "@envoymesh/vault";
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

export async function importProfilePhotoBytes(input: {
  vaultDir: string;
  relativePath: string;
  contentBase64: string;
  mimeType: ProfilePhotoMime;
  maxBytes: number;
}): Promise<{ vaultRelativePath: string; contentSha256: string; mimeType: ProfilePhotoMime; sizeBytes: number }> {
  const norm = input.relativePath.trim().replace(/^[\\/]+/, "");
  if (!isSafeVaultPath(input.vaultDir, norm) || !norm.startsWith("profile/")) {
    throw new Error("Invalid profile photo path");
  }
  const abs = resolve(input.vaultDir, norm);
  assertPathInsideVault(input.vaultDir, abs);
  const raw = Buffer.from(input.contentBase64, "base64");
  const stripped = stripImageMetadata(new Uint8Array(raw), input.mimeType);
  const bytes = Buffer.from(stripped);
  if (bytes.length === 0) {
    throw new Error("Empty image");
  }
  if (bytes.length > input.maxBytes) {
    throw new Error(`Image too large (max ${input.maxBytes} bytes)`);
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes, { mode: 0o600 });
  const index = await buildVaultIndex({ rootDir: input.vaultDir });
  if (!index.documents.some((d) => d.relativePath === norm)) {
    throw new Error(`Profile photo not indexed: ${norm}`);
  }
  return {
    vaultRelativePath: norm,
    contentSha256: sha256Hex(bytes),
    mimeType: input.mimeType,
    sizeBytes: bytes.length,
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
