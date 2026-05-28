import { deriveOwnerId, verifyHumanProfile } from "@envoymesh/identity";
import {
  createProfileSyncPayload,
  parseProfileRequestPayload,
  parseProfileSyncPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { PeerProfileCacheStore } from "@envoymesh/local-store";
import type { ContactOwnerKeyStore } from "@envoymesh/local-store";

export type ProfileSyncInboundResult =
  | { handled: true; ownerId: string }
  | { handled: false; reason: string };

export async function handleInboundProfileSync(input: {
  envelope: EnvoyEnvelope;
  contactOwnerKeyStore: ContactOwnerKeyStore;
  peerProfileCache: PeerProfileCacheStore;
}): Promise<ProfileSyncInboundResult> {
  let payload;
  try {
    payload = parseProfileSyncPayload(input.envelope.payload);
  } catch {
    return { handled: false, reason: "invalid profile.sync payload" };
  }
  const profile = payload.profile;
  let ownerPublicKeyPem = (await input.contactOwnerKeyStore.get(profile.ownerId))?.ownerPublicKeyPem;
  if (payload.ownerPublicKeyPem) {
    if (deriveOwnerId(payload.ownerPublicKeyPem) !== profile.ownerId) {
      return { handled: false, reason: "owner public key mismatch" };
    }
    ownerPublicKeyPem = payload.ownerPublicKeyPem;
    await input.contactOwnerKeyStore.upsert(profile.ownerId, ownerPublicKeyPem);
  }
  if (!ownerPublicKeyPem) {
    return { handled: false, reason: "unknown owner public key" };
  }
  if (!verifyHumanProfile(profile, ownerPublicKeyPem)) {
    return { handled: false, reason: "invalid profile signature" };
  }
  let thumbnail: { contentBase64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" } | undefined;
  const inline = payload.publicThumbnailInline;
  if (inline && profile.publicThumbnail) {
    if (inline.contentSha256 !== profile.publicThumbnail.contentSha256) {
      return { handled: false, reason: "thumbnail hash mismatch" };
    }
    thumbnail = { contentBase64: inline.contentBase64, mimeType: inline.mimeType };
  }
  await input.peerProfileCache.upsert(profile, thumbnail);
  return { handled: true, ownerId: profile.ownerId };
}

export async function handleInboundProfileRequest(input: {
  envelope: EnvoyEnvelope;
  /** libp2p peer id from the inbound stream (required to dial back) */
  transportPeerId: string;
  contactOwnerKeyStore: ContactOwnerKeyStore;
  loadLocalProfile: () => Promise<import("@envoymesh/protocol").HumanProfilePayload | undefined>;
  sendProfileResponse: (
    envelopeRecipientPeerId: string,
    profile: import("@envoymesh/protocol").HumanProfilePayload,
    transportPeerId: string,
  ) => Promise<void>;
}): Promise<ProfileSyncInboundResult> {
  let payload;
  try {
    payload = parseProfileRequestPayload(input.envelope.payload);
  } catch {
    return { handled: false, reason: "invalid profile.request payload" };
  }
  const local = await input.loadLocalProfile();
  if (!local) {
    return { handled: false, reason: "no profile to share" };
  }
  const envelopeRecipientPeerId = input.envelope.senderPeerId;
  if (!envelopeRecipientPeerId) {
    return { handled: false, reason: "missing sender peer id" };
  }
  if (!input.transportPeerId.trim()) {
    return { handled: false, reason: "missing libp2p transport peer id" };
  }
  await input.sendProfileResponse(envelopeRecipientPeerId, local, input.transportPeerId);
  return { handled: true, ownerId: local.ownerId };
}

export { createProfileSyncPayload };
