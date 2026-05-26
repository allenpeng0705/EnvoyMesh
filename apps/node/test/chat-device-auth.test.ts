import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChatMessagePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyAuthorizedDeviceEnvelope,
} from "@envoymesh/identity";
import { createDeviceAuthorizationStore } from "@envoymesh/local-store";
import { verifyInboundChatDeviceAuthorization } from "@envoymesh/api";
import { bindDeviceAuthorizationStore, verifyInboundChatDevice } from "../src/chat-device-auth.js";

describe("verifyInboundChatDevice", () => {
  it("accepts chat.message with valid device certificate", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const deviceCertificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["message.send"],
    });
    const payload = createChatMessagePayload({
      senderOwnerId: owner.ownerId,
      text: "hello from phone",
      deviceCertificate,
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    const unsigned = createUnsignedEnvelope({
      intent: "chat.message",
      senderPeerId: derivePeerId(device.publicKeyPem),
      senderPublicKey: device.publicKeyPem,
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, device.privateKeyPem);

    expect(payload.deviceCertificate).toBeDefined();
    expect(
      verifyAuthorizedDeviceEnvelope(envelope, deviceCertificate, owner.publicKeyPem),
    ).toBe(true);
    expect(
      verifyInboundChatDeviceAuthorization(
        envelope,
        payload,
        verifyAuthorizedDeviceEnvelope,
      ).ok,
    ).toBe(true);

    const result = await verifyInboundChatDevice(envelope, payload);
    expect(result).toEqual({
      ok: true,
      deviceId: device.deviceId,
      deviceProfile: "satellite",
    });
  });

  it("rejects revoked device certificates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoymesh-chat-revoke-"));
    try {
      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      const deviceCertificate = createDeviceCertificate({
        owner,
        device,
        deviceProfile: "satellite",
        capabilities: ["message.send"],
      });
      const store = createDeviceAuthorizationStore(dir);
      bindDeviceAuthorizationStore(store);
      await store.revokeDevice({
        owner,
        deviceId: device.deviceId,
        certificateId: deviceCertificate.certificateId,
        reason: "compromised",
      });

      const payload = createChatMessagePayload({
        senderOwnerId: owner.ownerId,
        text: "revoked phone",
        deviceCertificate,
        ownerPublicKeyPem: owner.publicKeyPem,
      });
      const unsigned = createUnsignedEnvelope({
        intent: "chat.message",
        senderPeerId: derivePeerId(device.publicKeyPem),
        senderPublicKey: device.publicKeyPem,
        payload,
      });
      const envelope = signUnsignedEnvelope(unsigned, device.privateKeyPem);

      await expect(verifyInboundChatDevice(envelope, payload)).resolves.toEqual({
        ok: false,
        reason: "device certificate revoked",
      });
    } finally {
      bindDeviceAuthorizationStore(null);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects chat.message when device certificate fails verification", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const otherDevice = generateDeviceIdentity();
    const deviceCertificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["message.send"],
    });
    const payload = createChatMessagePayload({
      senderOwnerId: owner.ownerId,
      text: "tampered",
      deviceCertificate,
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    const unsigned = createUnsignedEnvelope({
      intent: "chat.message",
      senderPeerId: derivePeerId(otherDevice.publicKeyPem),
      senderPublicKey: otherDevice.publicKeyPem,
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, otherDevice.privateKeyPem);

    await expect(verifyInboundChatDevice(envelope, payload)).resolves.toEqual({
      ok: false,
      reason: "unauthorized device certificate for chat.message",
    });
  });
});
