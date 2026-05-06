/**
 * Phase 8M — E2E knowledge query test.
 *
 * Tests the full knowledge query flow between two mesh nodes:
 * 1. Two nodes pair via bond.challenge → bond.challenge.response → bond.accept
 * 2. Alice sends knowledge.query to Bob
 * 3. Bob processes it via handleInboundKnowledgeQuery (vault + modelProviders)
 * 4. Bob sends knowledge.response back to Alice
 * 5. Alice verifies receipt of knowledge.response
 *
 * This exercises the full mesh transport + knowledge-query-inbound handler.
 */

import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyEnvelope,
} from "@envoymesh/identity";
import {
  createBondAcceptPayload,
  createBondChallengePayload,
  createBondChallengeResponsePayload,
  createKnowledgeQueryPayload,
  createKnowledgeResponsePayload,
  createUnsignedEnvelope,
  parseBondAcceptPayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseKnowledgeQueryPayload,
  parseKnowledgeResponsePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";
import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { handleInboundKnowledgeQuery } from "../src/knowledge-query-inbound.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("E2E knowledge query between bonded peers", () => {
  it("exchanges knowledge.query and knowledge.response between paired nodes", async () => {
    const aliceProfile = testProfile();
    const bobProfile = testProfile();

    // Set up Bob's stores and vault
    const bobProfileDir = await mkdtemp(join(tmpdir(), "envoymesh-kq-e2e-bob-"));
    const bobTaskStore = createLocalTaskStore(bobProfileDir);
    const bobTrustStore = createLocalTrustStore(bobProfileDir);
    const bobPeerDirectoryStore = createLocalPeerDirectoryStore(bobProfileDir);

    // Create vault with content for Bob
    const vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-kq-e2e-vault-"));
    await writeFile(join(vaultDir, "about.md"), "EnvoyMesh is a decentralized P2P network for AI agents.", "utf8");
    const vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    // Register Bob's peer in Bob's own peer directory (so lookups work)
    await bobPeerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: bobProfile.owner.ownerId,
      peerId: derivePeerId(bobProfile.device.publicKeyPem),
      listenAddrs: [],
    });

    const aliceReceived: string[] = [];
    const bobReceived: string[] = [];
    let aliceQueryMessageId = "";

    // Alice's handler
    const alice = await startMesh();
    alice.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      aliceReceived.push(envelope.intent);

      if (envelope.intent === "knowledge.response") {
        const response = parseKnowledgeResponsePayload(envelope.payload);
        expect(response.inReplyTo).toBe(aliceQueryMessageId);
        expect(response.answer).toContain("EnvoyMesh");
      }
    });

    // Bob's handler — processes knowledge.query and responds
    const bob = await startMesh();
    bob.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      bobReceived.push(envelope.intent);

      if (envelope.intent === "bond.challenge") {
        // Bob responds to bond.challenge with challenge response
        const challenge = parseBondChallengePayload(envelope.payload);

        const responsePayload = createBondChallengeResponsePayload({
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          responderOwnerId: bobProfile.owner.ownerId,
          decision: "accept",
          proofOfContext: "I accept",
        });

        const unsignedResponse = createUnsignedEnvelope({
          senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
          senderPublicKey: bobProfile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: alice.peerId,
          recipientRole: "human",
          intent: "bond.challenge.response",
          payload: responsePayload,
        });

        const signedResponse = signUnsignedEnvelope(unsignedResponse, bobProfile.device.privateKeyPem);
        await bob.send(alice.multiaddrs[0], signedResponse);

      } else if (envelope.intent === "bond.accept") {
        // Bob receives bond.accept — pairing complete
        const accept = parseBondAcceptPayload(envelope.payload);
        expect(accept.requesterOwnerId).toBe(aliceProfile.owner.ownerId);

      } else if (envelope.intent === "knowledge.query") {
        // Bob processes knowledge.query via handleInboundKnowledgeQuery
        const query = parseKnowledgeQueryPayload(envelope.payload);

        // Register Alice in Bob's peer directory and trust store
        await bobPeerDirectoryStore.ensurePeerFromInboundChat({
          ownerId: aliceProfile.owner.ownerId,
          peerId: derivePeerId(aliceProfile.device.publicKeyPem),
          listenAddrs: [],
        });
        await bobTrustStore.setTrustRecord({
          peerOwnerId: aliceProfile.owner.ownerId,
          level: "direct",
          now: new Date().toISOString(),
        });

        const result = await handleInboundKnowledgeQuery({
          envelope,
          remotePeerId: alice.peerId,
          receivedAt: Date.now(),
          correlationId: `corr-kq-${Date.now()}`,
          taskStore: bobTaskStore,
          trustStore: bobTrustStore,
          peerDirectoryStore: bobPeerDirectoryStore,
          profile: bobProfile,
          vaultIndex,
          modelProviders: { mode: "mock" },
        });

        expect(result.ok).toBe(true);

        // Send knowledge.response back to Alice
        const refused = !result.ok || (result.responsePayload?.refused ?? false);
        const responsePayload = createKnowledgeResponsePayload({
          inReplyTo: envelope.messageId,
          answer: refused
            ? `Sorry: ${result.responsePayload?.refusalReason ?? "error"}`
            : (result.ok ? (result.responsePayload?.answer ?? "No answer") : "Error"),
          sensitivity: "public",
          refused,
        });

        const unsignedResponse = createUnsignedEnvelope({
          senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
          senderPublicKey: bobProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: alice.peerId,
          recipientRole: "agent",
          intent: "knowledge.response",
          payload: responsePayload,
        });

        const signedResponse = signUnsignedEnvelope(unsignedResponse, bobProfile.device.privateKeyPem);
        await bob.send(alice.multiaddrs[0], signedResponse);
      }
    });

    // Give nodes time to discover each other via mDNS
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Alice initiates bond.challenge to Bob
    const challengePayload = createBondChallengePayload({
      challengerOwnerId: aliceProfile.owner.ownerId,
      targetOwnerId: bobProfile.owner.ownerId,
      message: "Let's connect",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const unsignedChallenge = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: bob.peerId,
      recipientRole: "human",
      intent: "bond.challenge",
      payload: challengePayload,
    });

    const signedChallenge = signUnsignedEnvelope(unsignedChallenge, aliceProfile.device.privateKeyPem);
    await alice.send(bob.multiaddrs[0], signedChallenge);

    // Wait for pairing to complete
    await waitFor(async () => bobReceived.includes("bond.challenge"), 4000);
    expect(bobReceived).toContain("bond.challenge");

    await waitFor(async () => aliceReceived.includes("bond.challenge.response"), 4000);
    expect(aliceReceived).toContain("bond.challenge.response");

    // Alice sends bond.accept to finalize pairing
    const acceptPayload = createBondAcceptPayload({
      requesterOwnerId: aliceProfile.owner.ownerId,
      responderOwnerId: bobProfile.owner.ownerId,
      message: "Bond accepted",
    });

    const unsignedAccept = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: bob.peerId,
      recipientRole: "human",
      intent: "bond.accept",
      payload: acceptPayload,
    });

    const signedAccept = signUnsignedEnvelope(unsignedAccept, aliceProfile.device.privateKeyPem);
    await alice.send(bob.multiaddrs[0], signedAccept);

    await waitFor(async () => bobReceived.includes("bond.accept"), 4000);
    expect(bobReceived).toContain("bond.accept");

    // Alice sends knowledge.query to Bob
    const queryPayload = createKnowledgeQueryPayload({
      query: "What is EnvoyMesh?",
      maxSensitivity: "public",
    });

    aliceQueryMessageId = `kq-${Date.now()}`;
    const unsignedQuery = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: bob.peerId,
      recipientRole: "agent",
      intent: "knowledge.query",
      payload: queryPayload,
    });

    const signedQuery = signUnsignedEnvelope(unsignedQuery, aliceProfile.device.privateKeyPem);
    await alice.send(bob.multiaddrs[0], signedQuery);

    // Wait for Bob to receive and respond
    await waitFor(async () => bobReceived.includes("knowledge.query"), 4000);
    expect(bobReceived).toContain("knowledge.query");

    // Wait for Alice to receive knowledge.response
    await waitFor(async () => aliceReceived.includes("knowledge.response"), 4000);
    expect(aliceReceived).toContain("knowledge.response");

    // Clean up
    await rm(bobProfileDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });
});

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: true,
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
}
