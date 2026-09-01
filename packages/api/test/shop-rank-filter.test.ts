import { describe, expect, it } from "vitest";
import { marketPriceInRange, rankMarketCards } from "@envoymesh/api";

describe("rankMarketCards", () => {
  it("ranks direct bonds before strangers, then by freshness", () => {
    const cards = [
      { sellerOwnerId: "stranger", updatedAt: "2026-08-31T12:00:00.000Z", title: "a" },
      { sellerOwnerId: "friend", updatedAt: "2026-08-30T12:00:00.000Z", title: "b" },
      { sellerOwnerId: "referred", updatedAt: "2026-08-31T18:00:00.000Z", title: "c" },
    ];
    const ranked = rankMarketCards(cards, {
      bondLevelByOwner: {
        friend: "direct",
        referred: "referred",
      },
    });
    expect(ranked.map((c) => c.sellerOwnerId)).toEqual(["friend", "referred", "stranger"]);
  });
});

describe("marketPriceInRange", () => {
  it("filters by min/max and currency", () => {
    expect(
      marketPriceInRange(
        { amount: "50", currency: "CNY" },
        { minPrice: "40", maxPrice: "60", currency: "CNY" },
      ),
    ).toBe(true);
    expect(
      marketPriceInRange(
        { amount: "50", currency: "USD" },
        { minPrice: "40", maxPrice: "60", currency: "CNY" },
      ),
    ).toBe(false);
    expect(
      marketPriceInRange(
        { amount: "10", currency: "CNY" },
        { minPrice: "40" },
      ),
    ).toBe(false);
  });
});
