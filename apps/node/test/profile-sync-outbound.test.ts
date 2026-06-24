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
  it("uses sendChatExpectEnvelopeReply and returns profile.response", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const responseEnvelope = {
      intent: "profile.response",
      payload: { profile: { ownerId: owner.ownerId } },
    } as EnvoyEnvelope;
    const sendChatExpectEnvelopeReply = vi.fn().mockResolvedValue(responseEnvelope);
    const mesh = outboundMeshMock({
      sendChatExpectEnvelopeReply,
      getConnectedPeerIds: vi.fn().mockReturnValue(["12D3KooWTestPeerIdForProfileSync"]),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    });

    const reply = await sendProfileRequest({
      mesh,
      profile: { owner, device, deviceCertificate: undefined as never },
      transportPeerId: "12D3KooWTestPeerIdForProfileSync",
      envelopeRecipientPeerId: "envoy_testrecipient",
      dialHintsFor: async () => ["/p2p/12D3KooWTestPeerIdForProfileSync"],
    });

    expect(sendChatExpectEnvelopeReply).toHaveBeenCalledTimes(1);
    expect(mesh.send).not.toHaveBeenCalled();
    expect(mesh.sendExpectReply).toBeUndefined();
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

  it("sends profile.sync only when peer is connected", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = { owner, device, deviceCertificate: undefined as never };
    const humanProfile = signedHumanProfile(owner);
    const peerId = "12D3KooWProfileSyncReachability";
    const sendChat = vi.fn().mockResolvedValue(undefined);
    const mesh = outboundMeshMock({
      sendChat,
      getConnectedPeerIds: vi.fn().mockReturnValue([peerId]),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
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
            peerId,
            listenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncReachability"],
          };
        }
        return undefined;
      },
      dialHintsFor: async () => ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncReachability"],
    });

    expect(mesh.ensurePeerReachable).not.toHaveBeenCalled();
    expect(sendChat).toHaveBeenCalledTimes(1);
    expect(mesh.send).not.toHaveBeenCalled();
    expect(mesh.mergePeerStoreDialHints).toHaveBeenCalled();
  });

  it("skips profile.sync when peer is not connected", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = { owner, device, deviceCertificate: undefined as never };
    const humanProfile = signedHumanProfile(owner);
    const sendChat = vi.fn().mockResolvedValue(undefined);
    const mesh = outboundMeshMock({ sendChat });

    await sendProfileSyncToBonds({
      mesh,
      profile,
      humanProfile,
      vaultDir: "/tmp/vault",
      bondOwnerIds: [owner.ownerId],
      resolveLibp2pPeer: async () => ({
        peerId: "12D3KooWProfileSyncReachability",
        listenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncReachability"],
      }),
      dialHintsFor: async () => ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWProfileSyncReachability"],
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(mesh.ensurePeerReachable).not.toHaveBeenCalled();
  });

  it("isolates dial hint failures per bond", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = { owner, device, deviceCertificate: undefined as never };
    const humanProfile = signedHumanProfile(owner);
    const sendChat = vi.fn(async () => undefined);
    const mesh = outboundMeshMock({
      sendChat,
      getConnectedPeerIds: vi.fn().mockReturnValue(["12D3KooWProfileSyncGoodBond"]),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    });

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

    expect(sendChat).toHaveBeenCalledTimes(1);
  });
});
