import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import { derivePeerId } from "@envoymesh/identity";
import { loadProfileThumbnailInline } from "./profile-thumbnail-inline.js";

export async function sendProfileSyncToBonds(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  peerDirectoryStore: LocalPeerDirectoryStore;
  bondOwnerIds: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  if (!input.humanProfile.publicThumbnail) return;
  const publicThumbnailInline = await loadProfileThumbnailInline(input.vaultDir, input.humanProfile);
  const payload = createProfileSyncPayload(input.humanProfile, publicThumbnailInline);
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientRole: "human",
    intent: "profile.sync",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
  for (const ownerId of input.bondOwnerIds) {
    const rec = await input.peerDirectoryStore.getPeerByOwnerId(ownerId);
    if (!rec?.peerId) continue;
    try {
      const dialHints = await input.dialHintsFor(rec.peerId, rec.listenAddrs);
      await input.mesh.send(rec.peerId, envelope, { dialHints });
    } catch (err) {
      console.warn(`[profile.sync] send to ${ownerId.slice(0, 16)}… failed:`, err);
    }
  }
}

export async function sendProfileRequest(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  targetPeerId: string;
  listenAddrs?: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  const payload = createProfileRequestPayload(input.profile.owner.ownerId);
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.targetPeerId,
    recipientRole: "human",
    intent: "profile.request",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
  const dialHints = await input.dialHintsFor(input.targetPeerId, input.listenAddrs);
  await input.mesh.send(input.targetPeerId, envelope, { dialHints });
}

export async function sendProfileResponse(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  recipientPeerId: string;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  const publicThumbnailInline = await loadProfileThumbnailInline(input.vaultDir, input.humanProfile);
  const payload = createProfileSyncPayload(input.humanProfile, publicThumbnailInline);
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: "profile.response",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
  const dialHints = await input.dialHintsFor(input.recipientPeerId);
  await input.mesh.send(input.recipientPeerId, envelope, { dialHints });
}
