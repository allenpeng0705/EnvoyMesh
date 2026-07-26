/**
 * Phase 45E — outbound `feed.notify` fan-out after web-content publish.
 * Modeled on profile-sync-outbound.ts: resolve peers → dial hints → sendEnvelopeWithRetry.
 */

import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createFeedNotifyPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type FeedNotifyPayload,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import {
  selectFeedNotifyRecipients,
  type FeedNotifyBond,
  type FeedNotifyVisibility,
} from "./feed-notify-recipients.js";

type FeedNotifyMesh = OutboundDeliverMesh &
  Pick<EnvoyMesh, "mergePeerStoreDialHints" | "tagContactForPersistentReachability">;

export interface FeedNotifyPublishMeta {
  publisherOwnerId: string;
  publishedAt: string;
  title: string;
  url: string;
  kind: FeedNotifyPayload["kind"];
  visibility: FeedNotifyVisibility;
  summary?: string;
  tags?: string[];
  contentHash?: string;
  listingUrl?: string;
  contactIds?: string[];
}

export async function buildSignedFeedNotifyEnvelope(input: {
  profile: NodeProfile;
  meta: FeedNotifyPublishMeta;
  recipientPeerId?: string;
}): Promise<EnvoyEnvelope> {
  const payload = createFeedNotifyPayload({
    publisherOwnerId: input.meta.publisherOwnerId,
    publishedAt: input.meta.publishedAt,
    title: input.meta.title,
    url: input.meta.url,
    kind: input.meta.kind,
    visibility: input.meta.visibility,
    summary: input.meta.summary,
    tags: input.meta.tags,
    contentHash: input.meta.contentHash,
    listingUrl: input.meta.listingUrl,
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: "feed.notify",
    payload,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

export type FeedNotifySendResult = {
  attempted: number;
  sent: number;
  sentOwnerIds: string[];
  missedOwnerIds: string[];
};

/** Deliver one `feed.notify` to a single owner (outbox flush / targeted retry). */
export async function sendFeedNotifyToOwner(input: {
  mesh: FeedNotifyMesh;
  profile: NodeProfile;
  meta: FeedNotifyPublishMeta;
  recipientOwnerId: string;
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  tagReachability?: (peerId: string) => void;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ownerId = input.recipientOwnerId.trim();
  if (!ownerId) return { ok: false, reason: "empty recipientOwnerId" };

  try {
    const resolved = await input.resolveLibp2pPeer(ownerId);
    if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
      return { ok: false, reason: "no libp2p peer id" };
    }

    let dialHints: string[];
    try {
      dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
    } catch (hintErr) {
      return {
        ok: false,
        reason: hintErr instanceof Error ? hintErr.message : "dial hints failed",
      };
    }

    if (typeof input.mesh.mergePeerStoreDialHints === "function") {
      void Promise.resolve(
        input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
      ).catch((err) => console.warn(`[feed.notify] mergePeerStoreDialHints failed:`, err));
    }

    input.tagReachability?.(resolved.peerId);
    if (typeof input.mesh.tagContactForPersistentReachability === "function") {
      void Promise.resolve(
        input.mesh.tagContactForPersistentReachability(resolved.peerId),
      ).catch((err) =>
        console.warn(`[feed.notify] tagContactForPersistentReachability failed:`, err),
      );
    }

    const envelope = await buildSignedFeedNotifyEnvelope({
      profile: input.profile,
      meta: input.meta,
      recipientPeerId: resolved.peerId,
    });

    await sendEnvelopeWithRetry({
      mesh: input.mesh,
      transportPeerId: resolved.peerId,
      envelope,
      dialHints,
      peerListenAddrs: resolved.listenAddrs,
      rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "send failed",
    };
  }
}

export async function sendFeedNotifyToBonds(input: {
  mesh: FeedNotifyMesh;
  profile: NodeProfile;
  meta: FeedNotifyPublishMeta;
  bonds: readonly FeedNotifyBond[];
  recipientInterestsByOwnerId?: ReadonlyMap<string, readonly string[]>;
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  tagReachability?: (peerId: string) => void;
}): Promise<FeedNotifySendResult> {
  const recipientOwnerIds = selectFeedNotifyRecipients({
    visibility: input.meta.visibility,
    contactIds: input.meta.contactIds,
    bonds: input.bonds,
    publisherTags: input.meta.tags,
    recipientInterestsByOwnerId: input.recipientInterestsByOwnerId,
  });
  if (recipientOwnerIds.length === 0) {
    return { attempted: 0, sent: 0, sentOwnerIds: [], missedOwnerIds: [] };
  }

  const sentOwnerIds: string[] = [];
  const missedOwnerIds: string[] = [];

  for (const ownerId of recipientOwnerIds) {
    const result = await sendFeedNotifyToOwner({
      mesh: input.mesh,
      profile: input.profile,
      meta: input.meta,
      recipientOwnerId: ownerId,
      resolveLibp2pPeer: input.resolveLibp2pPeer,
      dialHintsFor: input.dialHintsFor,
      tagReachability: input.tagReachability,
    });
    if (result.ok) {
      sentOwnerIds.push(ownerId);
    } else {
      console.warn(
        `[feed.notify] miss ${ownerId.slice(0, 20)}…: ${result.reason}`,
      );
      missedOwnerIds.push(ownerId);
    }
  }

  return {
    attempted: recipientOwnerIds.length,
    sent: sentOwnerIds.length,
    sentOwnerIds,
    missedOwnerIds,
  };
}
