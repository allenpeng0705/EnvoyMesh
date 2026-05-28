import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
  parseProfileRequestPayload,
  parseProfileSyncPayload,
  type HumanProfilePayload,
  type ProfileThumbnailInline,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope, verifyHumanProfile } from "@envoymesh/mobile-identity";
import type { MobilePeerProfileCache } from "./mobile-peer-profile-cache.js";
import type { MobileContactOwnerKeyStore } from "./mobile-contact-owner-keys.js";
import type { MobileVault } from "@envoymesh/mobile-vault";

export async function loadMobileProfileThumbnailInline(
  vault: MobileVault,
  profile: HumanProfilePayload,
): Promise<ProfileThumbnailInline | undefined> {
  const ref = profile.publicThumbnail;
  if (!ref) return undefined;
  const vaultPath = ref.vaultRelativePath.startsWith("/")
    ? ref.vaultRelativePath
    : `/${ref.vaultRelativePath}`;
  let entry;
  try {
    entry = await vault.readFile(vaultPath);
  } catch {
    return undefined;
  }
  const bytes = entry.content;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  const contentSha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (contentSha256 !== ref.contentSha256) return undefined;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return {
    contentBase64: btoa(binary),
    mimeType: ref.mimeType,
    contentSha256,
  };
}

export async function handleMobileInboundProfileSync(input: {
  payload: unknown;
  ownerKeys: MobileContactOwnerKeyStore;
  cache: MobilePeerProfileCache;
}): Promise<{ ok: true; ownerId: string } | { ok: false; reason: string }> {
  let payload;
  try {
    payload = parseProfileSyncPayload(input.payload);
  } catch {
    return { ok: false, reason: "invalid profile.sync payload" };
  }
  const profile = payload.profile;
  const keys = await input.ownerKeys.get(profile.ownerId);
  if (!keys?.ownerPublicKeyPem) {
    return { ok: false, reason: "unknown owner public key" };
  }
  if (!verifyHumanProfile(profile, keys.ownerPublicKeyPem)) {
    return { ok: false, reason: "invalid profile signature" };
  }
  let thumbnail: { contentBase64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" } | undefined;
  const inline = payload.publicThumbnailInline;
  if (inline && profile.publicThumbnail) {
    if (inline.contentSha256 !== profile.publicThumbnail.contentSha256) {
      return { ok: false, reason: "thumbnail hash mismatch" };
    }
    thumbnail = { contentBase64: inline.contentBase64, mimeType: inline.mimeType };
  }
  await input.cache.upsert(profile, thumbnail);
  return { ok: true, ownerId: profile.ownerId };
}

export async function handleMobileInboundProfileRequest(input: {
  payload: unknown;
  senderPeerId: string;
  loadLocalProfile: () => Promise<HumanProfilePayload | undefined>;
  sendProfileResponse: (recipientPeerId: string, profile: HumanProfilePayload) => Promise<void>;
}): Promise<{ ok: true; ownerId: string } | { ok: false; reason: string }> {
  let payload;
  try {
    payload = parseProfileRequestPayload(input.payload);
  } catch {
    return { ok: false, reason: "invalid profile.request payload" };
  }
  const local = await input.loadLocalProfile();
  if (!local) {
    return { ok: false, reason: "no profile to share" };
  }
  if (!input.senderPeerId) {
    return { ok: false, reason: "missing sender peer id" };
  }
  await input.sendProfileResponse(input.senderPeerId, local);
  return { ok: true, ownerId: local.ownerId };
}

export async function sendMobileProfileEnvelope(input: {
  devicePrivateKeyPem: string;
  devicePublicKeyPem: string;
  recipientPeerId?: string;
  intent: "profile.sync" | "profile.request" | "profile.response";
  payload: unknown;
  sendJson: (targetPeerId: string, json: string) => Promise<void>;
  targetPeerId: string;
}): Promise<void> {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.devicePublicKeyPem),
    senderPublicKey: input.devicePublicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: input.intent,
    payload: input.payload,
  });
  const signed = signUnsignedEnvelope(unsigned, input.devicePrivateKeyPem);
  await input.sendJson(input.targetPeerId, JSON.stringify(signed));
}
