import {
  MAX_IMAGE_INPUT_BYTES,
  MAX_PROFILE_GALLERY_PHOTO_BYTES,
  MAX_PROFILE_THUMBNAIL_BYTES,
  PROFILE_PHOTO_MIME_TYPES,
  stripImageMetadata,
  type ProfilePhotoMime,
} from "@envoymesh/api";
import type { MobileVault } from "@envoymesh/mobile-vault";
import { fitImageBytesToMaxBytes } from "./fit-image-bytes.js";

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

function withExtension(relativePath: string, mime: ProfilePhotoMime): string {
  const ext = extensionForProfileMime(mime);
  if (relativePath.toLowerCase().endsWith(ext)) return relativePath;
  return relativePath.replace(/\.[a-z0-9]+$/i, "") + ext;
}

export async function importMobileProfilePhotoBytes(input: {
  vault: MobileVault;
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
  const raw = Uint8Array.from(atob(input.contentBase64), (c) => c.charCodeAt(0));
  if (raw.byteLength === 0) {
    throw new Error("Empty image");
  }
  if (raw.byteLength > MAX_IMAGE_INPUT_BYTES) {
    throw new Error("Image could not be processed");
  }

  const fitted = await fitImageBytesToMaxBytes(raw, input.mimeType, input.maxBytes);
  let mime = parseProfilePhotoMime(fitted.mimeType);
  let bytes = stripImageMetadata(fitted.bytes, mime);
  if (bytes.byteLength > input.maxBytes) {
    const again = await fitImageBytesToMaxBytes(bytes, mime, input.maxBytes);
    mime = parseProfilePhotoMime(again.mimeType);
    bytes = stripImageMetadata(again.bytes, mime);
  }
  if (bytes.length === 0 || bytes.length > input.maxBytes) {
    throw new Error("Image could not be processed");
  }

  const norm = withExtension(input.relativePath.trim().replace(/^[\\/]+/, ""), mime);
  if (!isSafeProfilePath(norm)) {
    throw new Error("Invalid profile photo path");
  }
  const vaultPath = norm.startsWith("/") ? norm : `/${norm}`;
  await input.vault.writeFile(vaultPath, bytes, mime);
  const contentSha256 = await sha256Hex(bytes);
  return {
    vaultRelativePath: norm,
    contentSha256,
    mimeType: mime,
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
