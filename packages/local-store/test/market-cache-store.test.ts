import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMarketCacheStore } from "../src/market-cache-store.js";

describe("createMarketCacheStore", () => {
  it("upserts, searches, and withdraws peer cards", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-market-cache-"));
    try {
      const store = createMarketCacheStore(dir);
      await store.upsert({
        listingId: "listing_1",
        sellerOwnerId: "envoy:owner:seller",
        shopDisplayName: "Campus",
        title: "Calculus textbook",
        description: "Clean notes",
        category: "books",
        tags: ["math"],
        status: "active",
        visibility: "public",
        price: { amount: "68.00", currency: "CNY" },
        searchTokens: ["calculus", "textbook", "books", "math"],
        updatedAt: "2026-08-31T10:00:00.000Z",
      });

      const recent = await store.list({ limit: 10 });
      expect(recent).toHaveLength(1);
      expect(recent[0]?.title).toBe("Calculus textbook");

      const hit = await store.list({ query: "calculus" });
      expect(hit).toHaveLength(1);

      const miss = await store.list({ query: "electronics" });
      expect(miss).toHaveLength(0);

      await store.withdraw("listing_1", "envoy:owner:seller");
      expect(await store.list()).toHaveLength(0);
      const got = await store.get("listing_1");
      expect(got?.status).toBe("withdrawn");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
