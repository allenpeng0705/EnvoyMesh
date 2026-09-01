/**
 * Phase 63C — inbound `market.search` / `market.search.result`.
 */

import {
  evaluatePolicy,
  checkPublicKnowledgeRateLimit,
  type BondLevel,
} from "@envoymesh/bonds";
import {
  createAuditEvent,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type MarketCacheStore,
  type ShopStore,
} from "@envoymesh/local-store";
import {
  createMarketSearchResultPayload,
  parseMarketSearchPayload,
  parseMarketSearchResultPayload,
  type EnvoyEnvelope,
  type MarketCard,
  type MarketSearchPayload,
  type MarketSearchResultPayload,
} from "@envoymesh/protocol";
import { resolveSenderOwnerId } from "./share-inbound.js";

export type MarketSearchInboundResult =
  | { ok: true; cards: MarketCard[]; query: string }
  | { ok: false; reason: string; skipped?: boolean };

export type MarketSearchResultInboundResult =
  | { ok: true; upserted: number }
  | { ok: false; reason: string; skipped?: boolean };

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function listingMatches(
  listing: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    searchTokens: string[];
    status: string;
    price: { amount: string; currency: string };
  },
  tokens: string[],
  category?: string,
  priceFilter?: { minPrice?: string; maxPrice?: string; currency?: string },
): boolean {
  if (listing.status !== "active" && listing.status !== "reserved") return false;
  if (category && listing.category !== category) return false;
  if (priceFilter) {
    const currency = priceFilter.currency?.trim().toUpperCase();
    if (currency && listing.price.currency.toUpperCase() !== currency) return false;
    const amount = Number.parseFloat(listing.price.amount);
    if (!Number.isFinite(amount)) return false;
    if (priceFilter.minPrice != null && priceFilter.minPrice.trim() !== "") {
      const min = Number.parseFloat(priceFilter.minPrice);
      if (Number.isFinite(min) && amount < min) return false;
    }
    if (priceFilter.maxPrice != null && priceFilter.maxPrice.trim() !== "") {
      const max = Number.parseFloat(priceFilter.maxPrice);
      if (Number.isFinite(max) && amount > max) return false;
    }
  }
  if (tokens.length === 0) return true;
  const hay = new Set(
    [
      ...listing.searchTokens,
      ...listing.tags,
      listing.category,
      ...listing.title.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i),
      ...listing.description.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i),
    ]
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
  return tokens.every((t) => [...hay].some((h) => h.includes(t) || t.includes(h)));
}

/** Match local shop listings visible to the requester's bond level. */
export function matchLocalShopListings(input: {
  shopStore: ShopStore;
  shopDisplayName?: string;
  sellerOwnerId: string;
  bondLevel: BondLevel;
  query: string;
  category?: MarketCard["category"];
  minPrice?: string;
  maxPrice?: string;
  currency?: string;
  limit: number;
  /** Optional inline thumbs keyed by listingId (announce/search polish). */
  thumbnailsByListingId?: Map<
    string,
    {
      thumbnailContentBase64: string;
      thumbnailMimeType: "image/jpeg" | "image/png" | "image/webp";
    }
  >;
}): Promise<MarketCard[]> {
  return input.shopStore.listListings().then((listings) => {
    const tokens = tokenize(input.query);
    const allowBonds = input.bondLevel === "direct" || input.bondLevel === "referred";
    const priceFilter = {
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      currency: input.currency,
    };
    return listings
      .filter((l) => {
        if (l.visibility === "bonds" && !allowBonds) return false;
        if (l.visibility !== "public" && l.visibility !== "bonds") return false;
        return listingMatches(l, tokens, input.category, priceFilter);
      })
      .slice(0, input.limit)
      .map((l): MarketCard => {
        const thumb = input.thumbnailsByListingId?.get(l.listingId);
        return {
          listingId: l.listingId,
          sellerOwnerId: input.sellerOwnerId,
          shopDisplayName: input.shopDisplayName,
          title: l.title,
          description: l.description || undefined,
          category: l.category as MarketCard["category"],
          tags: l.tags,
          status: l.status as MarketCard["status"],
          visibility: l.visibility,
          price: l.price,
          geoHint: l.geoHint,
          searchTokens: l.searchTokens,
          updatedAt: l.updatedAt,
          ...(thumb
            ? {
                thumbnailContentBase64: thumb.thumbnailContentBase64,
                thumbnailMimeType: thumb.thumbnailMimeType,
              }
            : {}),
        };
      });
  });
}

export async function handleInboundMarketSearch(input: {
  envelope: EnvoyEnvelope;
  shopStore: ShopStore | null;
  remotePeerId: string;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore?: LocalTaskStore;
  localOwnerId: string;
  shopDisplayName?: string;
}): Promise<MarketSearchInboundResult> {
  const { envelope, shopStore, trustStore, taskStore, remotePeerId } = input;
  if (envelope.intent !== "market.search") {
    return { ok: false, reason: "not market.search" };
  }
  if (!shopStore) return { ok: false, reason: "shop unavailable" };

  let payload: MarketSearchPayload;
  try {
    payload = parseMarketSearchPayload(envelope.payload);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "invalid market.search payload",
    };
  }

  const resolvedOwnerId = await resolveSenderOwnerId(
    envelope.senderPeerId,
    remotePeerId,
    input.peerDirectoryStore,
  );
  // Search does not require prior directory entry — treat as public if unknown.
  const senderOwnerId = resolvedOwnerId ?? `unresolved:${remotePeerId}`;
  const bondLevel: BondLevel =
    (resolvedOwnerId
      ? (await trustStore.getTrustRecord(resolvedOwnerId))?.level
      : undefined) ?? "public";

  const policy = evaluatePolicy({
    peerId: envelope.senderPeerId,
    bondLevel,
    intent: "market.search",
  });

  if (taskStore) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "market.search",
        outcome: policy.action === "allow" ? "allow" : "deny",
        summary:
          policy.action === "allow"
            ? `market.search allowed (${bondLevel})`
            : `market.search denied: ${"reason" in policy ? policy.reason : policy.action}`,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId ?? envelope.messageId,
      }),
    );
  }

  if (policy.action !== "allow") {
    return {
      ok: false,
      reason: "reason" in policy ? (policy.reason ?? policy.action) : policy.action,
    };
  }

  if (bondLevel === "public" || bondLevel === "blocked") {
    if (bondLevel === "blocked") {
      return { ok: false, reason: "peer is blocked" };
    }
    const rate = checkPublicKnowledgeRateLimit(remotePeerId, 8, 60_000);
    if (!rate.allowed) {
      return { ok: false, reason: "rate limited" };
    }
  }

  const cards = await matchLocalShopListings({
    shopStore,
    shopDisplayName: input.shopDisplayName,
    sellerOwnerId: input.localOwnerId,
    bondLevel,
    query: payload.query,
    category: payload.category,
    limit: payload.limit,
  });

  return { ok: true, cards, query: payload.query };
}

export function buildMarketSearchResultPayload(input: {
  query: string;
  cards: MarketCard[];
}): MarketSearchResultPayload {
  return createMarketSearchResultPayload({
    query: input.query,
    cards: input.cards,
  });
}

export async function handleInboundMarketSearchResult(input: {
  envelope: EnvoyEnvelope;
  marketCache: MarketCacheStore;
  remotePeerId: string;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore?: LocalTaskStore;
  localOwnerId?: string;
}): Promise<MarketSearchResultInboundResult> {
  const { envelope, marketCache, trustStore, taskStore, remotePeerId } = input;
  if (envelope.intent !== "market.search.result") {
    return { ok: false, reason: "not market.search.result" };
  }

  let payload: MarketSearchResultPayload;
  try {
    payload = parseMarketSearchResultPayload(envelope.payload);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "invalid market.search.result payload",
    };
  }

  const resolvedOwnerId = await resolveSenderOwnerId(
    envelope.senderPeerId,
    remotePeerId,
    input.peerDirectoryStore,
  );
  // Same bar as market.announce: unknown signers must not spoof sellerOwnerId
  // (e.g. impersonate a bonded friend) into MarketCache.
  if (!resolvedOwnerId) {
    return { ok: false, reason: "seller owner unresolved" };
  }

  const bondLevel: BondLevel =
    (await trustStore.getTrustRecord(resolvedOwnerId))?.level ?? "public";

  const policy = evaluatePolicy({
    peerId: envelope.senderPeerId,
    bondLevel,
    intent: "market.search.result",
  });
  if (policy.action !== "allow") {
    return {
      ok: false,
      reason: "reason" in policy ? (policy.reason ?? policy.action) : policy.action,
    };
  }

  let upserted = 0;
  for (const card of payload.cards) {
    if (card.sellerOwnerId !== resolvedOwnerId) continue;
    if (input.localOwnerId && card.sellerOwnerId === input.localOwnerId) continue;
    // Strangers may only contribute public cards into cache.
    if (
      bondLevel !== "direct" &&
      bondLevel !== "referred" &&
      card.visibility !== "public"
    ) {
      continue;
    }
    await marketCache.upsert({
      ...card,
      sellerOwnerId: resolvedOwnerId,
      source: "search",
    });
    upserted += 1;
  }

  if (taskStore && upserted > 0) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "market.search.result",
        outcome: "record",
        summary: `market.search.result upserted ${upserted} card(s)`,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId ?? envelope.messageId,
      }),
    );
  }

  return { ok: true, upserted };
}
