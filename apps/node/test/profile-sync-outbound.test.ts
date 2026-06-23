import { describe, expect, it, vi } from "vitest";
import { generateDeviceIdentity, generateOwnerIdentity, signHumanProfile } from "@envoymesh/identity";
import { type EnvoyEnvelope } from "@envoymesh/protocol";
import { isLibp2pPeerId, sendProfileRequest, sendProfileSyncToBonds } from "../src/profile-sync-outbound.js";
import { createOutboundMeshMock } from "./helpers/outbound-mesh-mock.js";

function outboundMeshMock(overrides: Record<string, unknown> = {}) {
  return createOutboundMeshMock(overrides as Parameters<typeof createOutboundMeshMock>[0]);
}

describe("isLibp2pPeerId", () => {
  it("accepts libp2p peer ids and rejects Envoy envelope ids", () => {
    expect(isLibp2pPeerId("12D3KooWTestPeerIdForProfileSync")).toBe(true);
    expect(isLibp2pPeerId("envoy_1KoMqLW3ZC7LAhZGVvWvu7vsSYe7wHnkiVQmby3v_Y0")).toBe(false);
    expect(isLibp2pPeerId("envoy:owner:abc")).toBe(false);
  });
});

describe("sendProfileRequest", () => {
  it("uses sendExpectReply and returns profile.response", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const responseEnvelope = {
      intent: "profile.response",
      payload: { profile: { ownerId: owner.ownerId } },
    } as EnvoyEnvelope;
    const sendExpectReply = vi.fn().mockResolvedValue(responseEnvelope);
    const mesh = outboundMeshMock({ sendExpectReply });

    const reply = await sendProfileRequest({
      mesh,
      profile: { owner, device, deviceCertificate: undefined as never },
      transportPeerId: "12D3KooWTestPeerIdForProfileSync",
      envelopeRecipientPeerId: "envoy_testrecipient",
      dialHintsFor: async () => ["/p2p/12D3KooWTestPeerIdForProfileSync"],
    });

    expect(sendExpectReply).toHaveBeenCalledTimes(1);
    expect(mesh.send).not.toHaveBeenCalled();
    expect(reply).toBe(responseEnvelope);
  });
});

describe("sendProfileSyncToBonds", () => {
  function signedHumanProfile(owner: ReturnType<typeof generateOwnerIdentity>) {
    return signHumanProfile(
      {
        version: "0.1",
        ownerId: owner.ownerId,
        displayName: "Self",
        username: "self",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
        publicThumbnail: {
          vaultRelativePath: "profile/thumbnail.jpg",
          mimeType: "image/jpeg",
          contentSha256: "a".repeat(64),
        },
      },
      owner.privateKeyPem,
    );
  }

  it("warms reachability, retries on NO_RESERVATION, and continues after failure", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = { owner, device, deviceCertificate: undefined as never };
    const humanProfile = signedHumanProfile(owner);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed to connect via relay with status NO_RESERVATION"))
      .mockResolvedValueOnce(undefined);
    const mesh = outboundMeshMock({
      send,
      mergePeerStoreDialHints: vi.fn().mockResolvedValue(undefined),
    });

    await sendProfileSyncToBonds({
      mesh,
      profile,
      humanProfile,
      vaultDir: "/tmp/vault",
      bondOwnerIds: [owner.ownerId, "envoy:owner:missing"],
      resolveLibp2pPeer: async (ownerId) => {
        if (ownerId === owner.ownerId) {
          return {
            peerId: "12D3KooWProfileSyncReachability",
            listenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncReachability"],
          };
        }
        return undefined;
      },
      dialHintsFor: async () => ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncReachability"],
    });

    expect(mesh.ensurePeerReachable).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(mesh.closeConnectionsToPeer).toHaveBeenCalled();
    expect(mesh.mergePeerStoreDialHints).toHaveBeenCalled();
  });

  it("isolates dial hint failures per bond", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = { owner, device, deviceCertificate: undefined as never };
    const humanProfile = signedHumanProfile(owner);
    const send = vi.fn(async () => undefined);
    const mesh = outboundMeshMock({ send });

    await sendProfileSyncToBonds({
      mesh,
      profile,
      humanProfile,
      vaultDir: "/tmp/vault",
      bondOwnerIds: ["envoy:owner:bad-hints", "envoy:owner:good"],
      resolveLibp2pPeer: async (ownerId) => ({
        peerId: ownerId === "envoy:owner:good" ? "12D3KooWProfileSyncGoodBond" : "12D3KooWProfileSyncBadBond",
      }),
      dialHintsFor: async (peerId) => {
        if (peerId.includes("BadBond")) {
          throw new Error("dial hints exploded");
        }
        return ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncGoodBond"];
      },
    });

    expect(send).toHaveBeenCalledTimes(1);
  });
});
