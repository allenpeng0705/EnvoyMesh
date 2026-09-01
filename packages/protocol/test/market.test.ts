import { describe, expect, it } from "vitest";
import {
  createMarketAnnouncePayload,
  createMarketSearchPayload,
  parseMarketAnnouncePayload,
  parseMarketSearchResultPayload,
} from "../src/market.js";

describe("market.announce payload", () => {
  it("round-trips upsert cards", () => {
    const payload = createMarketAnnouncePayload({
      action: "upsert",
      card: {
        listingId: "listing_abc",
        sellerOwnerId: "envoy:owner:seller",
        shopDisplayName: "Shop",
        title: "Used laptop",
        category: "electronics",
        tags: ["laptop"],
        status: "active",
        visibility: "bonds",
        price: { amount: "1200.00", currency: "CNY" },
        searchTokens: ["used", "laptop", "electronics"],
        updatedAt: "2026-08-31T12:00:00.000Z",
      },
    });
    expect(payload.action).toBe("upsert");
    expect(payload.announcedAt).toMatch(/^\d{4}-/);
    expect(parseMarketAnnouncePayload(payload).card.title).toBe("Used laptop");
  });

  it("rejects empty title", () => {
    expect(() =>
      createMarketAnnouncePayload({
        action: "withdraw",
        card: {
          listingId: "listing_x",
          sellerOwnerId: "envoy:owner:x",
          title: "",
          category: "other",
          tags: [],
          status: "withdrawn",
          visibility: "public",
          price: { amount: "1.00", currency: "USD" },
          searchTokens: [],
          updatedAt: "2026-08-31T12:00:00.000Z",
        },
      }),
    ).toThrow();
  });

  it("creates market.search payloads", () => {
    const search = createMarketSearchPayload({ query: "books", limit: 5 });
    expect(search.query).toBe("books");
    expect(search.limit).toBe(5);
    const result = parseMarketSearchResultPayload({
      query: "books",
      respondedAt: "2026-08-31T12:00:00.000Z",
      cards: [],
    });
    expect(result.cards).toEqual([]);
  });
});
