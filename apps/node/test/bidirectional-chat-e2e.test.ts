import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("E2E bidirectional chat", () => {
  it("exchanges chat messages in both directions simultaneously", async () => {
    const aliceProfile = testProfile();
    const bobProfile = testProfile();
    const alice = await startMesh();
    const bob = await startMesh();

    const aliceReceived: string[] = [];
    const bobReceived: string[] = [];

    alice.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        aliceReceived.push(payload.text);
      }
    });

    bob.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        bobReceived.push(payload.text);
      }
    });

    // Alice sends to Bob
    const alicePayload = createChatMessagePayload({
      senderOwnerId: aliceProfile.owner.ownerId,
      text: "Hello from Alice!",
    });

    const aliceEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: bob.peerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: alicePayload,
    });

    const aliceSigned = signUnsignedEnvelope(aliceEnvelope, aliceProfile.device.privateKeyPem);
    await alice.sendChat(bob.multiaddrs[0], aliceSigned);

    // Bob sends to Alice
    const bobPayload = createChatMessagePayload({
      senderOwnerId: bobProfile.owner.ownerId,
      text: "Hello from Bob!",
    });

    const bobEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
      senderPublicKey: bobProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: alice.peerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: bobPayload,
    });

    const bobSigned = signUnsignedEnvelope(bobEnvelope, bobProfile.device.privateKeyPem);
    await bob.sendChat(alice.multiaddrs[0], bobSigned);

    // Wait for both to receive
    await waitFor(async () => aliceReceived.length === 1 && bobReceived.length === 1, 3000);

    expect(aliceReceived).toContain("Hello from Bob!");
    expect(bobReceived).toContain("Hello from Alice!");
  });

  it("handles rapid back-and-forth message exchange", async () => {
    const aliceProfile = testProfile();
    const bobProfile = testProfile();
    const alice = await startMesh();
    const bob = await startMesh();

    const aliceReceived: string[] = [];
    const bobReceived: string[] = [];

    alice.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        aliceReceived.push(payload.text);
      }
    });

    bob.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        bobReceived.push(payload.text);
      }
    });

    // Send 3 messages from Alice, then 3 from Bob, interleaved
    const aliceMessages = ["Alice msg 1", "Alice msg 2", "Alice msg 3"];
    const bobMessages = ["Bob msg 1", "Bob msg 2", "Bob msg 3"];

    // Alice sends all
    for (const text of aliceMessages) {
      const payload = createChatMessagePayload({
        senderOwnerId: aliceProfile.owner.ownerId,
        text,
      });

      const envelope = createUnsignedEnvelope({
        senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
        senderPublicKey: aliceProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: bob.peerId,
        recipientRole: "human",
        intent: "chat.message",
        payload,
      });

      const signed = signUnsignedEnvelope(envelope, aliceProfile.device.privateKeyPem);
      await alice.sendChat(bob.multiaddrs[0], signed);
    }

    // Bob sends all
    for (const text of bobMessages) {
      const payload = createChatMessagePayload({
        senderOwnerId: bobProfile.owner.ownerId,
        text,
      });

      const envelope = createUnsignedEnvelope({
        senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
        senderPublicKey: bobProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: alice.peerId,
        recipientRole: "human",
        intent: "chat.message",
        payload,
      });

      const signed = signUnsignedEnvelope(envelope, bobProfile.device.privateKeyPem);
      await bob.sendChat(alice.multiaddrs[0], signed);
    }

    await waitFor(async () => aliceReceived.length === 3 && bobReceived.length === 3, 5000);

    expect(bobReceived).toEqual(aliceMessages);
    expect(aliceReceived).toEqual(bobMessages);
  });
});

describe("E2E multi-peer chat", () => {
  it("one sender broadcasts to multiple recipients", async () => {
    const senderProfile = testProfile();
    const recipient1Profile = testProfile();
    const recipient2Profile = testProfile();

    const sender = await startMesh();
    const recipient1 = await startMesh();
    const recipient2 = await startMesh();

    const recipient1Received: string[] = [];
    const recipient2Received: string[] = [];

    recipient1.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        recipient1Received.push(payload.text);
      }
    });

    recipient2.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        recipient2Received.push(payload.text);
      }
    });

    // Sender broadcasts to both recipients sequentially
    const messages = ["Broadcast 1", "Broadcast 2", "Broadcast 3"];

    for (const text of messages) {
      const payload = createChatMessagePayload({
        senderOwnerId: senderProfile.owner.ownerId,
        text,
      });

      // Send to recipient 1
      const envelope1 = createUnsignedEnvelope({
        senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
        senderPublicKey: senderProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: recipient1.peerId,
        recipientRole: "human",
        intent: "chat.message",
        payload,
      });

      const signed1 = signUnsignedEnvelope(envelope1, senderProfile.device.privateKeyPem);
      await sender.sendChat(recipient1.multiaddrs[0], signed1);

      // Send to recipient 2
      const envelope2 = createUnsignedEnvelope({
        senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
        senderPublicKey: senderProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: recipient2.peerId,
        recipientRole: "human",
        intent: "chat.message",
        payload,
      });

      const signed2 = signUnsignedEnvelope(envelope2, senderProfile.device.privateKeyPem);
      await sender.sendChat(recipient2.multiaddrs[0], signed2);
    }

    await waitFor(async () => recipient1Received.length === 3 && recipient2Received.length === 3, 5000);

    expect(recipient1Received).toEqual(messages);
    expect(recipient2Received).toEqual(messages);
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