/**
 * Local MarketCache — Phase 63B (Envoy Market / MKT-B).
 * Peer listing cards received via `market.announce` (and later search).
 *
 * File: `{profileDir}/shop/market-cache.json`
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CACHE_FILE = join("shop", "market-cache.json");

export interface MarketCacheCard {
  listingId: string;
  sellerOwnerId: string;
  shopDisplayName?: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  status: string;
  visibility: "public" | "bonds";
  price: { amount: string; currency: string };
  geoHint?: string;
  searchTokens: string[];
  updatedAt: string;
  thumbnailRef?: string;
  thumbnailContentBase64?: string;
  thumbnailMimeType?: "image/jpeg" | "image/png" | "image/webp";
  /** When this card was last received/upserted locally. */
  cachedAt: string;
  source: "announce" | "search" | "share";
}

interface CacheFile {
  version: "0.1";
  cards: MarketCacheCard[];
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = `${JSON.stringify(data, null, 2)}\n`;
  JSON.parse(content);
  const tmp = `${path}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
  await writeFile(tmp, content, { mode: 0o600 });
  await rename(tmp, path);
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function priceInRange(
  price: { amount: string; currency: string },
  filter?: { minPrice?: string; maxPrice?: string; currency?: string },
): boolean {
  if (!filter) return true;
  const currency = filter.currency?.trim().toUpperCase();
  if (currency && price.currency.toUpperCase() !== currency) return false;
  const amount = Number.parseFloat(price.amount);
  if (!Number.isFinite(amount)) return false;
  if (filter.minPrice != null && filter.minPrice.trim() !== "") {
    const min = Number.parseFloat(filter.minPrice);
    if (Number.isFinite(min) && amount < min) return false;
  }
  if (filter.maxPrice != null && filter.maxPrice.trim() !== "") {
    const max = Number.parseFloat(filter.maxPrice);
    if (Number.isFinite(max) && amount > max) return false;
  }
  return true;
}

function cardMatches(card: MarketCacheCard, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = new Set(
    [
      ...card.searchTokens,
      ...card.tags,
      card.category,
      ...card.title.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i),
      ...(card.description ?? "").toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i),
    ]
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
  return tokens.every((t) => [...hay].some((h) => h.includes(t) || t.includes(h)));
}

export interface MarketCacheStore {
  upsert(card: Omit<MarketCacheCard, "cachedAt" | "source"> & { source?: MarketCacheCard["source"] }): Promise<MarketCacheCard>;
  withdraw(listingId: string, sellerOwnerId?: string): Promise<boolean>;
  list(filter?: {
    query?: string;
    limit?: number;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    currency?: string;
  }): Promise<MarketCacheCard[]>;
  get(listingId: string): Promise<MarketCacheCard | null>;
}

export function createMarketCacheStore(profileDir: string): MarketCacheStore {
  const path = join(profileDir, CACHE_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  function enqueueWrite(task: () => Promise<void>): Promise<void> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  async function load(): Promise<CacheFile> {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.cards)) {
        return { version: "0.1", cards: [] };
      }
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) return { version: "0.1", cards: [] };
      throw error;
    }
  }

  return {
    async upsert(input) {
      const now = new Date().toISOString();
      let saved!: MarketCacheCard;
      await enqueueWrite(async () => {
        const file = await load();
        const card: MarketCacheCard = {
          listingId: input.listingId,
          sellerOwnerId: input.sellerOwnerId,
          shopDisplayName: input.shopDisplayName,
          title: input.title,
          description: input.description,
          category: input.category,
          tags: [...(input.tags ?? [])],
          status: input.status,
          visibility: input.visibility === "bonds" ? "bonds" : "public",
          price: { ...input.price },
          geoHint: input.geoHint,
          searchTokens: [...(input.searchTokens ?? [])],
          updatedAt: input.updatedAt,
          thumbnailRef: input.thumbnailRef,
          thumbnailContentBase64: input.thumbnailContentBase64,
          thumbnailMimeType: input.thumbnailMimeType,
          cachedAt: now,
          source: input.source ?? "announce",
        };
        const idx = file.cards.findIndex((c) => c.listingId === card.listingId);
        if (idx >= 0) file.cards[idx] = card;
        else file.cards.push(card);
        // Cap cache size
        if (file.cards.length > 500) {
          file.cards.sort((a, b) => b.cachedAt.localeCompare(a.cachedAt));
          file.cards = file.cards.slice(0, 500);
        }
        await writeJsonAtomic(path, file);
        saved = card;
      });
      return saved;
    },

    async withdraw(listingId, sellerOwnerId) {
      let ok = false;
      await enqueueWrite(async () => {
        const file = await load();
        const next = file.cards.filter((c) => {
          if (c.listingId !== listingId) return true;
          if (sellerOwnerId && c.sellerOwnerId !== sellerOwnerId) return true;
          ok = true;
          return false;
        });
        // Prefer mark withdrawn over delete so UI can show "sold/withdrawn"
        if (ok) {
          const prev = file.cards.find((c) => c.listingId === listingId);
          if (prev && prev.status !== "withdrawn" && prev.status !== "sold") {
            const marked: MarketCacheCard = {
              ...prev,
              status: "withdrawn",
              updatedAt: new Date().toISOString(),
              cachedAt: new Date().toISOString(),
            };
            const idx = file.cards.findIndex((c) => c.listingId === listingId);
            if (idx >= 0) {
              file.cards[idx] = marked;
              await writeJsonAtomic(path, file);
              return;
            }
          }
          await writeJsonAtomic(path, { version: "0.1", cards: next });
        }
      });
      return ok;
    },

    async list(filter) {
      const file = await load();
      const tokens = tokenizeQuery(filter?.query ?? "");
      const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
      const category = filter?.category?.trim().toLowerCase();
      return file.cards
        .filter((c) => c.status === "active" || c.status === "reserved")
        .filter((c) => !category || c.category.toLowerCase() === category)
        .filter((c) =>
          priceInRange(c.price, {
            minPrice: filter?.minPrice,
            maxPrice: filter?.maxPrice,
            currency: filter?.currency,
          }),
        )
        .filter((c) => cardMatches(c, tokens))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);
    },

    async get(listingId) {
      const file = await load();
      return file.cards.find((c) => c.listingId === listingId) ?? null;
    },
  };
}
