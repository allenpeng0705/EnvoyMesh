import { describe, expect, it } from "vitest";
import {
  buildShopSearchTokens,
  normalizeShopPriceAmount,
  isShopListingCategory,
  isShopListingVisibility,
  rankMarketCards,
  shortlistMarketCards,
} from "../src/shop.js";

describe("shop helpers", () => {
  it("buildShopSearchTokens drops stopwords and dedupes", () => {
    const tokens = buildShopSearchTokens("The Calculus Textbook", "books", "math");
    expect(tokens).toEqual(expect.arrayContaining(["calculus", "textbook", "books", "math"]));
    expect(tokens).not.toContain("the");
  });

  it("normalizeShopPriceAmount pads decimals", () => {
    expect(normalizeShopPriceAmount("68")).toBe("68.00");
    expect(normalizeShopPriceAmount("12.5")).toBe("12.50");
    expect(() => normalizeShopPriceAmount("abc")).toThrow(/Invalid price/);
  });

  it("guards category and visibility", () => {
    expect(isShopListingCategory("books")).toBe(true);
    expect(isShopListingCategory("spaceships")).toBe(false);
    expect(isShopListingVisibility("public")).toBe(true);
    expect(isShopListingVisibility("secret")).toBe(false);
  });

  it("ranks fresher cards first", () => {
    const cards = [
      {
        title: "Old",
        updatedAt: "2026-01-01T00:00:00.000Z",
        price: { amount: "1", currency: "CNY" },
      },
      {
        title: "New",
        updatedAt: "2026-08-31T00:00:00.000Z",
        price: { amount: "2", currency: "CNY" },
      },
    ];
    expect(rankMarketCards(cards).map((c) => c.title)).toEqual(["New", "Old"]);
  });

  it("shortlists with rationales", () => {
    const cards = [
      {
        title: "Clean Code",
        updatedAt: new Date().toISOString(),
        price: { amount: "68", currency: "CNY" },
      },
      {
        title: "Refactoring",
        updatedAt: "2026-01-01T00:00:00.000Z",
        price: { amount: "50", currency: "CNY" },
      },
    ];
    const items = shortlistMarketCards(cards, 2);
    expect(items).toHaveLength(2);
    expect(items[0]!.card.title).toBe("Clean Code");
    expect(items[0]!.rationale).toMatch(/Top match/);
    expect(items[1]!.rationale).toMatch(/Refactoring/);
  });
});
