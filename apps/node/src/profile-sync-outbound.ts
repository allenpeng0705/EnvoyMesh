import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { derivePeerId } from "@envoymesh/identity";
import { loadProfileThumbnailInline } from "./profile-thumbnail-inline.js";

/** libp2p peer ids start with `12D3KooW` (base58btc); envelope ids use `envoy_`. */
export function isLibp2pPeerId(peerId: string): boolean {
  const id = peerId.trim();
  return id.length > 0 && !id.startsWith("envoy_") && !id.startsWith("envoy:");
}

export async function sendProfileSyncToBonds(input: {
  mesh: EnvoyMesh;
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
  const publicThumbnailInline = await loadProfileThumbnailInline(input.vaultDir, input.humanProfile);
  if (!publicThumbnailInline) {
    console.warn(
      `[profile.sync] thumbnail bytes missing on disk for ${input.profile.owner.ownerId.slice(0, 20)}… (path/hash mismatch?)`,
    );
  }
  const payload = createProfileSyncPayload(
    input.humanProfile,
    publicThumbnailInline,
    input.profile.owner.publicKeyPem,
  );
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
    const resolved = await input.resolveLibp2pPeer(ownerId);
    if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
      console.warn(`[profile.sync] skip bond ${ownerId.slice(0, 20)}…: no libp2p peer id`);
      continue;
    }
    try {
      const dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      await input.mesh.send(resolved.peerId, envelope, { dialHints });
    } catch (err) {
      console.warn(`[profile.sync] send to ${ownerId.slice(0, 16)}… failed:`, err);
    }
  }
}

export async function sendProfileRequest(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  /** libp2p peer id used for mesh dial */
  transportPeerId: string;
  /** Envelope routing id (typically `envoy_*` from the contact device key) */
  envelopeRecipientPeerId: string;
  listenAddrs?: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
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
  await input.mesh.send(input.transportPeerId, envelope, { dialHints });
}

export async function sendProfileResponse(input: {
  mesh: EnvoyMesh;
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
    recipientPeerId: input.envelopeRecipientPeerId,
    recipientRole: "human",
    intent: "profile.response",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
  const dialHints = await input.dialHintsFor(input.transportPeerId, input.listenAddrs);
  await input.mesh.send(input.transportPeerId, envelope, { dialHints });
}
