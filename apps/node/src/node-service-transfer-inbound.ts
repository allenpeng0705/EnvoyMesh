/**
 * Inbound transfer / share-offer runtime.
 *
 * Extracted from `node-service-impl.ts`. Owns transfer tracker updates,
 * deferred chat attachment vault paths, share preview linking, and
 * inbound accept → data-transfer dispatch.
 */
import { basename, join } from "node:path";
import { stat } from "node:fs/promises";
import type {
  ChatAttachment,
  ChatMessage,
  NodeProfile,
  ShareOffer,
  TransferStatus,
} from "@envoymesh/api";
import { chatRoomThreadKey, deferredDirectChatAttachmentKey } from "@envoymesh/api";
import type { LocalChatLogStore, LocalPeerDirectoryStore, LocalTaskStore, LocalTrustStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  createShareAcceptPayload,
  createUnsignedEnvelope,
  parseShareAcceptPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import { isSafeVaultPath } from "./share-inbound.js";
import { sendVaultFileViaDataTransfer } from "./node-file-share.js";
import { mergeDialablePeerListenAddrs } from "./outbound-dial-hints.js";
import { raceWithTimeout } from "./node-service-outbound-messaging.js";
import { TransferTracker } from "./transfer-tracker.js";

export type PendingPushShare = {
  relativePath: string;
  toPeerId: string;
  deliveryChannel?: "inbox" | "chat" | "agent";
};

export type PendingPullShare = {
  peerRelativePath: string;
  targetOwnerId: string;
  toPeerId: string;
  sensitivity: "public" | "friends" | "private";
};

export type PendingFileSend = {
  relativePath: string;
  toPeerId: string;
  deliveryChannel?: "inbox" | "chat" | "agent";
};

export type DeferredShareAccept = {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  taskStore: LocalTaskStore;
  vaultDir: string;
  inboundConnectionAddrs?: string[];
};

export type InboundTransferPending = {
  senderNodeId: string;
  senderVaultRelativePath: string;
  savePath: string;
  senderOwnerId?: string;
  chatRoomId?: string;
  chatMessageId?: string;
  chatAttachmentId?: string;
};

export interface TransferStateBundle {
  pendingInboundShareOffers: Map<string, ShareOffer>;
  pendingDataTransferSavePath: Map<string, string>;
  deferredDirectChatAttachmentVaultPath: Map<string, string>;
  transferTracker: TransferTracker;
  correlationByRequestMsgId: Map<string, string>;
  correlationByPreviewMsgId: Map<string, string>;
  inboundTransferByShareId: Map<string, InboundTransferPending>;
  /** Outbound push: our `share.request` message id → until we receive `share.preview`. */
  pendingPushShareByRequestMsgId: Map<string, PendingPushShare>;
  /** Outbound pull: peer vault path requested until preview arrives. */
  pendingPullShareByRequestMsgId: Map<string, PendingPullShare>;
  /** After inbound `share.preview`: preview message id → send file to peer (we are holder). */
  pendingFileSendByPreviewMsgId: Map<string, PendingFileSend>;
  /** `share.accept` arrived before inbound `share.preview` linked the pending send. */
  deferredShareAcceptByPreviewId: Map<string, DeferredShareAccept>;
}

export function createTransferStateBundle(): TransferStateBundle {
  return {
    pendingInboundShareOffers: new Map(),
    pendingDataTransferSavePath: new Map(),
    deferredDirectChatAttachmentVaultPath: new Map(),
    transferTracker: new TransferTracker(),
    correlationByRequestMsgId: new Map(),
    correlationByPreviewMsgId: new Map(),
    inboundTransferByShareId: new Map(),
    pendingPushShareByRequestMsgId: new Map(),
    pendingPullShareByRequestMsgId: new Map(),
    pendingFileSendByPreviewMsgId: new Map(),
    deferredShareAcceptByPreviewId: new Map(),
  };
}

export function sanitizeChatFilename(name: string): string {
  const base = basename(name.trim()) || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

export function chatInboundVaultPath(senderOwnerId: string, senderRelativePath: string): string {
  const safeOwner =
    senderOwnerId.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "peer";
  const filename = sanitizeChatFilename(basename(senderRelativePath));
  return `chat/in/${safeOwner}/${filename}`;
}

export interface TransferInboundContext {
  getTransferState(): TransferStateBundle;
  getChatLogStore(): LocalChatLogStore | null | undefined;
  peerDirectoryStore: LocalPeerDirectoryStore;
  trustStore: LocalTrustStore;
  getReachableMesh(): EnvoyMesh | undefined;
  getProfile(): NodeProfile | undefined;
  dialHintsForChat(
    recipientPeerId: string,
    peerListenAddrs: string[] | undefined,
  ): Promise<string[]>;
  upsertTransferStatus(status: TransferStatus): TransferStatus;
  emit(event: string, payload: unknown): void;
  recordFileShareInChat(input: {
    peerOwnerId: string;
    outgoing: boolean;
    vaultRelativePath: string;
    byteLength: number;
  }): Promise<void>;
  assertOnline(): void;
  recordOwnerActivity(): void;
  requireProfile(): NodeProfile;
  getVaultDir(): string;
  deliverCallEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
  ): Promise<unknown>;
  tagBondedContactReachability(peerId: string): void;
}

export type TransferInboundContextInput = Omit<TransferInboundContext, "upsertTransferStatus">;

export function upsertTransferStatusViaRuntime(
  ctx: Pick<TransferInboundContextInput, "getTransferState" | "emit">,
  status: TransferStatus,
): TransferStatus {
  const saved = ctx.getTransferState().transferTracker.upsert(status);
  ctx.emit("share:progress", saved);
  return saved;
}

export function buildTransferInboundContext(input: TransferInboundContextInput): TransferInboundContext {
  return {
    ...input,
    upsertTransferStatus: (status) => upsertTransferStatusViaRuntime(input, status),
  };
}

export function mergeConnectionDialHints(
  peerId: string,
  peerListenAddrs: string[] | undefined,
  inboundConnectionAddrs: string[] | undefined,
): string[] | undefined {
  const merged = mergeDialablePeerListenAddrs(peerId, peerListenAddrs, inboundConnectionAddrs);
  return merged.length > 0 ? merged : undefined;
}

export function listActiveTransfersViaRuntime(ctx: TransferInboundContext): TransferStatus[] {
  return ctx.getTransferState().transferTracker.listActive();
}

export function getTransferStatusViaRuntime(
  ctx: TransferInboundContext,
  correlationId: string,
): TransferStatus | undefined {
  return ctx.getTransferState().transferTracker.get(correlationId);
}

export function listPendingShareOffersViaRuntime(ctx: TransferInboundContext): ShareOffer[] {
  return [...ctx.getTransferState().pendingInboundShareOffers.values()];
}

export async function acceptShareViaRuntime(
  ctx: TransferInboundContext,
  shareId: string,
  savePath: string,
): Promise<void> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  const profile = ctx.requireProfile();
  const offer = ctx.getTransferState().pendingInboundShareOffers.get(shareId);
  if (!offer) {
    throw new Error(`No pending share offer for id=${shareId}`);
  }

  const saveNorm = savePath.trim().replace(/^[\\/]+/, "");
  const srcKey = offer.senderVaultRelativePath?.replace(/^[\\/]+/, "") ?? "";
  const state = ctx.getTransferState();
  if (saveNorm) {
    if (!srcKey) {
      throw new Error("Cannot set save path: sender vault path unknown for this offer");
    }
    if (!isSafeVaultPath(ctx.getVaultDir(), saveNorm)) {
      throw new Error("Invalid save path");
    }
    state.pendingDataTransferSavePath.set(`${offer.senderNodeId}\n${srcKey}`, saveNorm);
  }

  const records = await ctx.peerDirectoryStore.listPeerRecords();
  const rec = records.find((r) => r.peerId === offer.senderNodeId);
  const senderOwnerId = offer.senderOwnerId ?? rec?.ownerId;

  let dialHints: string[];
  try {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(offer.senderNodeId, rec?.listenAddrs),
      30_000,
      "_dialHintsForChat",
    );
  } catch (err) {
    throw err;
  }
  const recipientEnvelopePeerId = rec?.devicePublicKeyPem
    ? derivePeerId(rec.devicePublicKeyPem)
    : undefined;

  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: recipientEnvelopePeerId,
    recipientRole: "human",
    intent: "share.accept",
    payload: createShareAcceptPayload({ inReplyTo: shareId, accept: true }),
  });
  const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
  await ctx.deliverCallEnvelope(offer.senderNodeId, envelope, dialHints, rec?.listenAddrs);
  ctx.tagBondedContactReachability(offer.senderNodeId);
  state.correlationByPreviewMsgId.set(shareId, shareId);
  state.inboundTransferByShareId.set(shareId, {
    senderNodeId: offer.senderNodeId,
    senderVaultRelativePath: srcKey,
    savePath: saveNorm || srcKey || offer.filename,
    senderOwnerId,
    chatRoomId: offer.chatRoomId,
    chatMessageId: offer.chatMessageId,
    chatAttachmentId: offer.chatAttachmentId,
  });
  ctx.upsertTransferStatus({
    correlationId: shareId,
    phase: "negotiating",
    remotePeerId: offer.senderNodeId,
    remotePeerOwnerId: senderOwnerId,
    vaultRelativePath: saveNorm || srcKey || offer.filename,
    updatedAt: new Date().toISOString(),
  });
  state.pendingInboundShareOffers.delete(shareId);
  const emitPath = saveNorm || srcKey || offer.filename;
  ctx.emit("share:accepted", { shareId, savePath: emitPath });
}

export async function declineShareViaRuntime(
  ctx: TransferInboundContext,
  shareId: string,
): Promise<void> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  const profile = ctx.requireProfile();
  const offer = ctx.getTransferState().pendingInboundShareOffers.get(shareId);
  if (!offer) {
    throw new Error(`No pending share offer for id=${shareId}`);
  }
  const records = await ctx.peerDirectoryStore.listPeerRecords();
  const rec = records.find((r) => r.peerId === offer.senderNodeId);
  let dialHints: string[];
  try {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(offer.senderNodeId, rec?.listenAddrs),
      30_000,
      "_dialHintsForChat",
    );
  } catch (err) {
    throw err;
  }
  const recipientEnvelopePeerId = rec?.devicePublicKeyPem
    ? derivePeerId(rec.devicePublicKeyPem)
    : undefined;
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: recipientEnvelopePeerId,
    recipientRole: "human",
    intent: "share.accept",
    payload: createShareAcceptPayload({ inReplyTo: shareId, accept: false }),
  });
  const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;
  await ctx.deliverCallEnvelope(offer.senderNodeId, envelope, dialHints, rec?.listenAddrs);
  ctx.getTransferState().pendingInboundShareOffers.delete(shareId);
  ctx.emit("share:declined", { shareId });
}

export async function maybeAutoAcceptChatShareViaRuntime(
  ctx: TransferInboundContext,
  input: {
    shareId: string;
    senderOwnerId?: string;
    senderRelativePath: string;
    requiresApproval: boolean;
  },
  acceptShare: (shareId: string, savePath: string) => Promise<void> = (shareId, savePath) =>
    acceptShareViaRuntime(ctx, shareId, savePath),
): Promise<void> {
  if (!input.senderOwnerId?.trim()) {
    return;
  }
  const trust = await ctx.trustStore.getTrustRecord(input.senderOwnerId);
  const level = trust?.level;
  if (!level || level === "blocked" || level === "public") {
    return;
  }
  if (input.requiresApproval) {
    return;
  }
  const savePath = chatInboundVaultPath(input.senderOwnerId, input.senderRelativePath);
  try {
    await acceptShare(input.shareId, savePath);
  } catch (err) {
    console.warn(
      `[chat-attachment] auto-accept failed for ${input.shareId.slice(0, 12)}…:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function reconcileInboundDirectChatMessageViaRuntime(
  ctx: TransferInboundContext,
  peerOwnerId: string,
  message: ChatMessage,
): Promise<ChatMessage> {
  const chatLogStore = ctx.getChatLogStore();
  if (!chatLogStore) return message;
  await reconcileDeferredDirectChatAttachmentVaultPathsViaRuntime(ctx, peerOwnerId, message);
  const rows = await chatLogStore.listThread(peerOwnerId.trim(), 5000);
  const updated = rows.find((row) => row.messageId === message.messageId);
  if (!updated) return message;
  return { ...updated, signature: updated.signature };
}

export function notifyInboundTransferVerifiedViaRuntime(
  ctx: TransferInboundContext,
  input: {
    remotePeerId: string;
    relativePath: string;
    totalBytes: number;
  },
): void {
  const state = ctx.getTransferState();
  for (const [shareId, pending] of state.inboundTransferByShareId.entries()) {
    if (pending.senderNodeId !== input.remotePeerId) continue;
    if (pending.savePath !== input.relativePath && pending.senderVaultRelativePath !== input.relativePath) {
      continue;
    }
    const correlationId = state.correlationByPreviewMsgId.get(shareId) ?? shareId;
    ctx.upsertTransferStatus({
      correlationId,
      phase: "verified",
      bytesTransferred: input.totalBytes,
      totalBytes: input.totalBytes,
      remotePeerId: input.remotePeerId,
      remotePeerOwnerId: pending.senderOwnerId,
      vaultRelativePath: input.relativePath,
      updatedAt: new Date().toISOString(),
    });
    state.inboundTransferByShareId.delete(shareId);
    if (pending.chatRoomId && pending.chatMessageId && pending.chatAttachmentId) {
      void applyRoomAttachmentVaultPathViaRuntime(ctx, {
        roomId: pending.chatRoomId,
        messageId: pending.chatMessageId,
        attachmentId: pending.chatAttachmentId,
        vaultRelativePath: input.relativePath,
      });
    } else if (pending.chatMessageId && pending.chatAttachmentId && pending.senderOwnerId) {
      void applyDirectChatAttachmentVaultPathViaRuntime(ctx, {
        peerOwnerId: pending.senderOwnerId,
        messageId: pending.chatMessageId,
        attachmentId: pending.chatAttachmentId,
        vaultRelativePath: input.relativePath,
      });
    } else {
      void ctx.recordFileShareInChat({
        peerOwnerId: pending.senderOwnerId ?? pending.senderNodeId,
        outgoing: false,
        vaultRelativePath: input.relativePath,
        byteLength: input.totalBytes,
      });
    }
    return;
  }
  ctx.upsertTransferStatus({
    correlationId: `inbound:${input.remotePeerId}:${input.relativePath}`,
    phase: "verified",
    bytesTransferred: input.totalBytes,
    totalBytes: input.totalBytes,
    remotePeerId: input.remotePeerId,
    vaultRelativePath: input.relativePath,
    updatedAt: new Date().toISOString(),
  });
}

export function linkOutboundSharePreviewFromInboundViaRuntime(
  ctx: TransferInboundContext,
  previewMessageId: string,
  inReplyToRequestMsgId: string,
): void {
  const pendingPush = ctx.getTransferState().pendingPushShareByRequestMsgId;
  const pending = pendingPush.get(inReplyToRequestMsgId);
  if (!pending) {
    console.warn(
      `[share] preview ${previewMessageId.slice(0, 12)}…: no pending push send for request ${inReplyToRequestMsgId.slice(0, 12)}…`,
    );
    return;
  }
  ctx.getTransferState().pendingFileSendByPreviewMsgId.set(previewMessageId, {
    relativePath: pending.relativePath,
    toPeerId: pending.toPeerId,
    deliveryChannel: pending.deliveryChannel,
  });
  pendingPush.delete(inReplyToRequestMsgId);
  console.log(
    `[share] linked preview ${previewMessageId.slice(0, 12)}… → file send ${pending.relativePath} to ${pending.toPeerId.slice(0, 12)}…`,
  );
  const state = ctx.getTransferState();
  const correlationId = state.correlationByRequestMsgId.get(inReplyToRequestMsgId);
  if (correlationId) {
    state.correlationByPreviewMsgId.set(previewMessageId, correlationId);
    state.correlationByRequestMsgId.delete(inReplyToRequestMsgId);
  }
  const deferred = ctx.getTransferState().deferredShareAcceptByPreviewId.get(previewMessageId);
  if (deferred) {
    ctx.getTransferState().deferredShareAcceptByPreviewId.delete(previewMessageId);
    void maybeSendShareFileForInboundAcceptViaRuntime(ctx, deferred).catch((err) => {
      console.error(
        `[share] deferred file transfer failed for preview ${previewMessageId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    });
  }
}

export function recordInboundPullSharePreviewViaRuntime(
  ctx: TransferInboundContext,
  input: {
    previewMessageId: string;
    inReplyToRequestMsgId: string;
    senderPeerId: string;
    senderOwnerId?: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
  },
): boolean {
  const pendingPull = ctx.getTransferState().pendingPullShareByRequestMsgId;
  const pending = pendingPull.get(input.inReplyToRequestMsgId);
  if (!pending) return false;
  pendingPull.delete(input.inReplyToRequestMsgId);
  void recordInboundPushShareOfferViaRuntime(ctx, {
    shareId: input.previewMessageId,
    senderPeerId: input.senderPeerId,
    senderOwnerId: input.senderOwnerId ?? pending.targetOwnerId,
    previewText: input.previewText,
    sensitivity: input.sensitivity,
    relativePath: pending.peerRelativePath,
    deliveryChannel: "inbox",
  });
  const state = ctx.getTransferState();
  const correlationId = state.correlationByRequestMsgId.get(input.inReplyToRequestMsgId);
  if (correlationId) {
    state.correlationByPreviewMsgId.set(input.previewMessageId, correlationId);
    state.correlationByRequestMsgId.delete(input.inReplyToRequestMsgId);
  }
  return true;
}

export function registerResponderFileSendAfterPreviewViaRuntime(
  ctx: TransferInboundContext,
  previewMessageId: string,
  relativePath: string | undefined,
  requesterPeerId: string,
): void {
  const rel = relativePath?.replace(/^[\\/]+/, "") ?? "";
  if (!rel.trim()) return;
  ctx.getTransferState().pendingFileSendByPreviewMsgId.set(previewMessageId, {
    relativePath: rel,
    toPeerId: requesterPeerId,
  });
}

export async function recordInboundPushShareOfferViaRuntime(
  ctx: TransferInboundContext,
  input: {
    shareId: string;
    senderPeerId: string;
    senderOwnerId?: string;
    previewText: string;
    sensitivity: "public" | "friends" | "private";
    relativePath: string;
    deliveryChannel?: "inbox" | "chat" | "agent";
    chatRoomId?: string;
    chatMessageId?: string;
    chatAttachmentId?: string;
  },
): Promise<void> {
  const records = await ctx.peerDirectoryStore.listPeerRecords();
  const rec = records.find((r) => r.peerId === input.senderPeerId);
  const senderOwnerId = input.senderOwnerId ?? rec?.ownerId;
  const trust = senderOwnerId ? await ctx.trustStore.getTrustRecord(senderOwnerId) : undefined;
  const displayName =
    trust?.displayName?.trim() ||
    (senderOwnerId
      ? senderOwnerId.replace(/^envoy:owner:/, "").slice(0, 10)
      : `${input.senderPeerId.slice(0, 12)}…`);
  const filename = basename(input.relativePath) || "file";
  const offer: ShareOffer = {
    shareId: input.shareId,
    senderNodeId: input.senderPeerId,
    senderOwnerId,
    senderDisplayName: displayName,
    filename,
    mimeType: "application/octet-stream",
    sizeBytes: 0,
    sensitivity: input.sensitivity,
    preview: input.previewText,
    timestamp: new Date().toISOString(),
    senderVaultRelativePath: input.relativePath.replace(/^[\\/]+/, "") || undefined,
    chatRoomId: input.chatRoomId,
    chatMessageId: input.chatMessageId,
    chatAttachmentId: input.chatAttachmentId,
  };
  ctx.getTransferState().pendingInboundShareOffers.set(input.shareId, offer);
  if (input.deliveryChannel !== "chat") {
    ctx.emit("share:offered", offer);
  }
}

export function clearPendingShareStateForPreviewViaRuntime(
  ctx: TransferInboundContext,
  previewMessageId: string,
): void {
  ctx.getTransferState().pendingFileSendByPreviewMsgId.delete(previewMessageId);
  const state = ctx.getTransferState();
  const offer = state.pendingInboundShareOffers.get(previewMessageId);
  if (offer?.senderVaultRelativePath) {
    state.pendingDataTransferSavePath.delete(
      `${offer.senderNodeId}\n${offer.senderVaultRelativePath.replace(/^[\\/]+/, "")}`,
    );
  }
  state.pendingInboundShareOffers.delete(previewMessageId);
}

export function resolveInboundDataTransferRelativePathViaRuntime(
  ctx: TransferInboundContext,
  remotePeerId: string,
  voucherRelativePath: string,
): string {
  const norm = voucherRelativePath.replace(/^[\\/]+/, "");
  const mapped = ctx.getTransferState().pendingDataTransferSavePath.get(`${remotePeerId}\n${norm}`);
  return mapped ?? norm;
}

export function consumeInboundDataTransferSaveMappingViaRuntime(
  ctx: TransferInboundContext,
  remotePeerId: string,
  voucherSourceRelativePath: string,
): void {
  const norm = voucherSourceRelativePath.replace(/^[\\/]+/, "");
  ctx.getTransferState().pendingDataTransferSavePath.delete(`${remotePeerId}\n${norm}`);
}

export async function maybeSendShareFileForInboundAcceptViaRuntime(
  ctx: TransferInboundContext,
  input: {
    envelope: EnvoyEnvelope;
    remotePeerId: string;
    taskStore: LocalTaskStore;
    vaultDir: string;
    inboundConnectionAddrs?: string[];
  },
): Promise<void> {
  let payload: ReturnType<typeof parseShareAcceptPayload>;
  try {
    payload = parseShareAcceptPayload(input.envelope.payload);
  } catch {
    return;
  }
  if (!payload.accept) return;
  const previewId = payload.inReplyTo;
  const pending = ctx.getTransferState().pendingFileSendByPreviewMsgId.get(previewId);
  if (!pending) {
    console.warn(
      `[share] share.accept for preview ${previewId.slice(0, 12)}…: deferring until preview is linked`,
    );
    ctx.getTransferState().deferredShareAcceptByPreviewId.set(previewId, input);
    return;
  }
  if (pending.toPeerId !== input.remotePeerId) {
    console.warn(`[share] file send skipped: peer mismatch for preview=${previewId.slice(0, 12)}…`);
    return;
  }
  const mesh = ctx.getReachableMesh();
  const profile = ctx.getProfile();
  if (!mesh || !profile) return;

  const peerRecords = await ctx.peerDirectoryStore.listPeerRecords();
  const rec = peerRecords.find((r) => r.peerId === input.remotePeerId);
  const listenAddrs = mergeConnectionDialHints(
    input.remotePeerId,
    rec?.listenAddrs,
    input.inboundConnectionAddrs,
  );
  let dialHints: string[];
  try {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(input.remotePeerId, listenAddrs),
      30_000,
      "_dialHintsForChat",
    );
  } catch (err) {
    console.error(
      `[share] dial hints failed for data transfer to ${input.remotePeerId.slice(0, 12)}…:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  const state = ctx.getTransferState();
  const correlationId =
    state.correlationByPreviewMsgId.get(previewId) ?? input.envelope.correlationId ?? previewId;
  ctx.upsertTransferStatus({
    correlationId,
    phase: "transferring",
    remotePeerId: input.remotePeerId,
    vaultRelativePath: pending.relativePath,
    updatedAt: new Date().toISOString(),
  });

  console.log(
    `[share] data transfer start: ${pending.relativePath} → ${input.remotePeerId.slice(0, 12)}… (${dialHints.length} dial hints)`,
  );
  await sendVaultFileViaDataTransfer({
    mesh,
    profile,
    taskStore: input.taskStore,
    vaultDir: input.vaultDir,
    relativePath: pending.relativePath,
    toPeerId: input.remotePeerId,
    dialHints,
    peerListenAddrs: listenAddrs,
    rebuildDialHints: () => ctx.dialHintsForChat(input.remotePeerId, listenAddrs),
    transferHooks: {
      correlationId,
      remotePeerOwnerId: rec?.ownerId,
      onUpdate: (status) => ctx.upsertTransferStatus(status as TransferStatus),
    },
  });
  ctx.getTransferState().pendingFileSendByPreviewMsgId.delete(previewId);
  ctx.getTransferState().deferredShareAcceptByPreviewId.delete(previewId);
  console.log(
    `[share] data transfer complete: ${pending.relativePath} → ${input.remotePeerId.slice(0, 12)}…`,
  );
  if (rec?.ownerId && pending.deliveryChannel !== "chat") {
    let byteLength = 0;
    try {
      const st = await stat(join(input.vaultDir, pending.relativePath));
      byteLength = st.size;
    } catch {
      /* ignore */
    }
    void ctx.recordFileShareInChat({
      peerOwnerId: rec.ownerId,
      outgoing: true,
      vaultRelativePath: pending.relativePath,
      byteLength,
    });
  }
}

export async function applyRoomAttachmentVaultPathViaRuntime(
  ctx: TransferInboundContext,
  input: {
    roomId: string;
    messageId: string;
    attachmentId: string;
    vaultRelativePath: string;
  },
): Promise<void> {
  const chatLogStore = ctx.getChatLogStore();
  if (!chatLogStore) return;
  const threadKey = chatRoomThreadKey(input.roomId.trim());
  const vaultPath = input.vaultRelativePath.replace(/^[\\/]+/, "");
  const updated = await chatLogStore.updateAttachmentVaultPath(
    threadKey,
    input.messageId,
    input.attachmentId,
    vaultPath,
  );
  if (!updated) return;
  const rows = await chatLogStore.listThread(threadKey, 5000);
  const msg = rows.find((m) => m.messageId === input.messageId);
  if (!msg) return;
  const full: ChatMessage = { ...msg, signature: msg.signature };
  ctx.emit("chat:room-message", { roomId: input.roomId.trim(), message: full });
}

export async function applyDirectChatAttachmentVaultPathViaRuntime(
  ctx: TransferInboundContext,
  input: {
    peerOwnerId: string;
    messageId: string;
    attachmentId: string;
    vaultRelativePath: string;
  },
): Promise<void> {
  const chatLogStore = ctx.getChatLogStore();
  if (!chatLogStore) return;
  const threadPeerOwnerId = input.peerOwnerId.trim();
  const vaultPath = input.vaultRelativePath.replace(/^[\\/]+/, "");
  const updated = await chatLogStore.updateAttachmentVaultPath(
    threadPeerOwnerId,
    input.messageId,
    input.attachmentId,
    vaultPath,
  );
  if (!updated) {
    ctx.getTransferState().deferredDirectChatAttachmentVaultPath.set(
      deferredDirectChatAttachmentKey(threadPeerOwnerId, input.messageId, input.attachmentId),
      vaultPath,
    );
    return;
  }
  ctx.getTransferState().deferredDirectChatAttachmentVaultPath.delete(
    deferredDirectChatAttachmentKey(threadPeerOwnerId, input.messageId, input.attachmentId),
  );
  await emitDirectChatMessageAfterAttachmentUpdateViaRuntime(ctx, threadPeerOwnerId, input.messageId);
}

export async function reconcileDeferredDirectChatAttachmentVaultPathsViaRuntime(
  ctx: TransferInboundContext,
  peerOwnerId: string,
  message: ChatMessage,
): Promise<void> {
  const chatLogStore = ctx.getChatLogStore();
  if (!chatLogStore) return;
  const attachments = message.content.attachments;
  if (!attachments?.length) return;
  const threadPeerOwnerId = peerOwnerId.trim();
  let changed = false;
  for (const attachment of attachments) {
    const key = deferredDirectChatAttachmentKey(
      threadPeerOwnerId,
      message.messageId,
      attachment.id,
    );
    const vaultPath = ctx.getTransferState().deferredDirectChatAttachmentVaultPath.get(key);
    if (!vaultPath) continue;
    const updated = await chatLogStore.updateAttachmentVaultPath(
      threadPeerOwnerId,
      message.messageId,
      attachment.id,
      vaultPath,
    );
    if (!updated) continue;
    ctx.getTransferState().deferredDirectChatAttachmentVaultPath.delete(key);
    changed = true;
  }
  if (!changed) return;
}

export async function emitDirectChatMessageAfterAttachmentUpdateViaRuntime(
  ctx: TransferInboundContext,
  threadPeerOwnerId: string,
  messageId: string,
): Promise<void> {
  const chatLogStore = ctx.getChatLogStore();
  if (!chatLogStore) return;
  const rows = await chatLogStore.listThread(threadPeerOwnerId, 5000);
  const msg = rows.find((row) => row.messageId === messageId);
  if (!msg) return;
  const full: ChatMessage = { ...msg, signature: msg.signature };
  ctx.emit("chat:message", full);
}
