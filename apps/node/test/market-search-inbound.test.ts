import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
  createMarketCacheStore,
  createShopStore,
} from "@envoymesh/local-store";
import { createMarketSearchPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import {
  handleInboundMarketSearch,
  handleInboundMarketSearchResult,
  matchLocalShopListings,
} from "../src/market-search-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-market-search-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("matchLocalShopListings", () => {
  it("returns public listings to strangers and hides bonds-only", async () => {
    const shop = createShopStore(profileDir);
    await shop.ensureProfile("envoy:owner:seller", "Campus");
    await shop.upsertListing("envoy:owner:seller", {
      title: "Public textbook",
      category: "books",
      tags: ["math"],
      priceAmount: "10",
      visibility: "public",
    });
    await shop.upsertListing("envoy:owner:seller", {
      title: "Friends-only laptop",
      category: "electronics",
      tags: ["laptop"],
      priceAmount: "1000",
      visibility: "bonds",
    });

    const forStranger = await matchLocalShopListings({
      shopStore: shop,
      sellerOwnerId: "envoy:owner:seller",
      shopDisplayName: "Campus",
      bondLevel: "public",
      query: "",
      limit: 10,
    });
    expect(forStranger.map((c) => c.title)).toEqual(["Public textbook"]);

    const forFriend = await matchLocalShopListings({
      shopStore: shop,
      sellerOwnerId: "envoy:owner:seller",
      bondLevel: "direct",
      query: "laptop",
      limit: 10,
    });
    expect(forFriend.map((c) => c.title)).toEqual(["Friends-only laptop"]);
  });
});

describe("handleInboundMarketSearch", () => {
  it("allows public search and returns matching public cards", async () => {
    const shop = createShopStore(profileDir);
    await shop.ensureProfile("envoy:owner:seller", "Campus");
    await shop.upsertListing("envoy:owner:seller", {
      title: "Calculus textbook",
      category: "books",
      tags: ["math"],
      priceAmount: "68",
      visibility: "public",
    });
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-buyer",
        senderPublicKey: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
        senderRole: "human",
        recipientRole: "human",
        intent: "market.search",
        payload: createMarketSearchPayload({ query: "calculus" }),
      }),
      signature: "sig",
    };

    const result = await handleInboundMarketSearch({
      envelope,
      shopStore: shop,
      remotePeerId: "peer-buyer",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:seller",
      shopDisplayName: "Campus",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.title).toBe("Calculus textbook");
    }
  });
});

describe("handleInboundMarketSearchResult", () => {
  it("upserts public cards into MarketCache when seller is directory-resolved", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:seller",
      peerId: "peer-seller",
      listenAddrs: [],
    });

    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-seller",
        senderPublicKey: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
        senderRole: "human",
        recipientRole: "human",
        intent: "market.search.result",
        payload: {
          query: "books",
          respondedAt: "2026-08-31T12:00:00.000Z",
          cards: [
            {
              listingId: "listing_pub",
              sellerOwnerId: "envoy:owner:seller",
              title: "Used novel",
              category: "books",
              tags: [],
              status: "active",
              visibility: "public",
              price: { amount: "20.00", currency: "CNY" },
              searchTokens: ["used", "novel", "books"],
              updatedAt: "2026-08-31T12:00:00.000Z",
            },
          ],
        },
      }),
      signature: "sig",
    };

    const result = await handleInboundMarketSearchResult({
      envelope,
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(result).toEqual({ ok: true, upserted: 1 });
    expect(await marketCache.list({ query: "novel" })).toHaveLength(1);
  });

  it("rejects results when seller owner is unresolved", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-attacker",
        senderPublicKey: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
        senderRole: "human",
        recipientRole: "human",
        intent: "market.search.result",
        payload: {
          query: "books",
          respondedAt: "2026-08-31T12:00:00.000Z",
          cards: [
            {
              listingId: "listing_spoof",
              sellerOwnerId: "envoy:owner:friend",
              title: "Fake friend listing",
              category: "books",
              tags: [],
              status: "active",
              visibility: "public",
              price: { amount: "1.00", currency: "CNY" },
              searchTokens: ["fake"],
              updatedAt: "2026-08-31T12:00:00.000Z",
            },
          ],
        },
      }),
      signature: "sig",
    };

    const result = await handleInboundMarketSearchResult({
      envelope,
      marketCache,
      remotePeerId: "peer-attacker",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unresolved/);
    expect(await marketCache.list()).toHaveLength(0);
  });

  it("drops cards whose sellerOwnerId does not match resolved sender", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:attacker",
      peerId: "peer-attacker",
      listenAddrs: [],
    });

    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-attacker",
        senderPublicKey: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
        senderRole: "human",
        recipientRole: "human",
        intent: "market.search.result",
        payload: {
          query: "books",
          respondedAt: "2026-08-31T12:00:00.000Z",
          cards: [
            {
              listingId: "listing_spoof",
              sellerOwnerId: "envoy:owner:friend",
              title: "Impersonation",
              category: "books",
              tags: [],
              status: "active",
              visibility: "public",
              price: { amount: "1.00", currency: "CNY" },
              searchTokens: ["impersonation"],
              updatedAt: "2026-08-31T12:00:00.000Z",
            },
          ],
        },
      }),
      signature: "sig",
    };

    const result = await handleInboundMarketSearchResult({
      envelope,
      marketCache,
      remotePeerId: "peer-attacker",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(result).toEqual({ ok: true, upserted: 0 });
    expect(await marketCache.list()).toHaveLength(0);
  });
});
