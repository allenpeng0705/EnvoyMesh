/**
 * Mirror shop-media listing photos onto public web (`photos/market/…`)
 * so Browse can resolve `thumbnailRef` via libraryRead (envoy:// URL).
 */
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ShopListing } from "@envoymesh/api";
import {
  marketListingThumbStablePath,
  removeMarketListingThumbMirror,
} from "./web-content-author.js";
import { readShopListingMediaFile } from "./shop-listing-media.js";

export type MirrorListingThumbPublish = (params: {
  template: "photo";
  title: string;
  body?: string;
  visibility: "public" | "bonded" | "contacts" | "private";
  contactIds?: string[];
  contentBase64: string;
  mimeType: string;
  fileName?: string;
  gallery?: string;
  stablePath?: string;
}) => Promise<{ url: string; path: string; contentHash: string }>;

export async function mirrorShopListingThumb(input: {
  profileDir: string;
  listing: ShopListing;
  publish: MirrorListingThumbPublish;
}): Promise<{ thumbnailRef: string; contentHash: string } | null> {
  const mediaPath = input.listing.mediaPaths?.[0]?.trim();
  if (!mediaPath) return null;

  const file = await readShopListingMediaFile(input.profileDir, mediaPath);
  if (!file) {
    // Fall back to reading absolute path under profileDir (same as shop-media).
    try {
      const abs = join(input.profileDir, mediaPath);
      const bytes = await readFile(abs);
      const ext = basename(mediaPath).split(".").pop()?.toLowerCase() || "jpg";
      const mime =
        ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return mirrorBytes({
        listing: input.listing,
        publish: input.publish,
        bytes,
        mimeType: mime,
        fileName: basename(mediaPath),
      });
    } catch {
      return null;
    }
  }

  return mirrorBytes({
    listing: input.listing,
    publish: input.publish,
    bytes: Buffer.from(file.contentBase64, "base64"),
    mimeType: file.mimeType,
    fileName: basename(mediaPath),
  });
}

async function mirrorBytes(input: {
  listing: ShopListing;
  publish: MirrorListingThumbPublish;
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ thumbnailRef: string; contentHash: string } | null> {
  if (input.bytes.byteLength === 0) return null;

  const ext =
    input.mimeType.includes("png")
      ? "png"
      : input.mimeType.includes("webp")
        ? "webp"
        : "jpg";

  // Shop "bonds" → web "bonded" (same tier as gallery "referred").
  const visibility: "public" | "bonded" =
    input.listing.visibility === "bonds" ? "bonded" : "public";

  try {
    const published = await input.publish({
      template: "photo",
      title: input.listing.title.slice(0, 80) || "Listing photo",
      body: undefined,
      visibility,
      contentBase64: input.bytes.toString("base64"),
      mimeType: input.mimeType.startsWith("image/") ? input.mimeType : "image/jpeg",
      fileName: input.fileName,
      gallery: "market",
      stablePath: marketListingThumbStablePath(input.listing.listingId, ext),
    });
    return {
      thumbnailRef: published.url,
      contentHash: published.contentHash,
    };
  } catch (err) {
    console.warn(
      "[market.thumb] mirror failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function unmirrorShopListingThumb(
  profileDir: string,
  listingId: string,
): Promise<void> {
  try {
    await removeMarketListingThumbMirror(profileDir, listingId);
  } catch (err) {
    console.warn(
      "[market.thumb] remove mirror failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
