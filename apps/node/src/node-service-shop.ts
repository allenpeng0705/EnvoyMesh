/**
 * Phase 63A — Envoy Market local shop RPC helpers (no mesh yet).
 */

import type {
  ShopDeleteListingParams,
  ShopDeleteListingResult,
  ShopGetProfileResult,
  ShopListListingsParams,
  ShopListListingsResult,
  ShopListing,
  ShopProfile,
  ShopSetListingStatusParams,
  ShopSetListingStatusResult,
  ShopUpdateProfileParams,
  ShopUpdateProfileResult,
  ShopUpsertListingParams,
  ShopUpsertListingResult,
} from "@envoymesh/api";
import type {
  ShopListingRecord,
  ShopProfileRecord,
  ShopStore,
} from "@envoymesh/local-store";

export function toShopProfile(record: ShopProfileRecord): ShopProfile {
  return {
    shopId: record.shopId,
    ownerId: record.ownerId,
    displayName: record.displayName,
    bio: record.bio,
    tags: [...record.tags],
    ...(record.geoHint ? { geoHint: record.geoHint } : {}),
    defaultVisibility: record.defaultVisibility,
    updatedAt: record.updatedAt,
  };
}

export function toShopListing(record: ShopListingRecord): ShopListing {
  return {
    version: "0.1",
    listingId: record.listingId,
    sellerOwnerId: record.sellerOwnerId,
    title: record.title,
    description: record.description,
    category: record.category,
    tags: [...record.tags],
    condition: record.condition,
    status: record.status,
    visibility: record.visibility,
    price: { ...record.price },
    ...(record.geoHint ? { geoHint: record.geoHint } : {}),
    mediaPaths: [...record.mediaPaths],
    searchTokens: [...record.searchTokens],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function requireStore(store: ShopStore | null): ShopStore {
  if (!store) throw new Error("Shop store is not available");
  return store;
}

export async function shopGetProfileViaRuntime(
  store: ShopStore | null,
  ownerId: string,
  displayNameHint?: string,
): Promise<ShopGetProfileResult> {
  if (!store) return { profile: null };
  if (!ownerId.trim()) return { profile: null };
  const profile = await store.ensureProfile(ownerId.trim(), displayNameHint);
  return { profile: toShopProfile(profile) };
}

export async function shopUpdateProfileViaRuntime(
  store: ShopStore | null,
  ownerId: string,
  params: ShopUpdateProfileParams,
  displayNameHint?: string,
): Promise<ShopUpdateProfileResult> {
  const s = requireStore(store);
  if (!ownerId.trim()) throw new Error("Owner identity is not ready");
  await s.ensureProfile(ownerId.trim(), displayNameHint);
  const profile = await s.updateProfile(ownerId.trim(), params);
  return { profile: toShopProfile(profile) };
}

export async function shopListListingsViaRuntime(
  store: ShopStore | null,
  params?: ShopListListingsParams,
): Promise<ShopListListingsResult> {
  if (!store) return { listings: [] };
  const listings = await store.listListings(
    params?.status ? { status: params.status } : undefined,
  );
  return { listings: listings.map(toShopListing) };
}

export async function shopUpsertListingViaRuntime(
  store: ShopStore | null,
  ownerId: string,
  params: ShopUpsertListingParams,
  displayNameHint?: string,
): Promise<ShopUpsertListingResult> {
  const s = requireStore(store);
  if (!ownerId.trim()) throw new Error("Owner identity is not ready");
  await s.ensureProfile(ownerId.trim(), displayNameHint);
  const listing = await s.upsertListing(ownerId.trim(), params);
  return { listing: toShopListing(listing) };
}

export async function shopSetListingStatusViaRuntime(
  store: ShopStore | null,
  ownerId: string,
  params: ShopSetListingStatusParams,
): Promise<ShopSetListingStatusResult> {
  const s = requireStore(store);
  if (!ownerId.trim()) throw new Error("Owner identity is not ready");
  const listingId = params.listingId?.trim();
  if (!listingId) throw new Error("listingId is required");
  const listing = await s.setListingStatus(ownerId.trim(), listingId, params.status);
  return { listing: toShopListing(listing) };
}

export async function shopDeleteListingViaRuntime(
  store: ShopStore | null,
  ownerId: string,
  params: ShopDeleteListingParams,
): Promise<ShopDeleteListingResult> {
  const s = requireStore(store);
  if (!ownerId.trim()) throw new Error("Owner identity is not ready");
  const listingId = params.listingId?.trim();
  if (!listingId) throw new Error("listingId is required");
  const ok = await s.deleteListing(ownerId.trim(), listingId);
  if (!ok) throw new Error(`Listing not found: ${listingId}`);
  return { ok: true, listingId };
}
