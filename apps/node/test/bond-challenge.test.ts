import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyEnvelope,
} from "@envoymesh/identity";
import {
  createBondChallengePayload,
  createBondChallengeResponsePayload,
  createUnsignedEnvelope,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
} from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("bond challenge-response over EnvoyMesh", () => {
  it("exchanges bond.challenge and bond.challenge.response between two nodes", async () => {
    const challengerProfile = testProfile();
    const targetProfile = testProfile();
    const challenger = await startMesh();
    const target = await startMesh();

    // Track messages received by each node
    const challengerReceived: string[] = [];
    const targetReceived: string[] = [];

    challenger.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "bond.challenge.response") {
        challengerReceived.push(envelope.intent);
      }
    });

    target.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "bond.challenge") {
        targetReceived.push(envelope.intent);

        // Target responds with challenge response
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
      }
    });

    // Challenger sends bond.challenge to target
    const challengePayload = createBondChallengePayload({
      challengerOwnerId: challengerProfile.owner.ownerId,
      targetOwnerId: targetProfile.owner.ownerId,
      message: "Please accept this bond challenge",
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

    // Wait for challenge to be received by target
    await waitFor(async () => targetReceived.length === 1, 3000);

    // Wait for response to be received by challenger
    await waitFor(async () => challengerReceived.length === 1, 3000);

    expect(targetReceived[0]).toBe("bond.challenge");
    expect(challengerReceived[0]).toBe("bond.challenge.response");
  });

  it("target can reject a bond challenge", async () => {
    const challengerProfile = testProfile();
    const targetProfile = testProfile();
    const challenger = await startMesh();
    const target = await startMesh();

    const challengerReceived: string[] = [];

    challenger.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "bond.challenge.response") {
        challengerReceived.push(envelope.intent);
      }
    });

    target.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "bond.challenge") {
        // Target rejects the challenge
        const challenge = parseBondChallengePayload(envelope.payload);
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

    await waitFor(async () => challengerReceived.length === 1, 3000);

    // Challenger received the rejection - the test just verifies the exchange happened
    expect(challengerReceived[0]).toBe("bond.challenge.response");
  });

  it("verifies challenge and response payloads are correctly structured", async () => {
    const challengerProfile = testProfile();
    const targetProfile = testProfile();
    const challenger = await startMesh();
    const target = await startMesh();

    let receivedChallenge: ReturnType<typeof parseBondChallengePayload> | null = null;
    let receivedResponse: ReturnType<typeof parseBondChallengeResponsePayload> | null = null;

    challenger.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "bond.challenge.response") {
        receivedResponse = parseBondChallengeResponsePayload(envelope.payload);
      }
    });

    target.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "bond.challenge") {
        receivedChallenge = parseBondChallengePayload(envelope.payload);

        const responsePayload = createBondChallengeResponsePayload({
          challengeId: receivedChallenge.challengeId,
          nonce: receivedChallenge.nonce,
          responderOwnerId: targetProfile.owner.ownerId,
          decision: "accept",
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

    const challengePayload = createBondChallengePayload({
      challengerOwnerId: challengerProfile.owner.ownerId,
      targetOwnerId: targetProfile.owner.ownerId,
      message: "Challenge message",
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

    await waitFor(async () => receivedResponse !== null, 3000);

    // Verify challenge was received correctly
    expect(receivedChallenge).not.toBeNull();
    expect(receivedChallenge?.challengerOwnerId).toBe(challengerProfile.owner.ownerId);
    expect(receivedChallenge?.targetOwnerId).toBe(targetProfile.owner.ownerId);
    expect(receivedChallenge?.message).toBe("Challenge message");

    // Verify response was received correctly
    expect(receivedResponse).not.toBeNull();
    expect(receivedResponse?.challengeId).toBe(receivedChallenge?.challengeId);
    expect(receivedResponse?.nonce).toBe(receivedChallenge?.nonce);
    expect(receivedResponse?.decision).toBe("accept");
    expect(receivedResponse?.responderOwnerId).toBe(targetProfile.owner.ownerId);
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
