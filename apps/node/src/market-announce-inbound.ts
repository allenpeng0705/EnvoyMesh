/**
 * Phase 63B — inbound `market.announce` → MarketCache.
 */

import { evaluatePolicy, type BondLevel } from "@envoymesh/bonds";
import {
  createAuditEvent,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type MarketCacheStore,
} from "@envoymesh/local-store";
import {
  parseMarketAnnouncePayload,
  type EnvoyEnvelope,
  type MarketAnnouncePayload,
} from "@envoymesh/protocol";
import { resolveSenderOwnerId } from "./share-inbound.js";

export type MarketAnnounceInboundResult =
  | { ok: true; listingId: string; action: "upsert" | "withdraw" }
  | { ok: false; reason: string; skipped?: boolean };

export async function handleInboundMarketAnnounce(input: {
  envelope: EnvoyEnvelope;
  marketCache: MarketCacheStore;
  remotePeerId: string;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore?: LocalTaskStore;
  /** Local owner id — ignore self echoes. */
  localOwnerId?: string;
}): Promise<MarketAnnounceInboundResult> {
  const { envelope, marketCache, trustStore, taskStore, remotePeerId } = input;

  if (envelope.intent !== "market.announce") {
    return { ok: false, reason: "not market.announce" };
  }

  let payload: MarketAnnouncePayload;
  try {
    payload = parseMarketAnnouncePayload(envelope.payload);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "invalid market.announce payload",
    };
  }

  const resolvedOwnerId = await resolveSenderOwnerId(
    envelope.senderPeerId,
    remotePeerId,
    input.peerDirectoryStore,
  );
  // Require a directory-resolved owner so an unknown signer cannot spoof
  // card.sellerOwnerId as a bonded friend and poison MarketCache.
  if (!resolvedOwnerId) {
    return { ok: false, reason: "seller owner unresolved" };
  }
  if (resolvedOwnerId !== payload.card.sellerOwnerId) {
    return { ok: false, reason: "sellerOwnerId does not match sender" };
  }
  const senderOwnerId = resolvedOwnerId;
  if (input.localOwnerId && senderOwnerId === input.localOwnerId) {
    return { ok: false, reason: "ignore self announce", skipped: true };
  }

  const bondLevel: BondLevel =
    (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public";

  const policy = evaluatePolicy({
    peerId: envelope.senderPeerId,
    bondLevel,
    intent: "market.announce",
  });

  if (taskStore) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "market.announce",
        outcome: policy.action === "allow" ? "allow" : "deny",
        summary:
          policy.action === "allow"
            ? `market.announce allowed (${bondLevel})`
            : `market.announce denied: ${"reason" in policy ? policy.reason : policy.action}`,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId ?? envelope.messageId,
      }),
    );
  }

  if (policy.action !== "allow") {
    return {
      ok: false,
      reason: "reason" in policy ? (policy.reason ?? policy.action) : policy.action,
    };
  }

  // Bonds-only listings: only keep if we are bonded (already required by policy for MKT-B).
  if (payload.card.visibility === "bonds" && bondLevel !== "direct" && bondLevel !== "referred") {
    return { ok: false, reason: "bonds-only listing", skipped: true };
  }

  // Soft-close (MKT-F): sold upserts with status=sold so peers retain Sold (not
  // collapsed to withdrawn). Explicit withdraw / withdrawn still mark withdrawn.
  if (payload.card.status === "sold") {
    await marketCache.upsert({
      listingId: payload.card.listingId,
      sellerOwnerId: payload.card.sellerOwnerId,
      shopDisplayName: payload.card.shopDisplayName,
      title: payload.card.title,
      description: payload.card.description,
      category: payload.card.category,
      tags: payload.card.tags,
      status: "sold",
      visibility: payload.card.visibility,
      price: payload.card.price,
      geoHint: payload.card.geoHint,
      searchTokens: payload.card.searchTokens,
      updatedAt: payload.card.updatedAt,
      thumbnailRef: payload.card.thumbnailRef,
      thumbnailContentBase64: payload.card.thumbnailContentBase64,
      thumbnailMimeType: payload.card.thumbnailMimeType,
      source: "announce",
    });
    if (taskStore) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: "market.announce",
          outcome: "record",
          summary: `market.announce sold: ${payload.card.title.slice(0, 80)}`,
          remotePeerId: envelope.senderPeerId,
          correlationId: envelope.correlationId ?? envelope.messageId,
        }),
      );
    }
    return { ok: true, listingId: payload.card.listingId, action: "upsert" };
  }

  if (payload.action === "withdraw" || payload.card.status === "withdrawn") {
    await marketCache.withdraw(payload.card.listingId, payload.card.sellerOwnerId);
    return { ok: true, listingId: payload.card.listingId, action: "withdraw" };
  }

  await marketCache.upsert({
    listingId: payload.card.listingId,
    sellerOwnerId: payload.card.sellerOwnerId,
    shopDisplayName: payload.card.shopDisplayName,
    title: payload.card.title,
    description: payload.card.description,
    category: payload.card.category,
    tags: payload.card.tags,
    status: payload.card.status,
    visibility: payload.card.visibility,
    price: payload.card.price,
    geoHint: payload.card.geoHint,
    searchTokens: payload.card.searchTokens,
    updatedAt: payload.card.updatedAt,
    thumbnailRef: payload.card.thumbnailRef,
    thumbnailContentBase64: payload.card.thumbnailContentBase64,
    thumbnailMimeType: payload.card.thumbnailMimeType,
    source: "announce",
  });

  if (taskStore) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "market.announce",
        outcome: "record",
        summary: `market.announce upsert: ${payload.card.title.slice(0, 80)}`,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId ?? envelope.messageId,
      }),
    );
  }

  return { ok: true, listingId: payload.card.listingId, action: "upsert" };
}
