import { describe, expect, it } from "vitest";
import type { ChatMessagePayload, DeviceCertificate, EnvoyEnvelope } from "@envoymesh/protocol";
import {
  chatMessagePayloadDeviceFields,
  formatChatSenderDisplayName,
  verifyInboundChatDeviceAuthorization,
} from "../src/chat-device-auth.js";

const sampleCert = {
  version: "0.1" as const,
  certificateId: "cert-1",
  ownerId: "envoy:owner:alice",
  deviceId: "envoy:device:phone",
  devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nphone\n-----END PUBLIC KEY-----",
  deviceProfile: "satellite" as const,
  capabilities: ["message.send"],
  issuedAt: new Date().toISOString(),
  expiresAt: null,
  signature: "sig",
} satisfies DeviceCertificate;

const envelope = {
  version: "0.1" as const,
  messageId: "msg-1",
  createdAt: new Date().toISOString(),
  senderPeerId: "envoy_phone",
  senderPublicKey: sampleCert.devicePublicKeyPem,
  senderRole: "human" as const,
  recipientRole: "human" as const,
  intent: "chat.message" as const,
  payload: {},
  signature: "env-sig",
} satisfies EnvoyEnvelope;

describe("verifyInboundChatDeviceAuthorization", () => {
  it("allows legacy chat without device certificate", () => {
    const payload: ChatMessagePayload = { senderOwnerId: "envoy:owner:alice", text: "hi" };
    expect(
      verifyInboundChatDeviceAuthorization(envelope, payload, () => true),
    ).toEqual({ ok: true });
  });

  it("rejects when certificate present but verification fails", () => {
    const payload: ChatMessagePayload = {
      senderOwnerId: "envoy:owner:alice",
      text: "hi",
      deviceCertificate: sampleCert,
      ownerPublicKeyPem: "owner-pk",
    };
    const result = verifyInboundChatDeviceAuthorization(envelope, payload, () => false);
    expect(result).toEqual({ ok: false, reason: "unauthorized device certificate for chat.message" });
  });

  it("returns device metadata when authorized", () => {
    const payload: ChatMessagePayload = {
      senderOwnerId: "envoy:owner:alice",
      text: "hi",
      deviceCertificate: sampleCert,
      ownerPublicKeyPem: "owner-pk",
    };
    expect(
      verifyInboundChatDeviceAuthorization(envelope, payload, () => true),
    ).toEqual({ ok: true, deviceId: "envoy:device:phone", deviceProfile: "satellite" });
  });
});

describe("chatMessagePayloadDeviceFields", () => {
  it("returns empty object when no certificate", () => {
    expect(chatMessagePayloadDeviceFields({})).toEqual({});
  });

  it("includes cert and owner key when provided", () => {
    expect(
      chatMessagePayloadDeviceFields({
        deviceCertificate: sampleCert,
        ownerPublicKeyPem: "owner-pk",
      }),
    ).toEqual({
      deviceCertificate: sampleCert,
      ownerPublicKeyPem: "owner-pk",
    });
  });
});

describe("formatChatSenderDisplayName", () => {
  it("appends device profile for satellite senders", () => {
    const payload: ChatMessagePayload = {
      senderOwnerId: "envoy:owner:alice",
      text: "hi",
      deviceCertificate: sampleCert,
      ownerPublicKeyPem: "owner-pk",
    };
    expect(formatChatSenderDisplayName("Alice", payload)).toBe("Alice (satellite)");
  });
});
