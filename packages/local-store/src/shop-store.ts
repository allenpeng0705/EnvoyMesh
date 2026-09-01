/**
 * Local shop store — Phase 63A (Envoy Market / MKT-A).
 *
 * Wire types live in `@envoymesh/api` (`shop.ts`); this store persists the same
 * shape without depending on the api package.
 *
 * Files under `{profileDir}/shop/`:
 * - profile.json
 * - listings.json
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SHOP_DIR = "shop";
const PROFILE_FILE = "profile.json";
const LISTINGS_FILE = "listings.json";

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

const CATEGORIES = [
  "books",
  "electronics",
  "clothing",
  "home",
  "digital",
  "other",
] as const;

const CONDITIONS = ["new", "like_new", "good", "fair", "digital"] as const;
const STATUSES = ["active", "reserved", "sold", "withdrawn"] as const;

export type ShopListingCategoryRecord = (typeof CATEGORIES)[number];
export type ShopListingConditionRecord = (typeof CONDITIONS)[number];
export type ShopListingStatusRecord = (typeof STATUSES)[number];
export type ShopListingVisibilityRecord = "public" | "bonds";

export interface ShopProfileRecord {
  shopId: string;
  ownerId: string;
  displayName: string;
  bio: string;
  tags: string[];
  geoHint?: string;
  defaultVisibility: ShopListingVisibilityRecord;
  updatedAt: string;
}

export interface ShopListingRecord {
  version: "0.1";
  listingId: string;
  sellerOwnerId: string;
  title: string;
  description: string;
  category: ShopListingCategoryRecord;
  tags: string[];
  condition: ShopListingConditionRecord;
  status: ShopListingStatusRecord;
  visibility: ShopListingVisibilityRecord;
  price: { amount: string; currency: string };
  geoHint?: string;
  mediaPaths: string[];
  searchTokens: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShopUpsertListingInput {
  listingId?: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  condition?: ShopListingConditionRecord;
  status?: ShopListingStatusRecord;
  visibility?: ShopListingVisibilityRecord;
  priceAmount: string;
  priceCurrency?: string;
  geoHint?: string | null;
  mediaPaths?: string[];
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function buildSearchTokens(...parts: Array<string | undefined | null>): string[] {
  const raw = parts.filter(Boolean).join(" ").toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, 64);
}

function normalizePriceAmount(amount: string): string {
  const trimmed = amount.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error("Invalid price amount — use a number like 68.00");
  }
  const [whole, frac = ""] = trimmed.split(".");
  return `${whole}.${(frac + "00").slice(0, 2)}`;
}

interface ListingsFile {
  version: "0.1";
  listings: ShopListingRecord[];
}

export interface ShopStore {
  getProfile(): Promise<ShopProfileRecord | null>;
  ensureProfile(ownerId: string, displayNameHint?: string): Promise<ShopProfileRecord>;
  updateProfile(
    ownerId: string,
    patch: {
      displayName?: string;
      bio?: string;
      tags?: string[];
      geoHint?: string | null;
      defaultVisibility?: ShopListingVisibilityRecord;
    },
  ): Promise<ShopProfileRecord>;
  listListings(filter?: { status?: ShopListingStatusRecord }): Promise<ShopListingRecord[]>;
  getListing(listingId: string): Promise<ShopListingRecord | null>;
  upsertListing(ownerId: string, params: ShopUpsertListingInput): Promise<ShopListingRecord>;
  setListingStatus(
    ownerId: string,
    listingId: string,
    status: ShopListingStatusRecord,
  ): Promise<ShopListingRecord>;
  deleteListing(ownerId: string, listingId: string): Promise<boolean>;
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = `${JSON.stringify(data, null, 2)}\n`;
  JSON.parse(content);
  const tmp = `${path}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
  await writeFile(tmp, content, { mode: 0o600 });
  await rename(tmp, path);
}

function defaultProfile(ownerId: string, displayNameHint?: string): ShopProfileRecord {
  return {
    shopId: `shop_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    ownerId,
    displayName: (displayNameHint?.trim() || "My Shop").slice(0, 80),
    bio: "",
    tags: [],
    defaultVisibility: "public",
    updatedAt: new Date().toISOString(),
  };
}

export function createShopStore(profileDir: string): ShopStore {
  const shopDir = join(profileDir, SHOP_DIR);
  const profilePath = join(shopDir, PROFILE_FILE);
  const listingsPath = join(shopDir, LISTINGS_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  function enqueueWrite(task: () => Promise<void>): Promise<void> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  async function loadListingsFile(): Promise<ListingsFile> {
    try {
      const raw = await readFile(listingsPath, "utf8");
      const parsed = JSON.parse(raw) as ListingsFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.listings)) {
        return { version: "0.1", listings: [] };
      }
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) return { version: "0.1", listings: [] };
      throw error;
    }
  }

  return {
    async getProfile() {
      try {
        return JSON.parse(await readFile(profilePath, "utf8")) as ShopProfileRecord;
      } catch (error) {
        if (isMissingFileError(error)) return null;
        throw error;
      }
    },

    async ensureProfile(ownerId, displayNameHint) {
      const existing = await this.getProfile();
      if (existing) return existing;
      const profile = defaultProfile(ownerId, displayNameHint);
      await enqueueWrite(async () => {
        await writeJsonAtomic(profilePath, profile);
      });
      return profile;
    },

    async updateProfile(ownerId, patch) {
      let next!: ShopProfileRecord;
      await enqueueWrite(async () => {
        const existing = await this.getProfile();
        const base = existing ?? defaultProfile(ownerId);
        next = {
          ...base,
          ownerId,
          displayName:
            patch.displayName !== undefined
              ? patch.displayName.trim().slice(0, 80) || base.displayName
              : base.displayName,
          bio: patch.bio !== undefined ? patch.bio.trim().slice(0, 2000) : base.bio,
          tags:
            patch.tags !== undefined
              ? [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(
                  0,
                  32,
                )
              : base.tags,
          geoHint:
            patch.geoHint === null
              ? undefined
              : patch.geoHint !== undefined
                ? patch.geoHint.trim().slice(0, 64) || undefined
                : base.geoHint,
          defaultVisibility:
            patch.defaultVisibility === "bonds" || patch.defaultVisibility === "public"
              ? patch.defaultVisibility
              : base.defaultVisibility,
          updatedAt: new Date().toISOString(),
        };
        await writeJsonAtomic(profilePath, next);
      });
      return next;
    },

    async listListings(filter) {
      const file = await loadListingsFile();
      const list = filter?.status
        ? file.listings.filter((l) => l.status === filter.status)
        : file.listings;
      return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getListing(listingId) {
      const file = await loadListingsFile();
      return file.listings.find((l) => l.listingId === listingId) ?? null;
    },

    async upsertListing(ownerId, params) {
      const title = params.title.trim().slice(0, 200);
      if (!title) throw new Error("Title is required");
      const amount = normalizePriceAmount(params.priceAmount);
      const currency = (params.priceCurrency?.trim() || "CNY").toUpperCase().slice(0, 8);
      const category: ShopListingCategoryRecord = (
        CATEGORIES as readonly string[]
      ).includes(params.category ?? "")
        ? (params.category as ShopListingCategoryRecord)
        : "other";
      const condition: ShopListingConditionRecord = (
        CONDITIONS as readonly string[]
      ).includes(params.condition ?? "")
        ? (params.condition as ShopListingConditionRecord)
        : "good";
      const status: ShopListingStatusRecord = (
        STATUSES as readonly string[]
      ).includes(params.status ?? "")
        ? (params.status as ShopListingStatusRecord)
        : "active";
      let visibility: ShopListingVisibilityRecord =
        params.visibility === "bonds" || params.visibility === "public"
          ? params.visibility
          : "public";
      if (params.visibility === undefined) {
        const profile = await this.getProfile();
        if (profile?.defaultVisibility) visibility = profile.defaultVisibility;
      }
      const tags = [
        ...new Set((params.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
      ].slice(0, 32);
      const description = (params.description ?? "").trim().slice(0, 4000);
      const mediaPaths = (params.mediaPaths ?? [])
        .map((p) => p.trim().replace(/^[\\/]+/, ""))
        .filter((p) => p.startsWith("shop-media/") && !p.includes(".."))
        .slice(0, 12);
      const geoHint =
        params.geoHint === null
          ? undefined
          : params.geoHint?.trim().slice(0, 64) || undefined;
      const searchTokens = buildSearchTokens(title, category, tags.join(" "), description);
      const now = new Date().toISOString();

      let saved!: ShopListingRecord;
      await enqueueWrite(async () => {
        const file = await loadListingsFile();
        const listingId = params.listingId?.trim();
        if (listingId) {
          const idx = file.listings.findIndex((l) => l.listingId === listingId);
          if (idx < 0) throw new Error(`Listing not found: ${listingId}`);
          const prev = file.listings[idx]!;
          if (prev.sellerOwnerId !== ownerId) {
            throw new Error("Cannot edit another owner's listing");
          }
          saved = {
            ...prev,
            title,
            description,
            category,
            tags,
            condition,
            status,
            visibility,
            price: { amount, currency },
            geoHint,
            mediaPaths,
            searchTokens,
            updatedAt: now,
          };
          file.listings[idx] = saved;
        } else {
          saved = {
            version: "0.1",
            listingId: `listing_${randomUUID().replace(/-/g, "")}`,
            sellerOwnerId: ownerId,
            title,
            description,
            category,
            tags,
            condition,
            status,
            visibility,
            price: { amount, currency },
            geoHint,
            mediaPaths,
            searchTokens,
            createdAt: now,
            updatedAt: now,
          };
          file.listings.push(saved);
        }
        await writeJsonAtomic(listingsPath, { version: "0.1", listings: file.listings });
      });
      return saved;
    },

    async setListingStatus(ownerId, listingId, status) {
      if (!(STATUSES as readonly string[]).includes(status)) {
        throw new Error(`Invalid listing status: ${status}`);
      }
      let saved!: ShopListingRecord;
      await enqueueWrite(async () => {
        const file = await loadListingsFile();
        const idx = file.listings.findIndex((l) => l.listingId === listingId);
        if (idx < 0) throw new Error(`Listing not found: ${listingId}`);
        const prev = file.listings[idx]!;
        if (prev.sellerOwnerId !== ownerId) {
          throw new Error("Cannot change status of another owner's listing");
        }
        saved = {
          ...prev,
          status,
          updatedAt: new Date().toISOString(),
        };
        file.listings[idx] = saved;
        await writeJsonAtomic(listingsPath, { version: "0.1", listings: file.listings });
      });
      return saved;
    },

    async deleteListing(ownerId, listingId) {
      let ok = false;
      await enqueueWrite(async () => {
        const file = await loadListingsFile();
        const prev = file.listings.find((l) => l.listingId === listingId);
        if (!prev) return;
        if (prev.sellerOwnerId !== ownerId) {
          throw new Error("Cannot delete another owner's listing");
        }
        const next = file.listings.filter((l) => l.listingId !== listingId);
        ok = next.length !== file.listings.length;
        if (ok) {
          await writeJsonAtomic(listingsPath, { version: "0.1", listings: next });
        }
      });
      return ok;
    },
  };
}
