import { describe, expect, it, vi } from "vitest";
import { generateDeviceIdentity, generateOwnerIdentity, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createProfileRequestPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { isLibp2pPeerId, sendProfileRequest } from "../src/profile-sync-outbound.js";

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
    const send = vi.fn();
    const mesh = { sendExpectReply, send };

    const reply = await sendProfileRequest({
      mesh,
      profile: { owner, device, deviceCertificate: undefined as never },
      transportPeerId: "12D3KooWTestPeerIdForProfileSync",
      envelopeRecipientPeerId: "envoy_testrecipient",
      dialHintsFor: async () => ["/p2p/12D3KooWTestPeerIdForProfileSync"],
    });

    expect(sendExpectReply).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(reply).toBe(responseEnvelope);
  });
});
