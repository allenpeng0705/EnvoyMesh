import { describe, expect, it } from "vitest";
import { handleInboundSyncStateIntent } from "../src/sync-state-inbound.js";
import { createSyncStatePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { generateOwnerIdentity, generateDeviceIdentity, createDeviceCertificate } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/local-store";

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["device.sync"],
    }),
  };
}

describe("sync-state-inbound", () => {
  it("accepts same-owner sync.state", () => {
    const profile = testProfile();
    const envelope = createUnsignedEnvelope({
      intent: "sync.state",
      senderPeerId: "peer-a",
      senderPublicKey: profile.device.publicKeyPem,
      payload: createSyncStatePayload({
        scope: "assistant-draft:v1",
        updateBase64: "AQID",
        senderOwnerId: profile.owner.ownerId,
      }),
    });
    const result = handleInboundSyncStateIntent({ envelope, profile });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope).toBe("assistant-draft:v1");
    }
  });

  it("rejects foreign owner", () => {
    const profile = testProfile();
    const envelope = createUnsignedEnvelope({
      intent: "sync.state",
      senderPeerId: "peer-a",
      senderPublicKey: profile.device.publicKeyPem,
      payload: createSyncStatePayload({
        scope: "assistant-draft:v1",
        updateBase64: "AQID",
        senderOwnerId: "envoy:owner:other",
      }),
    });
    expect(handleInboundSyncStateIntent({ envelope, profile }).ok).toBe(false);
  });
});
