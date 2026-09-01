import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { buildSellerFaqReply, buildShopListingDraft } from "../src/shop-draft.js";
import { saveShopListingMedia } from "../src/shop-listing-media.js";

describe("buildShopListingDraft", () => {
  it("uses first note line as title and guesses books category", () => {
    const draft = buildShopListingDraft({
      notes: "Used textbook for calculus\nStill clean, no marks.",
    });
    expect(draft.title).toBe("Used textbook for calculus");
    expect(draft.category).toBe("books");
    expect(draft.tags).toContain("books");
    expect(draft.priceAmount).toBe("0.00");
    expect(draft.visibility).toBe("public");
  });

  it("falls back to photo filename when notes empty", () => {
    const draft = buildShopListingDraft({
      photoFileName: "vintage_lamp.jpg",
      defaultVisibility: "bonds",
      defaultCurrency: "usd",
    });
    expect(draft.title).toBe("vintage lamp");
    expect(draft.category).toBe("home");
    expect(draft.visibility).toBe("bonds");
    expect(draft.priceCurrency).toBe("USD");
    expect(draft.description).toMatch(/vintage_lamp\.jpg/);
  });
});

describe("buildSellerFaqReply", () => {
  it("answers price questions from listing fields", () => {
    const reply = buildSellerFaqReply({
      listingTitle: "Bike",
      listingDescription: "City bike, good brakes.",
      priceAmount: "120",
      priceCurrency: "CNY",
      status: "active",
      buyerMessage: "How much is it?",
    });
    expect(reply).toMatch(/still available/i);
    expect(reply).toMatch(/120 CNY/);
  });

  it("mentions reserved when status is reserved", () => {
    const reply = buildSellerFaqReply({
      listingTitle: "Chair",
      listingDescription: "",
      priceAmount: "40",
      priceCurrency: "CNY",
      status: "reserved",
      buyerMessage: "Is it available?",
    });
    expect(reply).toMatch(/reserved/i);
  });
});

describe("saveShopListingMedia", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-shop-media-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("writes under shop-media/ and returns relative path", async () => {
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const result = await saveShopListingMedia(profileDir, {
      filename: "photo.png",
      contentBase64: tinyPng.toString("base64"),
      mimeType: "image/png",
    });
    expect(result.mediaPath).toMatch(/^shop-media\/listing_[a-f0-9]+\.png$/);
    const bytes = await readFile(join(profileDir, result.mediaPath));
    expect(bytes.byteLength).toBe(tinyPng.byteLength);
  });

  it("rejects empty payload", async () => {
    await expect(
      saveShopListingMedia(profileDir, {
        filename: "x.jpg",
        contentBase64: "",
      }),
    ).rejects.toThrow(/contentBase64/i);
  });

  it("rejects oversized base64 before decode", async () => {
    const huge = "A".repeat(Math.ceil(8 * 1024 * 1024 * 1.4) + 100);
    await expect(
      saveShopListingMedia(profileDir, {
        filename: "big.jpg",
        contentBase64: huge,
      }),
    ).rejects.toThrow(/too large/i);
  });
});
