import { describe, expect, it, vi } from "vitest";
import { generateOwnerIdentity, signHumanProfile } from "@envoymesh/identity";
import { createPeerProfileCacheStore } from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { handleInboundProfileRequest, handleInboundProfileSync } from "../src/profile-sync-inbound.js";

describe("handleInboundProfileRequest", () => {
  it("responds with signed profile when local has gallery but no thumbnail", async () => {
    const owner = generateOwnerIdentity();
    const requester = generateOwnerIdentity();
    const profile = signHumanProfile(
      {
        version: "0.1",
        ownerId: owner.ownerId,
        displayName: "Gallery Only",
        username: "gal01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
        galleryPhotos: [
          {
            photoId: "trip",
            vaultRelativePath: "profile/gallery/trip.png",
            contentSha256: "a".repeat(64),
            mimeType: "image/png",
            visibility: "public",
            label: "Trip",
          },
        ],
      },
      owner.privateKeyPem,
    );

    const sendProfileResponse = vi.fn().mockResolvedValue(undefined);
    const envelope = createUnsignedEnvelope({
      senderPeerId: "envoy_peer_requester",
      senderPublicKey: requester.publicKeyPem,
      senderRole: "human",
      intent: "profile.request",
      payload: createProfileRequestPayload(requester.ownerId),
    });

    const result = await handleInboundProfileRequest({
      envelope,
      transportPeerId: "12D3KooWRequesterLibp2pPeerIdForTest",
      contactOwnerKeyStore: {
        get: async () => undefined,
        upsert: async () => {},
        list: async () => [],
      },
      loadLocalProfile: async () => profile,
      sendProfileResponse,
    });

    expect(result.handled).toBe(true);
    expect(sendProfileResponse).toHaveBeenCalledWith(
      "envoy_peer_requester",
      profile,
      "12D3KooWRequesterLibp2pPeerIdForTest",
    );
  });

  it("declines when local profile is missing", async () => {
    const requester = generateOwnerIdentity();
    const envelope = createUnsignedEnvelope({
      senderPeerId: "envoy_peer_requester",
      senderPublicKey: requester.publicKeyPem,
      senderRole: "human",
      intent: "profile.request",
      payload: createProfileRequestPayload(requester.ownerId),
    });

    const result = await handleInboundProfileRequest({
      envelope,
      transportPeerId: "12D3KooWRequesterLibp2pPeerIdForTest",
      contactOwnerKeyStore: { get: async () => undefined, upsert: async () => {}, list: async () => [] },
      loadLocalProfile: async () => undefined,
      sendProfileResponse: vi.fn(),
    });

    expect(result.handled).toBe(false);
    if (result.handled) throw new Error("expected not handled");
    expect(result.reason).toMatch(/no profile/i);
  });
});

describe("handleInboundProfileSync", () => {
  it("caches profile when ownerPublicKeyPem is in payload and key store is empty", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoy-profile-sync-in-"));
    const peerOwner = generateOwnerIdentity();
    const profile = signHumanProfile(
      {
        version: "0.1",
        ownerId: peerOwner.ownerId,
        displayName: "Mac Peer",
        username: "mac01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
      },
      peerOwner.privateKeyPem,
    );
    const cache = createPeerProfileCacheStore(profileDir);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const envelope = createUnsignedEnvelope({
      senderPeerId: "envoy_peer_mac",
      senderPublicKey: peerOwner.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload: createProfileSyncPayload(profile, undefined, peerOwner.publicKeyPem),
    });

    const result = await handleInboundProfileSync({
      envelope,
      contactOwnerKeyStore: { get: async () => undefined, upsert, list: async () => [] },
      peerProfileCache: cache,
    });

    expect(result.handled).toBe(true);
    expect(upsert).toHaveBeenCalledWith(peerOwner.ownerId, peerOwner.publicKeyPem);
    const row = await cache.get(peerOwner.ownerId);
    expect(row?.profile.displayName).toBe("Mac Peer");
    await rm(profileDir, { recursive: true, force: true });
  });
});
