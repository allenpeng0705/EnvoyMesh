import {
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createMarketCacheStore,
} from "@envoymesh/local-store";
import { createMarketAnnouncePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMarketAnnounce } from "../src/market-announce-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-market-announce-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function card(overrides: Partial<ReturnType<typeof baseCard>> = {}) {
  return { ...baseCard(), ...overrides };
}

function baseCard() {
  return {
    listingId: "listing_calc",
    sellerOwnerId: "envoy:owner:seller",
    shopDisplayName: "Campus",
    title: "Calculus textbook",
    description: "Clean notes",
    category: "books" as const,
    tags: ["math"],
    status: "active" as const,
    visibility: "public" as const,
    price: { amount: "68.00", currency: "CNY" },
    searchTokens: ["calculus", "textbook", "books", "math"],
    updatedAt: "2026-08-31T12:00:00.000Z",
  };
}

function announceEnvelope(action: "upsert" | "withdraw", listing = card()) {
  const payload = createMarketAnnouncePayload({ action, card: listing });
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-seller",
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----",
      senderRole: "human",
      recipientRole: "human",
      intent: "market.announce",
      payload,
      createdAt: "2026-08-31T12:00:00.000Z",
      messageId: `market-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundMarketAnnounce", () => {
  it("upserts into MarketCache for a direct bond", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:seller",
      peerId: "peer-seller",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:seller",
      level: "direct",
    });

    const result = await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert"),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      taskStore,
      localOwnerId: "envoy:owner:buyer",
    });

    expect(result).toEqual({ ok: true, listingId: "listing_calc", action: "upsert" });
    const listed = await marketCache.list({ query: "calculus" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe("Calculus textbook");
  });

  it("denies public (stranger) senders", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:stranger",
      peerId: "peer-seller",
      listenAddrs: [],
    });

    const result = await handleInboundMarketAnnounce({
      envelope: announceEnvelope(
        "upsert",
        card({ sellerOwnerId: "envoy:owner:stranger" }),
      ),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });

    expect(result.ok).toBe(false);
    expect(await marketCache.list()).toHaveLength(0);
  });

  it("withdraws a previously cached listing", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:seller",
      peerId: "peer-seller",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:seller",
      level: "referred",
    });

    await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert"),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(await marketCache.list()).toHaveLength(1);

    const withdrawn = await handleInboundMarketAnnounce({
      envelope: announceEnvelope(
        "withdraw",
        card({ status: "withdrawn" }),
      ),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(withdrawn).toEqual({
      ok: true,
      listingId: "listing_calc",
      action: "withdraw",
    });
    expect(await marketCache.list()).toHaveLength(0);
  });

  it("ignores self announces", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:seller",
      peerId: "peer-seller",
      listenAddrs: [],
    });

    const result = await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert"),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:seller",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.skipped).toBe(true);
  });

  it("rejects spoofed sellerOwnerId when sender is unresolved", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // Victim trusts a real friend — attacker is not in the directory.
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:seller",
      level: "direct",
    });

    const result = await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert"),
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

  it("rejects sellerOwnerId that does not match resolved sender", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:attacker",
      peerId: "peer-seller",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:seller",
      level: "direct",
    });

    const result = await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert"), // card claims envoy:owner:seller
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not match/);
    expect(await marketCache.list()).toHaveLength(0);
  });

  it("upserts sold so cache keeps Sold (not collapsed to withdrawn)", async () => {
    const marketCache = createMarketCacheStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:seller",
      peerId: "peer-seller",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:seller",
      level: "direct",
    });

    await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert"),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(await marketCache.list()).toHaveLength(1);

    const sold = await handleInboundMarketAnnounce({
      envelope: announceEnvelope("upsert", card({ status: "sold" })),
      marketCache,
      remotePeerId: "peer-seller",
      trustStore,
      peerDirectoryStore,
      localOwnerId: "envoy:owner:buyer",
    });
    expect(sold).toEqual({
      ok: true,
      listingId: "listing_calc",
      action: "upsert",
    });
    // Browse list hides sold; get still returns Sold for soft-close UI.
    expect(await marketCache.list()).toHaveLength(0);
    const cached = await marketCache.get("listing_calc");
    expect(cached?.status).toBe("sold");
  });
});
