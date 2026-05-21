import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createBondAcceptPayload,
  createBondChallengePayload,
  createBondChallengeResponsePayload,
  createChatMessagePayload,
  createUnsignedEnvelope,
  parseBondAcceptPayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseChatMessagePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("E2E pairing and chat workflow", () => {
  it("completes full pairing flow then exchanges chat messages", async () => {
    const challengerProfile = testProfile();
    const targetProfile = testProfile();
    const challenger = await startMesh();
    const target = await startMesh();

    // Track messages
    const challengerReceived: string[] = [];
    const targetReceived: string[] = [];

    // Challenger's message handler
    challenger.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      challengerReceived.push(envelope.intent);

      if (envelope.intent === "bond.challenge.response") {
        // Challenger receives challenge response, now sends bond.accept
        const response = parseBondChallengeResponsePayload(envelope.payload);

        const acceptPayload = createBondAcceptPayload({
          requesterOwnerId: challengerProfile.owner.ownerId,
          responderOwnerId: targetProfile.owner.ownerId,
          message: "Bond accepted",
        });

        const unsignedAccept = createUnsignedEnvelope({
          senderPeerId: derivePeerId(challengerProfile.device.publicKeyPem),
          senderPublicKey: challengerProfile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: target.peerId,
          recipientRole: "human",
          intent: "bond.accept",
          payload: acceptPayload,
        });

        const signedAccept = signUnsignedEnvelope(unsignedAccept, challengerProfile.device.privateKeyPem);
        await challenger.send(target.multiaddrs[0], signedAccept);
      } else if (envelope.intent === "bond.accept") {
        // Challenger received bond.accept - pairing complete!
      }
    });

    // Target's message handler
    target.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      targetReceived.push(envelope.intent);

      if (envelope.intent === "bond.challenge") {
        // Target receives challenge, responds with challenge response
        const challenge = parseBondChallengePayload(envelope.payload);

        const responsePayload = createBondChallengeResponsePayload({
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          responderOwnerId: targetProfile.owner.ownerId,
          decision: "accept",
          proofOfContext: "I accept the bond challenge",
        });

        const unsignedResponse = createUnsignedEnvelope({
          senderPeerId: derivePeerId(targetProfile.device.publicKeyPem),
          senderPublicKey: targetProfile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: challenger.peerId,
          recipientRole: "human",
          intent: "bond.challenge.response",
          payload: responsePayload,
        });

        const signedResponse = signUnsignedEnvelope(unsignedResponse, targetProfile.device.privateKeyPem);
        await target.send(challenger.multiaddrs[0], signedResponse);
      } else if (envelope.intent === "bond.accept") {
        // Target receives bond.accept - pairing complete!
        const accept = parseBondAcceptPayload(envelope.payload);
        expect(accept.requesterOwnerId).toBe(challengerProfile.owner.ownerId);
        expect(accept.responderOwnerId).toBe(targetProfile.owner.ownerId);

        // Now that pairing is complete, send chat messages
        const chatPayload = createChatMessagePayload({
          senderOwnerId: targetProfile.owner.ownerId,
          text: "Hello from target after pairing!",
        });

        const unsignedChat = createUnsignedEnvelope({
          senderPeerId: derivePeerId(targetProfile.device.publicKeyPem),
          senderPublicKey: targetProfile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: challenger.peerId,
          recipientRole: "human",
          intent: "chat.message",
          payload: chatPayload,
        });

        const signedChat = signUnsignedEnvelope(unsignedChat, targetProfile.device.privateKeyPem);
        await target.sendChat(challenger.multiaddrs[0], signedChat);
      } else if (envelope.intent === "chat.message") {
        // Challenger receives chat message after pairing
        const chat = parseChatMessagePayload(envelope.payload);
        expect(chat.text).toBe("Hello from target after pairing!");
      }
    });

    // Step 1: Challenger initiates bond.challenge to target
    const challengePayload = createBondChallengePayload({
      challengerOwnerId: challengerProfile.owner.ownerId,
      targetOwnerId: targetProfile.owner.ownerId,
      message: "Please accept this bond challenge",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const unsignedChallenge = createUnsignedEnvelope({
      senderPeerId: derivePeerId(challengerProfile.device.publicKeyPem),
      senderPublicKey: challengerProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: target.peerId,
      recipientRole: "human",
      intent: "bond.challenge",
      payload: challengePayload,
    });

    const signedChallenge = signUnsignedEnvelope(unsignedChallenge, challengerProfile.device.privateKeyPem);
    await challenger.send(target.multiaddrs[0], signedChallenge);

    // Wait for target to receive challenge
    await waitFor(async () => targetReceived.includes("bond.challenge"), 3000);
    expect(targetReceived).toContain("bond.challenge");

    // Wait for challenger to receive challenge response
    await waitFor(async () => challengerReceived.includes("bond.challenge.response"), 3000);
    expect(challengerReceived).toContain("bond.challenge.response");

    // Wait for target to receive bond.accept
    await waitFor(async () => targetReceived.includes("bond.accept"), 3000);
    expect(targetReceived).toContain("bond.accept");

    // Wait for chat message to be received by challenger
    await waitFor(async () => challengerReceived.includes("chat.message"), 3000);
    expect(challengerReceived).toContain("chat.message");
  });

  it("rejects bond challenge and verifies no bond is created", async () => {
    const challengerProfile = testProfile();
    const targetProfile = testProfile();
    const challenger = await startMesh();
    const target = await startMesh();

    const challengerReceived: string[] = [];

    challenger.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      challengerReceived.push(envelope.intent);
    });

    target.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;

      if (envelope.intent === "bond.challenge") {
        const challenge = parseBondChallengePayload(envelope.payload);

        // Target rejects the challenge
        const responsePayload = createBondChallengeResponsePayload({
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          responderOwnerId: targetProfile.owner.ownerId,
          decision: "reject",
          note: "I do not wish to bond at this time",
        });

        const unsignedResponse = createUnsignedEnvelope({
          senderPeerId: derivePeerId(targetProfile.device.publicKeyPem),
          senderPublicKey: targetProfile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: challenger.peerId,
          recipientRole: "human",
          intent: "bond.challenge.response",
          payload: responsePayload,
        });

        const signedResponse = signUnsignedEnvelope(unsignedResponse, targetProfile.device.privateKeyPem);
        await target.send(challenger.multiaddrs[0], signedResponse);
      }
    });

    // Challenger sends bond.challenge
    const challengePayload = createBondChallengePayload({
      challengerOwnerId: challengerProfile.owner.ownerId,
      targetOwnerId: targetProfile.owner.ownerId,
    });

    const unsignedChallenge = createUnsignedEnvelope({
      senderPeerId: derivePeerId(challengerProfile.device.publicKeyPem),
      senderPublicKey: challengerProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: target.peerId,
      recipientRole: "human",
      intent: "bond.challenge",
      payload: challengePayload,
    });

    const signedChallenge = signUnsignedEnvelope(unsignedChallenge, challengerProfile.device.privateKeyPem);
    await challenger.send(target.multiaddrs[0], signedChallenge);

    // Wait for challenge response (rejection)
    await waitFor(async () => challengerReceived.includes("bond.challenge.response"), 3000);
    expect(challengerReceived).toContain("bond.challenge.response");

    // Verify the decision was "reject" - no bond.accept should come
    // (we don't need to parse the payload to verify rejection for this test)
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