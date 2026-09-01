/**
 * Phase 63 — Envoy Market wire schemas (MKT-B+).
 * @see docs/p2p-market-plan.md
 */

import { z } from "zod";

export const MarketListingCategorySchema = z.enum([
  "books",
  "electronics",
  "clothing",
  "home",
  "digital",
  "other",
]);

export const MarketListingStatusSchema = z.enum([
  "active",
  "reserved",
  "sold",
  "withdrawn",
]);

export const MarketListingVisibilitySchema = z.enum(["public", "bonds"]);

export const MarketPriceSchema = z.object({
  amount: z.string().min(1).max(32),
  currency: z.string().min(1).max(8),
});

/** Denormalized listing summary for MarketCache / Browse (no vault paths). */
export const MarketCardSchema = z.object({
  listingId: z.string().min(1).max(80),
  sellerOwnerId: z.string().min(1).max(200),
  shopDisplayName: z.string().max(80).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  category: MarketListingCategorySchema,
  tags: z.array(z.string().min(1).max(64)).max(32).default([]),
  status: MarketListingStatusSchema,
  visibility: MarketListingVisibilitySchema,
  price: MarketPriceSchema,
  geoHint: z.string().max(64).optional(),
  searchTokens: z.array(z.string().min(1).max(64)).max(64).default([]),
  updatedAt: z.string().min(1),
  /** Optional thumbnail ref (CID or public URL) — never private vault paths. */
  thumbnailRef: z.string().max(512).optional(),
  /**
   * Optional inline thumb for Browse (MKT polish). Cap keeps announce envelopes small.
   * Prefer JPEG; omit when larger than ~20KB decoded.
   */
  thumbnailContentBase64: z.string().max(28_000).optional(),
  thumbnailMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
});

export type MarketCard = z.infer<typeof MarketCardSchema>;

/**
 * Seller → bonded peers: upsert or withdraw a MarketCard.
 * `withdraw` removes/marks withdrawn in recipient MarketCache.
 */
export const MarketAnnouncePayloadSchema = z.object({
  action: z.enum(["upsert", "withdraw"]),
  card: MarketCardSchema,
  announcedAt: z.string().min(1),
});

export type MarketAnnouncePayload = z.infer<typeof MarketAnnouncePayloadSchema>;

export function parseMarketAnnouncePayload(input: unknown): MarketAnnouncePayload {
  return MarketAnnouncePayloadSchema.parse(input);
}

export function parseMarketCard(input: unknown): MarketCard {
  return MarketCardSchema.parse(input);
}

export interface CreateMarketAnnouncePayloadInput {
  action: MarketAnnouncePayload["action"];
  card: MarketCard;
  announcedAt?: string;
}

export function createMarketAnnouncePayload(
  input: CreateMarketAnnouncePayloadInput,
): MarketAnnouncePayload {
  return MarketAnnouncePayloadSchema.parse({
    action: input.action,
    card: input.card,
    announcedAt: input.announcedAt ?? new Date().toISOString(),
  });
}

/** Buyer → peers: keyword / tags / category query (MKT-C). */
export const MarketSearchPayloadSchema = z.object({
  query: z.string().max(200).default(""),
  category: MarketListingCategorySchema.optional(),
  limit: z.number().int().min(1).max(20).default(10),
  requestedAt: z.string().min(1),
});

export type MarketSearchPayload = z.infer<typeof MarketSearchPayloadSchema>;

/** Seller → buyer: matching public (or bonds-visible) cards. */
export const MarketSearchResultPayloadSchema = z.object({
  query: z.string().max(200).default(""),
  cards: z.array(MarketCardSchema).max(20),
  respondedAt: z.string().min(1),
});

export type MarketSearchResultPayload = z.infer<typeof MarketSearchResultPayloadSchema>;

export function parseMarketSearchPayload(input: unknown): MarketSearchPayload {
  return MarketSearchPayloadSchema.parse(input);
}

export function parseMarketSearchResultPayload(input: unknown): MarketSearchResultPayload {
  return MarketSearchResultPayloadSchema.parse(input);
}

export interface CreateMarketSearchPayloadInput {
  query?: string;
  category?: MarketCard["category"];
  limit?: number;
  requestedAt?: string;
}

export function createMarketSearchPayload(
  input: CreateMarketSearchPayloadInput = {},
): MarketSearchPayload {
  return MarketSearchPayloadSchema.parse({
    query: input.query ?? "",
    category: input.category,
    limit: input.limit ?? 10,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  });
}

export interface CreateMarketSearchResultPayloadInput {
  query?: string;
  cards: MarketCard[];
  respondedAt?: string;
}

export function createMarketSearchResultPayload(
  input: CreateMarketSearchResultPayloadInput,
): MarketSearchResultPayload {
  return MarketSearchResultPayloadSchema.parse({
    query: input.query ?? "",
    cards: input.cards.slice(0, 20),
    respondedAt: input.respondedAt ?? new Date().toISOString(),
  });
}
