/**
 * Outbound `feed.engage` to a content author's peer.
 */
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createFeedEngagePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type FeedEngagePayload,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

type EngageMesh = OutboundDeliverMesh &
  Pick<EnvoyMesh, "mergePeerStoreDialHints" | "tagContactForPersistentReachability">;

export async function buildSignedFeedEngageEnvelope(input: {
  profile: NodeProfile;
  payload: FeedEngagePayload;
  recipientPeerId?: string;
  correlationId?: string;
}): Promise<EnvoyEnvelope> {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: "feed.engage",
    correlationId: input.correlationId,
    payload: input.payload,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

export async function sendFeedEngageToOwner(input: {
  mesh: EngageMesh;
  profile: NodeProfile;
  action: FeedEngagePayload["action"];
  url: string;
  text?: string;
  commentId?: string;
  actorOwnerId: string;
  starOwnerIds?: string[];
  comments?: FeedEngagePayload["comments"];
  targetOwnerId: string;
  correlationId?: string;
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  tagReachability?: (peerId: string) => void;
}): Promise<{ sent: boolean; reason?: string }> {
  const resolved = await input.resolveLibp2pPeer(input.targetOwnerId);
  if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
    return { sent: false, reason: "no libp2p peer id" };
  }

  let dialHints: string[];
  try {
    dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "dial hints failed",
    };
  }

  if (typeof input.mesh.mergePeerStoreDialHints === "function") {
    try {
      await input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints);
    } catch {
      /* best-effort */
    }
  }
  input.tagReachability?.(resolved.peerId);

  const payload = createFeedEngagePayload({
    url: input.url,
    action: input.action,
    text: input.text,
    commentId: input.commentId,
    actorOwnerId: input.actorOwnerId,
    starOwnerIds: input.starOwnerIds,
    comments: input.comments,
  });
  const envelope = await buildSignedFeedEngageEnvelope({
    profile: input.profile,
    payload,
    recipientPeerId: resolved.peerId,
    correlationId: input.correlationId,
  });

  try {
    await sendEnvelopeWithRetry({
      mesh: input.mesh,
      transportPeerId: resolved.peerId,
      envelope,
      dialHints,
    });
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "send failed";
    console.warn(`[feed.engage] send failed:`, reason);
    return { sent: false, reason };
  }
}
