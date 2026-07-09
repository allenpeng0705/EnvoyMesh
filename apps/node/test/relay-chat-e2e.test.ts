/**
 * E2E relay-mediated chat tests
 *
 * These tests verify that two nodes can exchange chat messages when
 * their communication is mediated by a relay server.
 *
 * Default relay: community relay at 47.93.11.212:4001. Override with
 * TEST_RELAY_ADDR when running against a private relay.
 *
 *   # Default community relay
 *   npx vitest run apps/node/test/relay-chat-e2e.test.ts
 *
 *   # Custom relay
 *   TEST_RELAY_ADDR=/ip4/127.0.0.1/tcp/4001/p2p/... npx vitest run apps/node/test/relay-chat-e2e.test.ts
 *
 *   # Without relay (tests will be skipped)
 *   npm test -- apps/node/test/relay-chat-e2e.test.ts
 */

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
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

// Default to the community relay at 47.93.11.212:4001 when no explicit
// TEST_RELAY_ADDR is provided. Operators can override by exporting
// TEST_RELAY_ADDR before running the test.
const RELAY_ADDR = process.env.TEST_RELAY_ADDR || DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR;

const meshes: EnvoyMesh[] = [];

const itRelayed = RELAY_ADDR ? it : it.skip;

describe("E2E relay-mediated chat", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-relay-chat-"));
  });

  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
    await rm(profileDir, { recursive: true, force: true });
  });

  itRelayed("exchanges chat messages via relay server", async () => {

    const senderProfile = testProfile();
    const receiverProfile = testProfile();

    // Create two nodes that connect via relay
    const sender = await startMeshWithRelay();
    const receiver = await startMeshWithRelay();

    const receivedMessages: { text: string; senderOwnerId: string }[] = [];

    receiver.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        receivedMessages.push({
          text: payload.text,
          senderOwnerId: payload.senderOwnerId,
        });
      }
    });

    // Give nodes time to discover each other via relay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Sender sends chat message to receiver via relay
    const chatPayload = createChatMessagePayload({
      senderOwnerId: senderProfile.owner.ownerId,
      text: "Hello via relay!",
    });

    const unsignedEnvelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: receiver.peerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: chatPayload,
    });

    const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, senderProfile.device.privateKeyPem);

    // Use sendChat which should work via relay if receiver is reachable
    await sender.sendChat(receiver.multiaddrs[0], signedEnvelope);

    // Wait for message to be received
    await waitFor(async () => receivedMessages.length > 0, 5000);

    expect(receivedMessages.length).toBeGreaterThan(0);
    expect(receivedMessages[0].text).toBe("Hello via relay!");
    expect(receivedMessages[0].senderOwnerId).toBe(senderProfile.owner.ownerId);
  });

  itRelayed("verifies multiple messages exchange via relay", async () => {

    const senderProfile = testProfile();
    const receiverProfile = testProfile();

    const sender = await startMeshWithRelay();
    const receiver = await startMeshWithRelay();

    const receivedMessages: string[] = [];

    receiver.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message") {
        const payload = parseChatMessagePayload(envelope.payload);
        receivedMessages.push(payload.text);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const messages = ["First message via relay", "Second message via relay", "Third message via relay"];

    for (const text of messages) {
      const chatPayload = createChatMessagePayload({
        senderOwnerId: senderProfile.owner.ownerId,
        text,
      });

      const unsignedEnvelope = createUnsignedEnvelope({
        senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
        senderPublicKey: senderProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: receiver.peerId,
        recipientRole: "human",
        intent: "chat.message",
        payload: chatPayload,
      });

      const signedEnvelope = signUnsignedEnvelope(unsignedEnvelope, senderProfile.device.privateKeyPem);
      await sender.sendChat(receiver.multiaddrs[0], signedEnvelope);
    }

    await waitFor(async () => receivedMessages.length === 3, 5000);

    expect(receivedMessages).toEqual(messages);
  });
});

async function startMeshWithRelay(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    bootstrapPeers: RELAY_ADDR ? [RELAY_ADDR] : [],
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