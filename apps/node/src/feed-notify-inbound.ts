/**
 * Phase 45E — inbound `feed.notify` handler.
 * Verify payload → bond policy → interest overlap → persist → emit.
 */

import { evaluatePolicy, type BondLevel } from "@envoymesh/bonds";
import {
  createAuditEvent,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
} from "@envoymesh/local-store";
import {
  parseFeedNotifyPayload,
  type EnvoyEnvelope,
  type FeedNotifyPayload,
} from "@envoymesh/protocol";
import { randomUUID } from "node:crypto";
import {
  appendFeedNotifyInboxItem,
  type FeedNotifyInboxItem,
} from "./feed-notify-store.js";
import { recipientInterestsOverlap } from "./feed-notify-recipients.js";
import { resolveSenderOwnerId } from "./share-inbound.js";

export type FeedNotifyInboundResult =
  | { ok: true; item: FeedNotifyInboxItem }
  | { ok: false; reason: string; skipped?: boolean };

export async function handleInboundFeedNotify(input: {
  envelope: EnvoyEnvelope;
  profileDir: string;
  remotePeerId: string;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore?: LocalTaskStore;
  /** Local hobbies + knowledge for interest overlap filter. */
  localInterests?: readonly string[] | null;
  emit?: (item: FeedNotifyInboxItem) => void;
}): Promise<FeedNotifyInboundResult> {
  const { envelope, profileDir, trustStore, taskStore, remotePeerId } = input;

  if (envelope.intent !== "feed.notify") {
    return { ok: false, reason: "not feed.notify" };
  }

  let payload: FeedNotifyPayload;
  try {
    payload = parseFeedNotifyPayload(envelope.payload);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "invalid feed.notify payload",
    };
  }

  const resolvedOwnerId = await resolveSenderOwnerId(
    envelope.senderPeerId,
    remotePeerId,
    input.peerDirectoryStore,
  );
  const senderOwnerId = resolvedOwnerId ?? payload.publisherOwnerId;
  if (resolvedOwnerId && resolvedOwnerId !== payload.publisherOwnerId) {
    return { ok: false, reason: "publisherOwnerId does not match sender" };
  }

  const bondLevel: BondLevel =
    (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public";

  const policy = evaluatePolicy({
    peerId: envelope.senderPeerId,
    bondLevel,
    intent: "feed.notify",
  });

  if (taskStore) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "feed.notify",
        outcome: policy.action === "allow" ? "allow" : "deny",
        summary:
          policy.action === "allow"
            ? `feed.notify allowed (${bondLevel})`
            : `feed.notify denied: ${"reason" in policy ? policy.reason : policy.action}`,
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

  if (
    !recipientInterestsOverlap({
      publisherTags: payload.tags,
      recipientInterests: input.localInterests,
    })
  ) {
    return { ok: false, reason: "no interest overlap", skipped: true };
  }

  const item: FeedNotifyInboxItem = {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    messageId: envelope.messageId,
    publisherOwnerId: payload.publisherOwnerId,
    publishedAt: payload.publishedAt,
    title: payload.title,
    url: payload.url,
    kind: payload.kind,
    visibility: payload.visibility,
    summary: payload.summary,
    tags: payload.tags,
    contentHash: payload.contentHash,
    listingUrl: payload.listingUrl,
    imageUrls: payload.imageUrls,
    senderPeerId: envelope.senderPeerId,
  };

  const { inserted, item: stored } = await appendFeedNotifyInboxItem(profileDir, item);
  // URL/messageId dedupe must not emit a fresh unread feed:notify to the UI.
  if (inserted) {
    input.emit?.(stored);
  }

  if (taskStore && inserted) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "feed.notify",
        outcome: "record",
        summary: `feed.notify stored: ${payload.title.slice(0, 80)}`,
        remotePeerId: envelope.senderPeerId,
        correlationId: envelope.correlationId ?? envelope.messageId,
      }),
    );
  }

  return { ok: true, item: stored };
}
