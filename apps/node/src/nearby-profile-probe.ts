import type { NodeProfile, PeerSearchResult } from "@envoymesh/api";
import type { ContactOwnerKeyStore, PeerProfileCacheStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { handleInboundProfileSync } from "./profile-sync-inbound.js";
import { sendProfileRequest } from "./profile-sync-outbound.js";

export async function probeNearbyPeerProfile(input: {
  mesh: Pick<EnvoyMesh, "send" | "sendExpectReply">;
  profile: NodeProfile;
  contactOwnerKeyStore: ContactOwnerKeyStore;
  peerProfileCache: PeerProfileCacheStore;
  transportPeerId: string;
  listenAddrs: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  selfPeerId: string;
  selfOwnerId: string;
  timeoutMs?: number;
}): Promise<PeerSearchResult | null> {
  if (input.transportPeerId === input.selfPeerId) {
    return null;
  }
  try {
    const reply = await sendProfileRequest({
      mesh: input.mesh,
      profile: input.profile,
      transportPeerId: input.transportPeerId,
      envelopeRecipientPeerId: input.transportPeerId,
      listenAddrs: input.listenAddrs,
      dialHintsFor: input.dialHintsFor,
      timeoutMs: input.timeoutMs ?? 8_000,
    });
    const cached = await handleInboundProfileSync({
      envelope: reply,
      contactOwnerKeyStore: input.contactOwnerKeyStore,
      peerProfileCache: input.peerProfileCache,
    });
    if (!cached.handled) {
      return null;
    }
    const row = await input.peerProfileCache.get(cached.ownerId);
    const hp = row?.profile;
    if (!hp || hp.ownerId === input.selfOwnerId) {
      return null;
    }
    return {
      nodeId: input.transportPeerId,
      ownerId: hp.ownerId,
      displayName: hp.displayName,
      username: hp.username,
      bio: hp.bio,
      interests: [...(hp.hobbies ?? []), ...(hp.knowledge ?? [])],
      profileVisibility: hp.profileVisibility ?? "public",
    };
  } catch {
    return null;
  }
}
