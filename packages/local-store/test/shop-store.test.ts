import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createShopStore } from "../src/shop-store.js";

describe("createShopStore", () => {
  it("ensures profile and upserts listings with search tokens", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-shop-"));
    try {
      const store = createShopStore(dir);
      const profile = await store.ensureProfile("envoy:owner:abc", "Campus Shop");
      expect(profile.displayName).toBe("Campus Shop");
      expect(profile.defaultVisibility).toBe("public");

      const listing = await store.upsertListing("envoy:owner:abc", {
        title: "Calculus textbook",
        description: "Used once, clean notes",
        category: "books",
        tags: ["math", "textbook"],
        priceAmount: "68",
        priceCurrency: "CNY",
      });
      expect(listing.listingId).toMatch(/^listing_/);
      expect(listing.price.amount).toBe("68.00");
      expect(listing.visibility).toBe("public");
      expect(listing.searchTokens).toEqual(
        expect.arrayContaining(["calculus", "textbook", "books", "math"]),
      );

      const listed = await store.listListings();
      expect(listed).toHaveLength(1);

      const sold = await store.setListingStatus("envoy:owner:abc", listing.listingId, "sold");
      expect(sold.status).toBe("sold");

      const updated = await store.upsertListing("envoy:owner:abc", {
        listingId: listing.listingId,
        title: "Calculus textbook (sold)",
        priceAmount: "60.5",
        visibility: "bonds",
      });
      expect(updated.price.amount).toBe("60.50");
      expect(updated.visibility).toBe("bonds");

      await expect(
        store.setListingStatus("envoy:owner:other", listing.listingId, "active"),
      ).rejects.toThrow(/another owner/);

      expect(await store.deleteListing("envoy:owner:abc", listing.listingId)).toBe(true);
      expect(await store.listListings()).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid price amounts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-shop-"));
    try {
      const store = createShopStore(dir);
      await store.ensureProfile("envoy:owner:abc");
      await expect(
        store.upsertListing("envoy:owner:abc", {
          title: "Bad price",
          priceAmount: "twelve",
        }),
      ).rejects.toThrow(/Invalid price/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
