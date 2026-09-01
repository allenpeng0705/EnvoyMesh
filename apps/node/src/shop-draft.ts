/**
 * Phase 63E — shop listing draft helpers (capture → draft) + seller FAQ reply.
 * Deterministic first; optional model later.
 */

import type {
  ShopListingCategory,
  ShopListingCondition,
  ShopListingVisibility,
} from "@envoymesh/api";

const CATEGORY_HINTS: Array<{ category: ShopListingCategory; needles: string[] }> = [
  { category: "books", needles: ["book", "textbook", "novel", "manga", "书", "本"] },
  {
    category: "electronics",
    needles: ["phone", "laptop", "ipad", "camera", "耳机", "电脑", "手机"],
  },
  { category: "clothing", needles: ["shirt", "jacket", "shoes", "dress", "衣", "鞋"] },
  { category: "home", needles: ["furniture", "lamp", "kitchen", "家居", "桌"] },
  { category: "digital", needles: ["license", "code", "ebook", "software", "账号"] },
];

export type ShopListingDraftFields = {
  title: string;
  description: string;
  category: ShopListingCategory;
  tags: string[];
  priceAmount: string;
  priceCurrency: string;
  condition: ShopListingCondition;
  visibility: ShopListingVisibility;
};

function guessCategory(text: string): ShopListingCategory {
  const lower = text.toLowerCase();
  for (const row of CATEGORY_HINTS) {
    if (row.needles.some((n) => lower.includes(n))) return row.category;
  }
  return "other";
}

function firstLineTitle(notes: string, photoFileName?: string): string {
  const line = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (line) return line.slice(0, 80);
  if (photoFileName) {
    const base = photoFileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (base) return base.slice(0, 80);
  }
  return "New listing";
}

/** Build a draft listing from owner notes / photo filename (no model required). */
export function buildShopListingDraft(input: {
  notes?: string;
  photoFileName?: string;
  defaultVisibility?: ShopListingVisibility;
  defaultCurrency?: string;
}): ShopListingDraftFields {
  const notes = (input.notes ?? "").trim();
  const title = firstLineTitle(notes, input.photoFileName);
  const description =
    notes.length > 0
      ? notes.slice(0, 4000)
      : input.photoFileName
        ? `Listed from photo (${input.photoFileName}). Add details before publishing.`
        : "Add a short description before publishing.";
  const category = guessCategory(`${title} ${notes} ${input.photoFileName ?? ""}`);
  const tags =
    category !== "other"
      ? [category]
      : notes
          .toLowerCase()
          .split(/[^a-z0-9\u4e00-\u9fff]+/i)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2)
          .slice(0, 6);
  return {
    title,
    description,
    category,
    tags: [...new Set(tags)].slice(0, 12),
    priceAmount: "0.00",
    priceCurrency: (input.defaultCurrency ?? "CNY").toUpperCase().slice(0, 8),
    condition: "good",
    visibility: input.defaultVisibility ?? "public",
  };
}

/** Suggest a seller reply from listing text + buyer question (deterministic FAQ style). */
export function buildSellerFaqReply(input: {
  listingTitle: string;
  listingDescription: string;
  priceAmount: string;
  priceCurrency: string;
  status: string;
  buyerMessage: string;
}): string {
  const title = input.listingTitle.trim() || "this item";
  const price = `${input.priceAmount} ${input.priceCurrency}`.trim();
  const desc = input.listingDescription.trim();
  const msg = input.buyerMessage.toLowerCase();
  const available =
    input.status === "active"
      ? "Yes — it’s still available."
      : input.status === "reserved"
        ? "It’s currently reserved; I can update you if it frees up."
        : "Sorry — this listing is no longer for sale.";

  if (/price|how much|多少钱|价钱|价格/.test(msg)) {
    return `${available} The listed price is ${price}. Happy to discuss details here.`;
  }
  if (/ship|邮寄|快递|delivery|meetup|见面/.test(msg)) {
    return `${available} We can arrange meetup or shipping after we agree on details. What works for you?`;
  }
  if (/condition|成色|新|旧|损坏/.test(msg)) {
    const snippet = desc ? ` Here’s what’s on the listing: ${desc.slice(0, 240)}` : "";
    return `${available}${snippet}`;
  }
  if (desc) {
    return `${available} About “${title}”: ${desc.slice(0, 280)}${desc.length > 280 ? "…" : ""}`;
  }
  return `${available} Thanks for asking about “${title}” (${price}). What would you like to know?`;
}
