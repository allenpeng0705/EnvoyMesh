/**
 * Bond management runtime (hello / accept / revoke).
 *
 * Extracted from `node-service-impl.ts`. Owns the outbound bond.request
 * path and local trust mutations. Transport helpers stay on the class
 * and are accessed through BondContext.
 */
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createBondAcceptPayload,
  createBondRequestPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type {
  BondRecord,
  HelloProfile,
  HelloResponse,
  SendHelloOptions,
  SocialIntroProposal,
} from "@envoymesh/api";
import type { LocalPeerDirectoryStore, LocalTrustStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { pickBestLibp2pPeerDirectoryRecord } from "./peer-transport-resolve.js";

export interface PendingHelloRequest {
  requesterOwnerId: string;
  requesterDisplayName: string;
  remotePeerId: string;
  message: string;
  requestedLevel?: string;
}

export interface BondContext {
  assertOnline(): void;
  requireMesh(): EnvoyMesh;
  requireProfile(): { owner: { ownerId: string }; device: { publicKeyPem: string; privateKeyPem: string } };
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  humanProfileStore: { loadHumanProfile(): Promise<{ displayName?: string } | undefined> };
  sessionTokenStore?: { removeTokensForOwner(ownerId: string): Promise<void> };
  getPendingSocialIntroProposals(): Map<string, SocialIntroProposal & { ownerCommitmentRef?: string }>;
  getPendingHelloRequests(): Map<string, PendingHelloRequest>;
  dialHintsForChat(recipientPeerId: string, peerListenAddrs: string[] | undefined): Promise<string[]>;
  deliverCallEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs: string[] | undefined,
  ): Promise<unknown>;
  tagBondedContactReachability(peerId: string): void;
  untagReachabilityForOwner(ownerId: string): Promise<void>;
  flushPendingRoomSyncs(): void;
  flushPendingRoomMessages(): void;
  refreshBondPeerProfiles(): Promise<unknown>;
  emit(event: "bond:established" | "bond:revoked", data: { peerOwnerId: string; displayName?: string }): void;
}

export async function sendHelloViaRuntime(
  ctx: BondContext,
  targetOwnerId: string,
  profile: HelloProfile,
  message: string,
  options?: SendHelloOptions,
): Promise<HelloResponse> {
  ctx.assertOnline();
  const mesh = ctx.requireMesh();
  const selfProfile = ctx.requireProfile();

  let introCorrelationId: string | undefined;
  let ownerCommitmentRef: string | undefined;
  let pendingIntro: (SocialIntroProposal & { ownerCommitmentRef?: string }) | undefined;

  if (options?.introProposalMessageId) {
    pendingIntro = ctx.getPendingSocialIntroProposals().get(options.introProposalMessageId);
    if (!pendingIntro) {
      throw new Error(`No pending intro proposal for messageId=${options.introProposalMessageId}`);
    }
    if (!pendingIntro.ownerCommitmentRef) {
      throw new Error("Approve the intro commitment before sending hello");
    }
    if (pendingIntro.candidateOwnerId.trim() !== targetOwnerId.trim()) {
      throw new Error("Intro proposal candidate does not match hello target owner id");
    }
    introCorrelationId = pendingIntro.introCorrelationId;
    ownerCommitmentRef = pendingIntro.ownerCommitmentRef;
  }

  const peerRecords = await ctx.peerDirectoryStore.listPeerRecords();
  let matchedRecord =
    peerRecords.find((r) => r.ownerId === targetOwnerId) ??
    peerRecords.find((r) => r.peerId === targetOwnerId);
  let targetPeerId = matchedRecord?.peerId;

  if (pendingIntro?.candidatePeerId) {
    targetPeerId = pendingIntro.candidatePeerId;
    matchedRecord =
      peerRecords.find((r) => r.ownerId === pendingIntro.candidateOwnerId) ??
      peerRecords.find((r) => r.peerId === pendingIntro.candidatePeerId);
  }

  const explicitTargetPeerId = options?.targetPeerId?.trim();
  if (explicitTargetPeerId) {
    targetPeerId = explicitTargetPeerId;
    matchedRecord =
      peerRecords.find((r) => r.ownerId === targetOwnerId) ??
      peerRecords.find((r) => r.peerId === explicitTargetPeerId) ??
      matchedRecord;
  }

  if (!targetPeerId) {
    if (targetOwnerId.startsWith("Qm") || targetOwnerId.startsWith("12D3")) {
      targetPeerId = targetOwnerId;
      console.log(`[node-service] Sending hello to DHT-discovered peer: ${targetPeerId}`);
    } else {
      throw new Error(`Peer not found for owner: ${targetOwnerId}`);
    }
  }

  console.log(`[node-service] sendHello to ${targetPeerId} (message: ${message})`);

  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
      senderPublicKey: selfProfile.device.publicKeyPem,
      recipientPeerId: targetPeerId,
      intent: "bond.request",
      payload: createBondRequestPayload({
        requesterOwnerId: selfProfile.owner.ownerId,
        requesterDisplayName: profile.displayName,
        message: `[HELLO] ${message}`,
        proofOfContext:
          options?.proofOfContext?.trim() ||
          `displayName:${profile.displayName}`,
        requestedLevel: "direct",
        introCorrelationId,
        ownerCommitmentRef,
      }),
    }),
    selfProfile.device.privateKeyPem,
  );

  try {
    const dialHints = await ctx.dialHintsForChat(targetPeerId, matchedRecord?.listenAddrs);
    console.log(`[node-service] sendHello dialHints count=${dialHints.length}`);
    await ctx.deliverCallEnvelope(targetPeerId, envelope, dialHints, matchedRecord?.listenAddrs);
    console.log(`[node-service] Hello sent successfully to ${targetPeerId}`);

    if (options?.introProposalMessageId) {
      ctx.getPendingSocialIntroProposals().delete(options.introProposalMessageId);
    }

    try {
      await ctx.peerDirectoryStore.ensurePeerFromInboundChat({
        ownerId: targetOwnerId,
        peerId: targetPeerId,
        listenAddrs: matchedRecord?.listenAddrs ?? [],
      });
    } catch (err) {
      console.warn(`[peer-directory] sendHello ensurePeerFromInboundChat:`, err);
    }
    void ctx.tagBondedContactReachability(targetPeerId);
  } catch (err) {
    console.error(`[node-service] Failed to send hello to ${targetPeerId}:`, err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (
      errorMsg.includes("getComponents") ||
      errorMsg.includes("connection failed") ||
      errorMsg.includes("timeout")
    ) {
      throw new Error(
        `Cannot reach peer ${targetPeerId.slice(0, 12)}... - peer may be behind NAT/firewall. Try configuring a relay server.`,
      );
    }
    throw new Error(`Failed to send hello: ${errorMsg}`);
  }

  return {
    messageId: envelope.messageId,
    inReplyTo: "",
    decision: "accept",
    timestamp: new Date().toISOString(),
  };
}

export async function acceptPendingHelloViaRuntime(ctx: BondContext, messageId: string): Promise<void> {
  const pending = ctx.getPendingHelloRequests().get(messageId);
  if (!pending) {
    console.warn(`[node-service] acceptHello: no pending request found for messageId=${messageId}`);
    return;
  }

  ctx.requireMesh();
  const selfProfile = ctx.requireProfile();

  await ctx.trustStore.setTrustRecord({
    peerOwnerId: pending.requesterOwnerId,
    displayName: pending.requesterDisplayName,
    level: (pending.requestedLevel as "direct" | "public" | "blocked") ?? "direct",
    note: pending.message || undefined,
    now: new Date().toISOString(),
  });

  try {
    const requesterDir = await ctx.peerDirectoryStore.getPeerByOwnerId(pending.requesterOwnerId);
    await ctx.peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: pending.requesterOwnerId,
      peerId: pending.remotePeerId,
      listenAddrs: requesterDir?.listenAddrs ?? [],
    });
  } catch (err) {
    console.warn(`[peer-directory] acceptHello ensurePeerFromInboundChat:`, err);
  }

  const humanProfile = await ctx.humanProfileStore.loadHumanProfile();
  console.log(`[node-service] acceptHello: humanProfile loaded:`, humanProfile);
  const displayName = humanProfile?.displayName ?? selfProfile.owner.ownerId;
  console.log(
    `[node-service] acceptHello: using displayName="${displayName}" (humanProfile.displayName=${humanProfile?.displayName}, fallback=${selfProfile.owner.ownerId})`,
  );

  console.log(
    `[node-service] Sending bond.accept to ${pending.requesterOwnerId} at peerId ${pending.remotePeerId}`,
  );
  const acceptEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
      senderPublicKey: selfProfile.device.publicKeyPem,
      recipientPeerId: pending.remotePeerId,
      intent: "bond.accept",
      payload: createBondAcceptPayload({
        responderOwnerId: selfProfile.owner.ownerId,
        requesterOwnerId: pending.requesterOwnerId,
        message: `Hello from ${displayName}!`,
      }),
    }),
    selfProfile.device.privateKeyPem,
  );
  console.log(
    `[node-service] bond.accept envelope created: intent=${acceptEnvelope.intent}, recipientPeerId=${acceptEnvelope.recipientPeerId}, senderPeerId=${acceptEnvelope.senderPeerId}`,
  );
  try {
    console.log(`[node-service] Attempting to send bond.accept to ${pending.remotePeerId} dialHints merged…`);
    const requesterDir = await ctx.peerDirectoryStore.getPeerByOwnerId(pending.requesterOwnerId);
    const acceptDialHints = await ctx.dialHintsForChat(pending.remotePeerId, requesterDir?.listenAddrs);
    console.log(`[node-service] bond.accept dialHints count=${acceptDialHints.length}`);
    await ctx.deliverCallEnvelope(
      pending.remotePeerId,
      acceptEnvelope,
      acceptDialHints,
      requesterDir?.listenAddrs,
    );
    console.log(`[node-service] bond.accept sent successfully to ${pending.remotePeerId}`);
  } catch (sendError) {
    console.error(
      `[node-service] Failed to send bond.accept to ${pending.remotePeerId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
    );
  }

  ctx.emit("bond:established", {
    peerOwnerId: pending.requesterOwnerId,
    displayName: pending.requesterDisplayName,
  });

  void ctx.flushPendingRoomSyncs();
  void ctx.flushPendingRoomMessages();

  void ctx.refreshBondPeerProfiles().catch((err) => {
    console.warn("[profile] refreshBondPeerProfiles after hello accept failed:", err);
  });
  void ctx.tagBondedContactReachability(pending.remotePeerId);

  ctx.getPendingHelloRequests().delete(messageId);

  console.log(`[node-service] Successfully accepted hello from ${pending.requesterOwnerId}`);
}

export async function declinePendingHelloViaRuntime(
  ctx: BondContext,
  messageId: string,
  reason?: string,
): Promise<void> {
  const pending = ctx.getPendingHelloRequests().get(messageId);
  if (pending) {
    console.log(`[node-service] Declining hello from ${pending.requesterOwnerId}: ${reason ?? "no reason"}`);
    ctx.getPendingHelloRequests().delete(messageId);
  } else {
    console.warn(`[node-service] declineHello: no pending request found for messageId=${messageId}`);
  }
}

export async function blockPeerViaRuntime(ctx: BondContext, peerOwnerId: string): Promise<void> {
  await ctx.trustStore.setTrustRecord({
    peerOwnerId,
    level: "blocked",
    now: new Date().toISOString(),
  });
  await ctx.untagReachabilityForOwner(peerOwnerId);
}

export async function unblockPeerViaRuntime(ctx: BondContext, peerOwnerId: string): Promise<void> {
  const existing = await ctx.trustStore.getTrustRecord(peerOwnerId);
  if (existing) {
    await ctx.trustStore.setTrustRecord({
      peerOwnerId,
      level: existing.level === "blocked" ? "public" : existing.level,
      now: new Date().toISOString(),
    });
  }
}

export async function revokeBondViaRuntime(ctx: BondContext, peerOwnerId: string): Promise<void> {
  await ctx.untagReachabilityForOwner(peerOwnerId);
  await ctx.trustStore.removeTrustRecord(peerOwnerId);
  if (ctx.sessionTokenStore) {
    await ctx.sessionTokenStore.removeTokensForOwner(peerOwnerId);
  }
  ctx.emit("bond:revoked", { peerOwnerId });
}

export async function getBondsViaRuntime(ctx: BondContext): Promise<BondRecord[]> {
  const trustRecords = await ctx.trustStore.listTrustRecords();
  const dirRecords = await ctx.peerDirectoryStore.listPeerRecords();
  const latestByOwner = new Map<string, { peerId: string; lastSeenAt: string }>();
  for (const r of dirRecords) {
    const libp2p = pickBestLibp2pPeerDirectoryRecord(dirRecords, r.ownerId);
    if (libp2p) {
      latestByOwner.set(r.ownerId, { peerId: libp2p.peerId, lastSeenAt: libp2p.lastSeenAt });
    }
  }
  for (const r of dirRecords) {
    if (latestByOwner.has(r.ownerId)) continue;
    const cur = latestByOwner.get(r.ownerId);
    if (!cur || r.lastSeenAt > cur.lastSeenAt) {
      latestByOwner.set(r.ownerId, { peerId: r.peerId, lastSeenAt: r.lastSeenAt });
    }
  }
  return trustRecords.map((record) => ({
    peerOwnerId: record.peerOwnerId,
    displayName: record.displayName,
    libp2pPeerId: latestByOwner.get(record.peerOwnerId)?.peerId,
    level: record.level,
    createdAt: record.createdAt,
    note: record.note,
  }));
}
