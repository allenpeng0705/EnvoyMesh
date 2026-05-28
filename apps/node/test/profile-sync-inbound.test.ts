import { describe, expect, it, vi } from "vitest";
import { generateOwnerIdentity, signHumanProfile } from "@envoymesh/identity";
import { createProfileRequestPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { handleInboundProfileRequest } from "../src/profile-sync-inbound.js";

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
      contactOwnerKeyStore: {
        get: async () => undefined,
        set: async () => {},
      },
      loadLocalProfile: async () => profile,
      sendProfileResponse,
    });

    expect(result.handled).toBe(true);
    expect(sendProfileResponse).toHaveBeenCalledWith("envoy_peer_requester", profile);
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
      contactOwnerKeyStore: { get: async () => undefined, set: async () => {} },
      loadLocalProfile: async () => undefined,
      sendProfileResponse: vi.fn(),
    });

    expect(result.handled).toBe(false);
    if (result.handled) throw new Error("expected not handled");
    expect(result.reason).toMatch(/no profile/i);
  });
});
