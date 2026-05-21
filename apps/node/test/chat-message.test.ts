import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";

const meshes: EnvoyMesh[] = [];
let receiverProfileDir: string;

beforeEach(async () => {
  receiverProfileDir = await mkdtemp(join(tmpdir(), "envoymesh-chat-test-"));
});

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
  await rm(receiverProfileDir, { recursive: true, force: true });
});

describe("chat.message over EnvoyMesh", () => {
  it("sends and receives a signed chat.message between two local nodes", async () => {
    const senderProfile = testProfile();
    const receiver = await startMesh();
    const sender = await startMesh();

    const receivedMessage = new Promise<{ text: string; senderOwnerId: string } | null>((resolve) => {
      receiver.onMessage(async ({ envelope }) => {
        if (envelope.intent !== "chat.message") {
          resolve(null);
          return;
        }

        if (!verifyInboundEnvelope(envelope)) {
          resolve(null);
          return;
        }

        const payload = parseChatMessagePayload(envelope.payload);
        resolve({
          text: payload.text,
          senderOwnerId: payload.senderOwnerId,
        });
      });
    });

    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: receiver.peerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: createChatMessagePayload({
        senderOwnerId: senderProfile.owner.ownerId,
        text: "Hello from test!",
      }),
    });

    const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, senderProfile.device.privateKeyPem);

    await sender.sendChat(receiver.multiaddrs[0], signedEnvelope);

    const received = await receivedMessage;

    expect(received).not.toBeNull();
    expect(received?.text).toBe("Hello from test!");
    expect(received?.senderOwnerId).toBe(senderProfile.owner.ownerId);
  });

  it("sends multiple chat.messages in sequence between two nodes", async () => {
    const senderProfile = testProfile();
    const receiver = await startMesh();
    const sender = await startMesh();

    const receivedMessages: string[] = [];

    receiver.onMessage(async ({ envelope }) => {
      if (envelope.intent !== "chat.message") {
        return;
      }
      if (!verifyInboundEnvelope(envelope)) {
        return;
      }
      const payload = parseChatMessagePayload(envelope.payload);
      receivedMessages.push(payload.text);
    });

    const messages = ["First message", "Second message", "Third message"];

    for (const text of messages) {
      const unsignedEnvelope = createUnsignedEnvelope({
        senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
        senderPublicKey: senderProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: receiver.peerId,
        recipientRole: "human",
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: senderProfile.owner.ownerId,
          text,
        }),
      });

      const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, senderProfile.device.privateKeyPem);
      await sender.sendChat(receiver.multiaddrs[0], signedEnvelope);
    }

    await waitFor(async () => receivedMessages.length === 3);

    expect(receivedMessages).toEqual(messages);
  });

  it("verifies signature is valid and senderPeerId matches derived peerId", async () => {
    const senderProfile = testProfile();
    const receiver = await startMesh();
    const sender = await startMesh();

    const verificationResults: { valid: boolean; senderPeerId: string }[] = [];

    receiver.onMessage(async ({ envelope }) => {
      if (envelope.intent !== "chat.message") {
        return;
      }

      const valid = verifyEnvelope(envelope);
      verificationResults.push({
        valid,
        senderPeerId: envelope.senderPeerId,
      });
    });

    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: receiver.peerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: createChatMessagePayload({
        senderOwnerId: senderProfile.owner.ownerId,
        text: "Signed message",
      }),
    });

    const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, senderProfile.device.privateKeyPem);

    await sender.sendChat(receiver.multiaddrs[0], signedEnvelope);

    await waitFor(async () => verificationResults.length === 1);

    expect(verificationResults[0].valid).toBe(true);
    expect(verificationResults[0].senderPeerId).toBe(derivePeerId(senderProfile.device.publicKeyPem));
  });
});

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
  });

  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

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
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for condition");
}
