/**
 * Inbound `feed.engage` — star / comment / get / snapshot for Feed & Blog.
 */
import { evaluatePolicy, type BondLevel } from "@envoymesh/bonds";
import {
  createAuditEvent,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
} from "@envoymesh/local-store";
import {
  createFeedEngagePayload,
  createUnsignedEnvelope,
  parseFeedEngagePayload,
  type EnvoyEnvelope,
  type FeedEngagePayload,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/api";
import {
  addContentCommentInStore,
  loadContentEngagement,
  replaceContentEngagement,
  removeContentCommentInStore,
  summarizeEngagement,
  toggleContentStarInStore,
  type ContentEngagementSummary,
} from "./content-engagement-store.js";
import {
  appendContentEngageInboxItem,
  surfaceForContentUrl,
  type ContentEngageNotification,
} from "./content-engage-inbox-store.js";
import { resolveSenderOwnerId } from "./share-inbound.js";

export type FeedEngageInboundResult =
  | {
      ok: true;
      summary?: ContentEngagementSummary;
      replied?: boolean;
      notification?: ContentEngageNotification;
      /** Viewer applied an author snapshot for this URL. */
      snapshotApplied?: boolean;
    }
  | { ok: false; reason: string };

function isOwnContentUrl(url: string, ownerId: string): boolean {
  const needle = `envoy://${ownerId}/`;
  return url.trim().startsWith(needle);
}

export async function handleInboundFeedEngage(input: {
  envelope: EnvoyEnvelope;
  profileDir: string;
  profile: NodeProfile;
  remotePeerId: string;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore?: LocalTaskStore;
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>;
}): Promise<FeedEngageInboundResult> {
  const { envelope, profileDir, profile, trustStore, taskStore } = input;
  if (envelope.intent !== "feed.engage") {
    return { ok: false, reason: "not feed.engage" };
  }

  let payload: FeedEngagePayload;
  try {
    payload = parseFeedEngagePayload(envelope.payload);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "invalid feed.engage payload",
    };
  }

  const resolvedOwnerId = await resolveSenderOwnerId(
    envelope.senderPeerId,
    input.remotePeerId,
    input.peerDirectoryStore,
  );
  if (!resolvedOwnerId) {
    return { ok: false, reason: "unknown sender owner" };
  }

  const bondLevel: BondLevel =
    (await trustStore.getTrustRecord(resolvedOwnerId))?.level ?? "public";

  const policy = evaluatePolicy({
    peerId: envelope.senderPeerId,
    bondLevel,
    intent: "feed.engage",
  });

  if (taskStore) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "feed.engage",
        outcome: policy.action === "allow" ? "allow" : "deny",
        summary:
          policy.action === "allow"
            ? `feed.engage allowed (${bondLevel})`
            : `feed.engage denied: ${"reason" in policy ? policy.reason : policy.action}`,
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

  const localOwnerId = profile.owner.ownerId;
  const url = payload.url.trim();

  if (payload.action === "snapshot") {
    // Snapshots are authoritative from the post author only — URL must be theirs.
    if (!isOwnContentUrl(url, resolvedOwnerId)) {
      return { ok: false, reason: "snapshot sender is not content author" };
    }
    await replaceContentEngagement(profileDir, {
      url,
      stars: payload.starOwnerIds ?? [],
      comments: (payload.comments ?? []).map((c) => ({
        id: c.id,
        authorOwnerId: c.authorOwnerId,
        text: c.text,
        createdAt: c.createdAt,
      })),
      updatedAt: new Date().toISOString(),
    });
    return {
      ok: true,
      summary: summarizeEngagement(await loadContentEngagement(profileDir, url), localOwnerId),
      snapshotApplied: true,
    };
  }

  // Mutating actions and get must target content we author.
  if (!isOwnContentUrl(url, localOwnerId)) {
    return { ok: false, reason: "not content author" };
  }

  if (payload.action === "get") {
    const record = await loadContentEngagement(profileDir, url);
    const summary = summarizeEngagement(record, resolvedOwnerId);
    if (input.replyWithEnvelope) {
      const snap = createFeedEngagePayload({
        url,
        action: "snapshot",
        starOwnerIds: record.stars,
        comments: record.comments,
      });
      const unsigned = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "human",
        intent: "feed.engage",
        correlationId: envelope.correlationId ?? envelope.messageId,
        payload: snap,
      });
      const signed = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
      await input.replyWithEnvelope(signed);
      return { ok: true, summary, replied: true };
    }
    return { ok: true, summary };
  }

  if (payload.action === "star" || payload.action === "unstar") {
    const before = await loadContentEngagement(profileDir, url);
    const has = before.stars.includes(resolvedOwnerId);
    let notification: ContentEngageNotification | undefined;
    if (payload.action === "star" && !has) {
      await toggleContentStarInStore(profileDir, url, resolvedOwnerId);
      const surface = surfaceForContentUrl(url);
      if (surface) {
        notification =
          (await appendContentEngageInboxItem(profileDir, {
            messageId: envelope.messageId,
            url,
            surface,
            action: "star",
            actorOwnerId: resolvedOwnerId,
            senderPeerId: envelope.senderPeerId,
          })) ?? undefined;
      }
    } else if (payload.action === "unstar" && has) {
      await toggleContentStarInStore(profileDir, url, resolvedOwnerId);
    }
    return {
      ok: true,
      summary: summarizeEngagement(await loadContentEngagement(profileDir, url), resolvedOwnerId),
      notification,
    };
  }

  if (payload.action === "comment") {
    const text = payload.text?.trim();
    if (!text) return { ok: false, reason: "comment text required" };
    const commentId = payload.commentId?.trim();
    await addContentCommentInStore(profileDir, url, resolvedOwnerId, text, commentId);
    let notification: ContentEngageNotification | undefined;
    const surface = surfaceForContentUrl(url);
    if (surface) {
      notification =
        (await appendContentEngageInboxItem(profileDir, {
          messageId: envelope.messageId,
          url,
          surface,
          action: "comment",
          actorOwnerId: resolvedOwnerId,
          text,
          senderPeerId: envelope.senderPeerId,
        })) ?? undefined;
    }
    return {
      ok: true,
      summary: summarizeEngagement(await loadContentEngagement(profileDir, url), resolvedOwnerId),
      notification,
    };
  }

  if (payload.action === "uncomment") {
    const commentId = payload.commentId?.trim();
    if (!commentId) return { ok: false, reason: "commentId required" };
    try {
      await removeContentCommentInStore(
        profileDir,
        url,
        resolvedOwnerId,
        commentId,
        localOwnerId,
      );
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "remove comment failed",
      };
    }
    return {
      ok: true,
      summary: summarizeEngagement(await loadContentEngagement(profileDir, url), resolvedOwnerId),
    };
  }

  return { ok: false, reason: "unsupported action" };
}
