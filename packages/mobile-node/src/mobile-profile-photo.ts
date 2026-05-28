import {
  MAX_PROFILE_GALLERY_PHOTO_BYTES,
  MAX_PROFILE_THUMBNAIL_BYTES,
  PROFILE_PHOTO_MIME_TYPES,
  stripImageMetadata,
  type ProfilePhotoMime,
} from "@envoymesh/api";
import type { MobileVault } from "@envoymesh/mobile-vault";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

function isSafeProfilePath(relativePath: string): boolean {
  const norm = relativePath.trim().replace(/^[\\/]+/, "");
  return Boolean(norm) && !norm.includes("..") && !norm.includes("~") && norm.startsWith("profile/");
}

export async function importMobileProfilePhotoBytes(input: {
  vault: MobileVault;
  relativePath: string;
  contentBase64: string;
  mimeType: ProfilePhotoMime;
  maxBytes: number;
}): Promise<{ vaultRelativePath: string; contentSha256: string; mimeType: ProfilePhotoMime; sizeBytes: number }> {
  const norm = input.relativePath.trim().replace(/^[\\/]+/, "");
  if (!isSafeProfilePath(norm)) {
    throw new Error("Invalid profile photo path");
  }
  const raw = Uint8Array.from(atob(input.contentBase64), (c) => c.charCodeAt(0));
  const bytes = stripImageMetadata(raw, input.mimeType);
  if (bytes.length === 0) {
    throw new Error("Empty image");
  }
  if (bytes.length > input.maxBytes) {
    throw new Error(`Image too large (max ${input.maxBytes} bytes)`);
  }
  const vaultPath = norm.startsWith("/") ? norm : `/${norm}`;
  await input.vault.writeFile(vaultPath, bytes, input.mimeType);
  const contentSha256 = await sha256Hex(bytes);
  return {
    vaultRelativePath: norm,
    contentSha256,
    mimeType: input.mimeType,
    sizeBytes: bytes.length,
  };
}

export function profileThumbnailVaultPath(mime: ProfilePhotoMime): string {
  return `profile/thumbnail${extensionForProfileMime(mime)}`;
}

export function profileGalleryVaultPath(mime: ProfilePhotoMime, photoId: string): string {
  return `profile/gallery/${photoId}${extensionForProfileMime(mime)}`;
}

export function photoIdFromGalleryPath(vaultRelativePath: string): string {
  const base = vaultRelativePath.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(0, dot) : base;
}

export { MAX_PROFILE_THUMBNAIL_BYTES, MAX_PROFILE_GALLERY_PHOTO_BYTES };
