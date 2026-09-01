/**
 * Envoy Market — local shop types (Phase 63 / MKT-A).
 *
 * Listings live on the home node. Mesh publish/search arrives in MKT-B/C.
 * @see docs/p2p-market-plan.md
 */

export const SHOP_LISTING_CATEGORIES = [
  "books",
  "electronics",
  "clothing",
  "home",
  "digital",
  "other",
] as const;

export type ShopListingCategory = (typeof SHOP_LISTING_CATEGORIES)[number];

export const SHOP_LISTING_CONDITIONS = [
  "new",
  "like_new",
  "good",
  "fair",
  "digital",
] as const;

export type ShopListingCondition = (typeof SHOP_LISTING_CONDITIONS)[number];

export const SHOP_LISTING_STATUSES = [
  "active",
  "reserved",
  "sold",
  "withdrawn",
] as const;

export type ShopListingStatus = (typeof SHOP_LISTING_STATUSES)[number];

/** `public` = mesh strangers (default); `bonds` = bonded contacts only. */
export type ShopListingVisibility = "public" | "bonds";

export interface ShopPrice {
  /** Decimal string, e.g. "68.00" — avoid float. */
  amount: string;
  currency: string;
}

export interface ShopProfile {
  shopId: string;
  ownerId: string;
  displayName: string;
  bio: string;
  tags: string[];
  /** Coarse city/region hint only. */
  geoHint?: string;
  /** Default visibility for new listings. Product default is public. */
  defaultVisibility: ShopListingVisibility;
  updatedAt: string;
}

export interface ShopListing {
  version: "0.1";
  listingId: string;
  sellerOwnerId: string;
  title: string;
  description: string;
  category: ShopListingCategory;
  tags: string[];
  condition: ShopListingCondition;
  status: ShopListingStatus;
  visibility: ShopListingVisibility;
  price: ShopPrice;
  geoHint?: string;
  /** Vault-relative paths under shop-media/ (optional in MKT-A). */
  mediaPaths: string[];
  /** Derived at upsert from title/tags/category. */
  searchTokens: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShopGetProfileResult {
  profile: ShopProfile | null;
}

export interface ShopUpdateProfileParams {
  displayName?: string;
  bio?: string;
  tags?: string[];
  geoHint?: string | null;
  defaultVisibility?: ShopListingVisibility;
}

export interface ShopUpdateProfileResult {
  profile: ShopProfile;
}

export interface ShopListListingsParams {
  /** When set, filter by status; omit = all. */
  status?: ShopListingStatus;
}

export interface ShopListListingsResult {
  listings: ShopListing[];
}

export interface ShopUpsertListingParams {
  /** Omit to create. */
  listingId?: string;
  title: string;
  description?: string;
  category?: ShopListingCategory;
  tags?: string[];
  condition?: ShopListingCondition;
  status?: ShopListingStatus;
  visibility?: ShopListingVisibility;
  priceAmount: string;
  priceCurrency?: string;
  geoHint?: string | null;
  mediaPaths?: string[];
}

export interface ShopUpsertListingResult {
  listing: ShopListing;
}

export interface ShopSetListingStatusParams {
  listingId: string;
  status: ShopListingStatus;
}

export interface ShopSetListingStatusResult {
  listing: ShopListing;
}

export interface ShopDeleteListingParams {
  listingId: string;
}

export interface ShopDeleteListingResult {
  ok: true;
  listingId: string;
}

/** Browse card from MarketCache (peer listings). */
export interface MarketBrowseCard {
  listingId: string;
  sellerOwnerId: string;
  shopDisplayName?: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  status: string;
  visibility: ShopListingVisibility;
  price: ShopPrice;
  geoHint?: string;
  updatedAt: string;
  shareUri?: string;
  /** CID / public URL when available. */
  thumbnailRef?: string;
  /** Inline Browse thumb (small JPEG/PNG/WebP). */
  thumbnailContentBase64?: string;
  thumbnailMimeType?: "image/jpeg" | "image/png" | "image/webp";
}

export interface MarketSearchParams {
  /** Empty / omit = recent peer cards (default fill). */
  query?: string;
  limit?: number;
  /** Exact category match when set. */
  category?: ShopListingCategory;
  /** Inclusive minimum price (same currency as currency filter when set). */
  minPrice?: string;
  /** Inclusive maximum price. */
  maxPrice?: string;
  /** Restrict price filter to this currency (default: any / CNY-preferred display). */
  currency?: string;
}

export interface MarketSearchResult {
  cards: MarketBrowseCard[];
}

export type MarketBrowseSuggestionSource = "builtin" | "history" | "interest";

export interface MarketBrowseSuggestionChip {
  id: string;
  query: string;
  source: MarketBrowseSuggestionSource;
}

export interface MarketBrowseSuggestionsResult {
  chips: MarketBrowseSuggestionChip[];
  /** Default fill when Browse opens with an empty box (§7.6). */
  defaultQuery?: string;
}

export interface MarketReportSellerParams {
  sellerOwnerId: string;
  listingId?: string;
  reason?: string;
}

export interface MarketShareListingParams {
  listingId: string;
}

export interface MarketShareListingResult {
  shareUri: string;
  listingId: string;
  sellerOwnerId: string;
}

export interface MarketShortlistItem {
  card: MarketBrowseCard;
  rationale: string;
}

export interface MarketShortlistResult {
  query: string;
  items: MarketShortlistItem[];
}

export interface ShopDraftListingParams {
  /** Free-text notes / caption from the owner (optional). */
  notes?: string;
  /** Camera filename hint when notes are empty. */
  photoFileName?: string;
}

export type ShopDraftListingResult =
  | {
      ok: true;
      draft: {
        title: string;
        description: string;
        category: ShopListingCategory;
        tags: string[];
        priceAmount: string;
        priceCurrency: string;
        condition: ShopListingCondition;
        visibility: ShopListingVisibility;
      };
    }
  | { ok: false; reason: string };

export interface ShopSaveListingMediaParams {
  filename: string;
  contentBase64: string;
  mimeType?: string;
}

export interface ShopSaveListingMediaResult {
  mediaPath: string;
}

export interface ShopGetListingMediaParams {
  listingId: string;
  /** Optional; defaults to first mediaPaths entry. */
  mediaPath?: string;
}

export type ShopGetListingMediaResult =
  | {
      ok: true;
      mediaPath: string;
      contentBase64: string;
      mimeType: string;
    }
  | { ok: false; reason: string };

export interface MarketSuggestSellerReplyParams {
  listingId: string;
  buyerMessage: string;
}

export type MarketSuggestSellerReplyResult =
  | { ok: true; reply: string; listingId: string; title: string }
  | { ok: false; reason: string };

/** Rank Market cards: bonded sellers first, then fresher (MKT-D + referral polish). */
export function rankMarketCards<
  T extends { updatedAt: string; sellerOwnerId?: string },
>(
  cards: T[],
  opts?: { bondLevelByOwner?: ReadonlyMap<string, string> | Record<string, string> },
): T[] {
  const levelOf = (ownerId?: string): number => {
    if (!ownerId || !opts?.bondLevelByOwner) return 2;
    const map = opts.bondLevelByOwner;
    const level = map instanceof Map ? map.get(ownerId) : (map as Record<string, string>)[ownerId];
    if (level === "direct") return 0;
    if (level === "referred") return 1;
    return 2;
  };
  return [...cards].sort((a, b) => {
    const tier = levelOf(a.sellerOwnerId) - levelOf(b.sellerOwnerId);
    if (tier !== 0) return tier;
    const tb = Date.parse(b.updatedAt) || 0;
    const ta = Date.parse(a.updatedAt) || 0;
    return tb - ta;
  });
}

/** True when listing price is within optional min/max (numeric compare). */
export function marketPriceInRange(
  price: { amount: string; currency: string },
  filter?: { minPrice?: string; maxPrice?: string; currency?: string },
): boolean {
  if (!filter) return true;
  const currency = filter.currency?.trim().toUpperCase();
  if (currency && price.currency.toUpperCase() !== currency) return false;
  const amount = Number.parseFloat(price.amount);
  if (!Number.isFinite(amount)) return false;
  if (filter.minPrice != null && filter.minPrice.trim() !== "") {
    const min = Number.parseFloat(filter.minPrice);
    if (Number.isFinite(min) && amount < min) return false;
  }
  if (filter.maxPrice != null && filter.maxPrice.trim() !== "") {
    const max = Number.parseFloat(filter.maxPrice);
    if (Number.isFinite(max) && amount > max) return false;
  }
  return true;
}

/** Pick top N cards with short end-user rationales (deterministic; no LLM required). */
export function shortlistMarketCards<T extends { updatedAt: string; title: string; price: { amount: string; currency: string } }>(
  cards: T[],
  limit = 3,
): Array<{ card: T; rationale: string }> {
  const ranked = rankMarketCards(cards).slice(0, Math.max(1, Math.min(10, limit)));
  return ranked.map((card, i) => {
    const ageMs = Date.now() - (Date.parse(card.updatedAt) || 0);
    const fresh =
      ageMs < 86_400_000
        ? "Updated today"
        : ageMs < 7 * 86_400_000
          ? "Updated this week"
          : "Listed on the mesh";
    const price = `${card.price.amount} ${card.price.currency}`;
    return {
      card,
      rationale:
        i === 0
          ? `Top match — ${card.title} (${price}). ${fresh}.`
          : `${card.title} (${price}). ${fresh}.`,
    };
  });
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "is",
  "at",
]);

/** Normalize free text into search tokens (publish-time + query-time). */
export function buildShopSearchTokens(...parts: Array<string | undefined | null>): string[] {
  const raw = parts.filter(Boolean).join(" ").toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, 64);
}

export function isShopListingCategory(value: string): value is ShopListingCategory {
  return (SHOP_LISTING_CATEGORIES as readonly string[]).includes(value);
}

export function isShopListingVisibility(value: string): value is ShopListingVisibility {
  return value === "public" || value === "bonds";
}

export function normalizeShopPriceAmount(amount: string): string {
  const trimmed = amount.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error("Invalid price amount — use a number like 68.00");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const normalizedFrac = (frac + "00").slice(0, 2);
  return `${whole}.${normalizedFrac}`;
}
