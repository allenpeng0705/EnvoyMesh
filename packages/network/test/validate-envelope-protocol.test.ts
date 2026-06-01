import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { ENVOY_CHAT_PROTOCOL, ENVOY_MESSAGE_PROTOCOL, EnvoyMesh } from "../src/index.js";

describe("validateEnvelopeProtocol", () => {
  it("rejects chat.message on message protocol", async () => {
    const mesh = new EnvoyMesh({ enableMdns: false });
    await mesh.start();
    try {
      const envelope = {
        ...createUnsignedEnvelope({
          senderPeerId: "peer-a",
          senderPublicKey: "pk-a",
          senderRole: "human",
          recipientPeerId: "peer-b",
          recipientRole: "human",
          intent: "chat.message",
          payload: { senderOwnerId: "envoy:owner:a", text: "hello" },
        }),
        signature: "sig",
      };
      await expect(mesh.send("/ip4/127.0.0.1/tcp/1", envelope as any)).rejects.toThrow(
        /chat\.message must be sent on chat protocol/,
      );
    } finally {
      await mesh.stop();
    }
  });

  it("rejects non-chat intents on chat protocol", async () => {
    const mesh = new EnvoyMesh({ enableMdns: false });
    await mesh.start();
    try {
      const envelope = {
        ...createUnsignedEnvelope({
          senderPeerId: "peer-a",
          senderPublicKey: "pk-a",
          senderRole: "system",
          recipientPeerId: "peer-b",
          recipientRole: "agent",
          intent: "system.ping",
          payload: { nonce: "n1" },
        }),
        signature: "sig",
      };
      await expect(mesh.sendChat("/ip4/127.0.0.1/tcp/1", envelope as any)).rejects.toThrow(
        /invalid intent system\.ping on chat protocol/,
      );
    } finally {
      await mesh.stop();
    }
  });

  it("allows group chat intents on chat protocol", async () => {
    const mesh = new EnvoyMesh({ enableMdns: false });
    await mesh.start();
    try {
      for (const intent of ["chat.room.sync", "chat.room.message"] as const) {
        const envelope = {
          ...createUnsignedEnvelope({
            senderPeerId: "peer-a",
            senderPublicKey: "pk-a",
            senderRole: "human",
            recipientPeerId: "peer-b",
            recipientRole: "human",
            intent,
            payload: { roomId: "11111111-1111-4111-8111-111111111111", text: "hi" },
          }),
          signature: "sig",
        };
        await expect(mesh.sendChat("/ip4/127.0.0.1/tcp/1", envelope as any)).rejects.not.toThrow(
          /invalid intent .* on chat protocol/,
        );
      }
    } finally {
      await mesh.stop();
    }
  });

  it("exports distinct chat and message protocol ids", () => {
    expect(ENVOY_CHAT_PROTOCOL).not.toBe(ENVOY_MESSAGE_PROTOCOL);
  });
});
