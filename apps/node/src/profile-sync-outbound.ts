import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { derivePeerId } from "@envoymesh/identity";
import {
  sendEnvelopeWithRetry,
  sendExpectReplyWithRetry,
  type OutboundDeliverMesh,
  type OutboundExpectReplyMesh,
} from "./chat-outbound-deliver.js";
import { loadProfileThumbnailInline } from "./profile-thumbnail-inline.js";

/** libp2p peer ids start with `12D3KooW` (base58btc); envelope ids use `envoy_`. */
export function isLibp2pPeerId(peerId: string): boolean {
  const id = peerId.trim();
  return id.length > 0 && !id.startsWith("envoy_") && !id.startsWith("envoy:");
}

type ProfileSyncMesh = OutboundDeliverMesh &
  Pick<EnvoyMesh, "mergePeerStoreDialHints">;

export async function buildSignedProfilePayloadEnvelope(input: {
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  intent: "profile.sync" | "profile.response";
  recipientPeerId?: string;
}): Promise<EnvoyEnvelope> {
  const publicThumbnailInline = await loadProfileThumbnailInline(input.vaultDir, input.humanProfile);
  const payload = createProfileSyncPayload(
    input.humanProfile,
    publicThumbnailInline,
    input.profile.owner.publicKeyPem,
  );
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: input.intent,
    payload,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

export async function sendProfileSyncToBonds(input: {
  mesh: ProfileSyncMesh;
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  bondOwnerIds: string[];
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  if (!input.humanProfile.publicThumbnail) return;
  const envelope = await buildSignedProfilePayloadEnvelope({
    profile: input.profile,
    humanProfile: input.humanProfile,
    vaultDir: input.vaultDir,
    intent: "profile.sync",
  });
  for (const ownerId of input.bondOwnerIds) {
    try {
      const resolved = await input.resolveLibp2pPeer(ownerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
        console.warn(`[profile.sync] skip bond ${ownerId.slice(0, 20)}…: no libp2p peer id`);
        continue;
      }

      let dialHints: string[];
      try {
        dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      } catch (hintErr) {
        console.warn(
          `[profile.sync] dial hints failed for ${ownerId.slice(0, 16)}…:`,
          hintErr instanceof Error ? hintErr.message : hintErr,
        );
        continue;
      }

      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
        ).catch((err) => console.warn(`[profile.sync] mergePeerStoreDialHints failed:`, err));
      }

      try {
        await sendEnvelopeWithRetry({
          mesh: input.mesh,
          transportPeerId: resolved.peerId,
          envelope,
          dialHints,
          peerListenAddrs: resolved.listenAddrs,
          rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
        });
      } catch (err) {
        console.warn(
          `[profile.sync] send to ${ownerId.slice(0, 16)}… failed after retry:`,
          err instanceof Error ? err.message : err,
        );
      }
    } catch (bondErr) {
      console.warn(
        `[profile.sync] bond ${ownerId.slice(0, 20)}… failed:`,
        bondErr instanceof Error ? bondErr.message : bondErr,
      );
    }
  }
}

export async function sendProfileRequest(input: {
  mesh: OutboundExpectReplyMesh;
  profile: NodeProfile;
  /** libp2p peer id used for mesh dial */
  transportPeerId: string;
  /** Envelope routing id (typically `envoy_*` from the contact device key) */
  envelopeRecipientPeerId: string;
  listenAddrs?: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  timeoutMs?: number;
}): Promise<EnvoyEnvelope> {
  if (!isLibp2pPeerId(input.transportPeerId)) {
    throw new Error("profile.request requires a libp2p transport peer id");
  }
  const payload = createProfileRequestPayload(input.profile.owner.ownerId);
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.envelopeRecipientPeerId,
    recipientRole: "human",
    intent: "profile.request",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
  const dialHints = await input.dialHintsFor(input.transportPeerId, input.listenAddrs);
  const timeoutMs = input.timeoutMs ?? 30_000;
  if (typeof input.mesh.sendExpectReply !== "function") {
    await sendEnvelopeWithRetry({
      mesh: input.mesh,
      transportPeerId: input.transportPeerId,
      envelope,
      dialHints,
      peerListenAddrs: input.listenAddrs,
    });
    throw new Error("profile.request requires sendExpectReply on mesh");
  }
  const reply = await sendExpectReplyWithRetry({
    mesh: input.mesh,
    transportPeerId: input.transportPeerId,
    envelope,
    dialHints,
    peerListenAddrs: input.listenAddrs,
    timeoutMs,
    rebuildDialHints: () => input.dialHintsFor(input.transportPeerId, input.listenAddrs),
  });
  if (reply.intent !== "profile.response") {
    throw new Error(`profile.request: expected profile.response, got ${reply.intent}`);
  }
  return reply;
}

export async function sendProfileResponse(input: {
  mesh: OutboundDeliverMesh;
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  /** Envelope `recipientPeerId` (requester's `envoy_*` sender id) */
  envelopeRecipientPeerId: string;
  /** libp2p peer id from the inbound connection (mesh dial target) */
  transportPeerId: string;
  listenAddrs?: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  if (!isLibp2pPeerId(input.transportPeerId)) {
    throw new Error("profile.response requires a libp2p transport peer id");
  }
  const envelope = await buildSignedProfilePayloadEnvelope({
    profile: input.profile,
    humanProfile: input.humanProfile,
    vaultDir: input.vaultDir,
    intent: "profile.response",
    recipientPeerId: input.envelopeRecipientPeerId,
  });
  const dialHints = await input.dialHintsFor(input.transportPeerId, input.listenAddrs);
  await sendEnvelopeWithRetry({
    mesh: input.mesh,
    transportPeerId: input.transportPeerId,
    envelope,
    dialHints,
    peerListenAddrs: input.listenAddrs,
    rebuildDialHints: () => input.dialHintsFor(input.transportPeerId, input.listenAddrs),
  });
}
