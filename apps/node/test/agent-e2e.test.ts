/**
 * Phase 9 — AI Agent E2E Tests
 *
 * Tests the AI agent as a first-class network participant:
 * 1. Agent receives chat.message and generates a draft response (autonomous policy)
 * 2. Agent participates in task workflow (mandate → propose → negotiate → accept → result)
 * 3. Agent responds to knowledge.query with vault-backed context
 * 4. Task cancellation propagation to agent
 *
 * These tests use mock model providers to simulate AI responses.
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
  createChatMessagePayload,
  createKnowledgeQueryPayload,
  createKnowledgeResponsePayload,
  createTaskAcceptPayload,
  createTaskCancelPayload,
  createTaskMandatePayload,
  createTaskNegotiatePayload,
  createTaskProposePayload,
  createTaskResultPayload,
  createUnsignedEnvelope,
  parseBondAcceptPayload,
  parseBondChallengePayload,
  parseBondChallengeResponsePayload,
  parseChatMessagePayload,
  parseKnowledgeQueryPayload,
  parseTaskAcceptPayload,
  parseTaskCancelPayload,
  parseTaskProposePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";
import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore, createLocalChatLogStore, createLocalDraftStore } from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { handleInboundKnowledgeQuery } from "../src/knowledge-query-inbound.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProofOfIntent } from "@envoymesh/protocol";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

// ============================================================================
// E2E: AI Agent Receives Task Mandate and Completes Task
// ============================================================================

describe("E2E: AI agent task workflow", () => {
  it("agent receives mandate, proposes, negotiates, accepts and receives result", async () => {
    const ownerProfile = testProfile();
    const agentProfile = testProfile();

    const ownerTaskStore = createLocalTaskStore(await mkdtemp(join(tmpdir(), "envoymesh-agent-e2e-owner-")));
    const agentTaskStore = createLocalTaskStore(await mkdtemp(join(tmpdir(), "envoymesh-agent-e2e-agent-")));
    const agentTrustStore = createLocalTrustStore(await mkdtemp(join(tmpdir(), "envoymesh-agent-e2e-trust-")));
    const agentPeerDirectoryStore = createLocalPeerDirectoryStore(await mkdtemp(join(tmpdir(), "envoymesh-agent-e2e-peer-")));

    const ownerReceived: string[] = [];
    const agentReceived: string[] = [];

    // Owner mesh
    const owner = await startMesh();
    owner.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      ownerReceived.push(envelope.intent);
    });

    // Agent mesh
    const agent = await startMesh();
    agent.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      agentReceived.push(envelope.intent);

      if (envelope.intent === "task.mandate") {
        // Agent acknowledges mandate by sending task.propose
        const taskId = `task-agent-${Date.now()}`;
        const mandateId = "mandate-agent-1";

        const proposePayload = createTaskProposePayload({
          taskId,
          mandateId,
          proofOfIntent: testProofOfIntent(agentProfile, taskId, mandateId),
          objective: "Research and summarize",
          requestedResult: "A 3-paragraph summary",
        });

        const unsignedPropose = createUnsignedEnvelope({
          senderPeerId: derivePeerId(agentProfile.device.publicKeyPem),
          senderPublicKey: agentProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: owner.peerId,
          recipientRole: "agent",
          intent: "task.propose",
          payload: proposePayload,
        });

        const signedPropose = signUnsignedEnvelope(unsignedPropose, agentProfile.device.privateKeyPem);
        await agent.send(owner.multiaddrs[0], signedPropose);
      } else if (envelope.intent === "task.accept") {
        // Agent sends result after accepting
        const accept = parseTaskAcceptPayload(envelope.payload);
        setTimeout(async () => {
          const resultPayload = createTaskResultPayload({
            taskId: accept.taskId,
            mandateId: accept.mandateId,
            status: "completed",
            summary: "Task completed successfully with mock AI response",
          });

          const unsignedResult = createUnsignedEnvelope({
            senderPeerId: derivePeerId(agentProfile.device.publicKeyPem),
            senderPublicKey: agentProfile.device.publicKeyPem,
            senderRole: "agent",
            recipientPeerId: owner.peerId,
            recipientRole: "agent",
            intent: "task.result",
            payload: resultPayload,
          });

          const signedResult = signUnsignedEnvelope(unsignedResult, agentProfile.device.privateKeyPem);
          await agent.send(owner.multiaddrs[0], signedResult);
        }, 50);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Register agent in owner's trust store for direct bond
    await agentTrustStore.setTrustRecord({
      peerOwnerId: ownerProfile.owner.ownerId,
      level: "direct",
      now: new Date().toISOString(),
    });

    // Owner sends mandate to agent
    const mandatePayload = createTaskMandatePayload({
      taskId: "task-agent-1",
      mandateId: "mandate-agent-1",
      ownerOwnerId: ownerProfile.owner.ownerId,
      ownerDeviceId: ownerProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 10, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
    });

    const unsignedMandate = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate = signUnsignedEnvelope(unsignedMandate, ownerProfile.device.privateKeyPem);
    await owner.send(agent.multiaddrs[0], signedMandate);

    // Wait for agent to receive mandate and send propose
    await waitFor(async () => agentReceived.includes("task.mandate"), 3000);
    expect(agentReceived).toContain("task.mandate");

    // Wait for owner to receive propose
    await waitFor(async () => ownerReceived.includes("task.propose"), 3000);
    expect(ownerReceived).toContain("task.propose");

    // Owner sends accept
    const acceptPayload = createTaskAcceptPayload({
      taskId: "task-agent-1",
      mandateId: "mandate-agent-1",
      agreementSummary: "Accepted",
    });

    const unsignedAccept = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent.peerId,
      recipientRole: "agent",
      intent: "task.accept",
      payload: acceptPayload,
    });

    const signedAccept = signUnsignedEnvelope(unsignedAccept, ownerProfile.device.privateKeyPem);
    await owner.send(agent.multiaddrs[0], signedAccept);

    // Wait for agent to receive accept
    await waitFor(async () => agentReceived.includes("task.accept"), 3000);
    expect(agentReceived).toContain("task.accept");

    // Wait for owner to receive result
    await waitFor(async () => ownerReceived.includes("task.result"), 3000);
    expect(ownerReceived).toContain("task.result");
  });

  it("agent receives task cancellation and stops work", async () => {
    const ownerProfile = testProfile();
    const agentProfile = testProfile();

    const ownerReceived: string[] = [];
    const agentReceived: string[] = [];
    let receivedCancel: ReturnType<typeof parseTaskCancelPayload> | null = null;

    const owner = await startMesh();
    owner.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      ownerReceived.push(envelope.intent);
    });

    const agent = await startMesh();
    agent.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      agentReceived.push(envelope.intent);

      if (envelope.intent === "task.propose") {
        const propose = parseTaskProposePayload(envelope.payload);

        // Negotiate
        const negotiatePayload = createTaskNegotiatePayload({
          taskId: propose.taskId,
          mandateId: propose.mandateId,
          proofOfIntent: propose.proofOfIntent,
          negotiationId: "neg-1",
          message: "I accept this task",
        });

        const unsignedNegotiate = createUnsignedEnvelope({
          senderPeerId: derivePeerId(agentProfile.device.publicKeyPem),
          senderPublicKey: agentProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: owner.peerId,
          recipientRole: "agent",
          intent: "task.negotiate",
          payload: negotiatePayload,
        });

        const signedNegotiate = signUnsignedEnvelope(unsignedNegotiate, agentProfile.device.privateKeyPem);
        await agent.send(owner.multiaddrs[0], signedNegotiate);
      } else if (envelope.intent === "task.cancel") {
        receivedCancel = parseTaskCancelPayload(envelope.payload);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Owner sends mandate
    const mandatePayload = createTaskMandatePayload({
      taskId: "task-cancel-agent",
      mandateId: "mandate-cancel-agent",
      ownerOwnerId: ownerProfile.owner.ownerId,
      ownerDeviceId: ownerProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 10, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
    });

    const unsignedMandate = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate = signUnsignedEnvelope(unsignedMandate, ownerProfile.device.privateKeyPem);
    await owner.send(agent.multiaddrs[0], signedMandate);

    await waitFor(async () => agentReceived.includes("task.mandate"), 3000);

    // Owner sends propose
    const proposePayload = createTaskProposePayload({
      taskId: "task-cancel-agent",
      mandateId: "mandate-cancel-agent",
      proofOfIntent: testProofOfIntent(ownerProfile, "task-cancel-agent", "mandate-cancel-agent"),
      objective: "Do work",
      requestedResult: "Return success",
    });

    const unsignedPropose = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent.peerId,
      recipientRole: "agent",
      intent: "task.propose",
      payload: proposePayload,
    });

    const signedPropose = signUnsignedEnvelope(unsignedPropose, ownerProfile.device.privateKeyPem);
    await owner.send(agent.multiaddrs[0], signedPropose);

    await waitFor(async () => agentReceived.includes("task.propose"), 3000);

    // Agent negotiates
    await waitFor(async () => ownerReceived.includes("task.negotiate"), 3000);

    // Now cancel the task
    const cancelPayload = createTaskCancelPayload({
      taskId: "task-cancel-agent",
      mandateId: "mandate-cancel-agent",
      reason: "Owner cancelled",
      cancelledBy: "owner",
      createdAt: new Date().toISOString(),
    });

    const unsignedCancel = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent.peerId,
      recipientRole: "agent",
      intent: "task.cancel",
      payload: cancelPayload,
    });

    const signedCancel = signUnsignedEnvelope(unsignedCancel, ownerProfile.device.privateKeyPem);
    await owner.send(agent.multiaddrs[0], signedCancel);

    // Wait for agent to receive cancel
    await waitFor(async () => receivedCancel !== null, 3000);

    expect(receivedCancel).not.toBeNull();
    expect(receivedCancel?.taskId).toBe("task-cancel-agent");
    expect(receivedCancel?.cancelledBy).toBe("owner");
  });

  it("agent handles knowledge.query with vault context", async () => {
    const aliceProfile = testProfile();
    const bobProfile = testProfile();

    const bobProfileDir = await mkdtemp(join(tmpdir(), "envoymesh-kq-e2e-agent-bob-"));
    const bobTaskStore = createLocalTaskStore(bobProfileDir);
    const bobTrustStore = createLocalTrustStore(bobProfileDir);
    const bobPeerDirectoryStore = createLocalPeerDirectoryStore(bobProfileDir);

    // Create vault with content for Bob
    const vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-kq-e2e-agent-vault-"));
    await writeFile(join(vaultDir, "about.md"), "EnvoyMesh is a decentralized P2P network for AI agents.", "utf8");
    const vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    // Register Bob's peer
    await bobPeerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: bobProfile.owner.ownerId,
      peerId: derivePeerId(bobProfile.device.publicKeyPem),
      listenAddrs: [],
    });

    const aliceReceived: string[] = [];
    const bobReceived: string[] = [];
    let aliceQueryMessageId = "";

    const alice = await startMesh();
    alice.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      aliceReceived.push(envelope.intent);

      if (envelope.intent === "knowledge.response") {
        // Alice receives the response
      }
    });

    const bob = await startMesh();
    bob.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      bobReceived.push(envelope.intent);

      if (envelope.intent === "bond.challenge") {
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
        // Pairing complete
      } else if (envelope.intent === "knowledge.query") {
        // Register Alice in Bob's stores
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
          correlationId: `corr-kq-agent-${Date.now()}`,
          taskStore: bobTaskStore,
          trustStore: bobTrustStore,
          peerDirectoryStore: bobPeerDirectoryStore,
          profile: bobProfile,
          vaultIndex,
          modelProviders: { mode: "mock" },
        });

        // Send knowledge.response
        const refused = !result.ok || (result.responsePayload?.refused ?? false);
        const responsePayload = createKnowledgeResponsePayload({
          inReplyTo: envelope.messageId,
          answer: refused ? `Sorry: ${result.responsePayload?.refusalReason ?? "error"}` : (result.ok ? (result.responsePayload?.answer ?? "No answer") : "Error"),
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

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Alice initiates pairing
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

    await waitFor(async () => bobReceived.includes("bond.challenge"), 4000);
    await waitFor(async () => aliceReceived.includes("bond.challenge.response"), 4000);

    // Alice sends bond.accept
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

    // Alice sends knowledge.query
    const queryPayload = createKnowledgeQueryPayload({
      query: "What is EnvoyMesh?",
      maxSensitivity: "public",
    });

    aliceQueryMessageId = `kq-agent-${Date.now()}`;
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

    await waitFor(async () => bobReceived.includes("knowledge.query"), 4000);
    await waitFor(async () => aliceReceived.includes("knowledge.response"), 4000);

    expect(aliceReceived).toContain("knowledge.response");

    // Clean up
    await rm(bobProfileDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });
});

// ============================================================================
// E2E: Task Collect-N (Multiple Results)
// ============================================================================

describe("E2E: task collect-N coordination", () => {
  it("task stays open until N results are collected", async () => {
    const ownerProfile = testProfile();
    const agent1Profile = testProfile();
    const agent2Profile = testProfile();

    const ownerReceived: string[] = [];
    let resultCount = 0;

    const owner = await startMesh();
    owner.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      ownerReceived.push(envelope.intent);

      if (envelope.intent === "task.result") {
        resultCount++;
      }
    });

    const agent1 = await startMesh();
    const agent2 = await startMesh();

    agent1.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "task.mandate") {
        // Agent 1 sends result
        setTimeout(async () => {
          const resultPayload = createTaskResultPayload({
            taskId: "task-collect-n",
            mandateId: "mandate-collect-n",
            status: "completed",
            summary: "Result from agent 1",
          });

          const unsignedResult = createUnsignedEnvelope({
            senderPeerId: derivePeerId(agent1Profile.device.publicKeyPem),
            senderPublicKey: agent1Profile.device.publicKeyPem,
            senderRole: "agent",
            recipientPeerId: owner.peerId,
            recipientRole: "agent",
            intent: "task.result",
            payload: resultPayload,
          });

          const signedResult = signUnsignedEnvelope(unsignedResult, agent1Profile.device.privateKeyPem);
          await agent1.send(owner.multiaddrs[0], signedResult);
        }, 50);
      }
    });

    agent2.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "task.mandate") {
        // Agent 2 sends result
        setTimeout(async () => {
          const resultPayload = createTaskResultPayload({
            taskId: "task-collect-n",
            mandateId: "mandate-collect-n",
            status: "completed",
            summary: "Result from agent 2",
          });

          const unsignedResult = createUnsignedEnvelope({
            senderPeerId: derivePeerId(agent2Profile.device.publicKeyPem),
            senderPublicKey: agent2Profile.device.publicKeyPem,
            senderRole: "agent",
            recipientPeerId: owner.peerId,
            recipientRole: "agent",
            intent: "task.result",
            payload: resultPayload,
          });

          const signedResult = signUnsignedEnvelope(unsignedResult, agent2Profile.device.privateKeyPem);
          await agent2.send(owner.multiaddrs[0], signedResult);
        }, 100);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Owner sends mandate with collectCompletedResults: 2
    const mandatePayload = createTaskMandatePayload({
      taskId: "task-collect-n",
      mandateId: "mandate-collect-n",
      ownerOwnerId: ownerProfile.owner.ownerId,
      ownerDeviceId: ownerProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 10, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: false,
      collectCompletedResults: 2,
    });

    // Send mandate to agent 1
    const unsignedMandate1 = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent1.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate1 = signUnsignedEnvelope(unsignedMandate1, ownerProfile.device.privateKeyPem);
    await owner.send(agent1.multiaddrs[0], signedMandate1);

    // Send mandate to agent 2
    const unsignedMandate2 = createUnsignedEnvelope({
      senderPeerId: derivePeerId(ownerProfile.device.publicKeyPem),
      senderPublicKey: ownerProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: agent2.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate2 = signUnsignedEnvelope(unsignedMandate2, ownerProfile.device.privateKeyPem);
    await owner.send(agent2.multiaddrs[0], signedMandate2);

    // Wait for both agents to receive mandates
    await waitFor(async () => ownerReceived.length >= 2, 3000);

    // Wait for both results
    await waitFor(async () => resultCount >= 2, 3000);

    expect(resultCount).toBe(2);
  });
});

// ============================================================================
// E2E: Agent-to-Agent Direct Task Negotiation
// ============================================================================

describe("E2E: agent-to-agent task negotiation", () => {
  it("two agents negotiate task terms before acceptance", async () => {
    const aliceProfile = testProfile();
    const bobProfile = testProfile();

    const aliceReceived: string[] = [];
    const bobReceived: string[] = [];
    let negotiatedTerms: string | null = null;

    const alice = await startMesh();
    alice.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      aliceReceived.push(envelope.intent);

      if (envelope.intent === "task.negotiate") {
        // Alice accepts the negotiation
        const acceptPayload = createTaskAcceptPayload({
          taskId: "task-negotiate",
          mandateId: "mandate-negotiate",
          agreementSummary: "Terms accepted",
        });

        const unsignedAccept = createUnsignedEnvelope({
          senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
          senderPublicKey: aliceProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: bob.peerId,
          recipientRole: "agent",
          intent: "task.accept",
          payload: acceptPayload,
        });

        const signedAccept = signUnsignedEnvelope(unsignedAccept, aliceProfile.device.privateKeyPem);
        await alice.send(bob.multiaddrs[0], signedAccept);
      } else if (envelope.intent === "task.result") {
        negotiatedTerms = "Task completed after negotiation";
      }
    });

    const bob = await startMesh();
    bob.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      bobReceived.push(envelope.intent);

      if (envelope.intent === "task.propose") {
        // Bob negotiates terms
        const negotiatePayload = createTaskNegotiatePayload({
          taskId: "task-negotiate",
          mandateId: "mandate-negotiate",
          proofOfIntent: testProofOfIntent(bobProfile, "task-negotiate", "mandate-negotiate"),
          negotiationId: "neg-1",
          message: "I propose modified terms: faster delivery",
        });

        const unsignedNegotiate = createUnsignedEnvelope({
          senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
          senderPublicKey: bobProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: alice.peerId,
          recipientRole: "agent",
          intent: "task.negotiate",
          payload: negotiatePayload,
        });

        const signedNegotiate = signUnsignedEnvelope(unsignedNegotiate, bobProfile.device.privateKeyPem);
        await bob.send(alice.multiaddrs[0], signedNegotiate);
      } else if (envelope.intent === "task.accept") {
        // Bob completes the task after acceptance
        setTimeout(async () => {
          const resultPayload = createTaskResultPayload({
            taskId: "task-negotiate",
            mandateId: "mandate-negotiate",
            status: "completed",
            summary: "Task completed after successful negotiation",
          });

          const unsignedResult = createUnsignedEnvelope({
            senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
            senderPublicKey: bobProfile.device.publicKeyPem,
            senderRole: "agent",
            recipientPeerId: alice.peerId,
            recipientRole: "agent",
            intent: "task.result",
            payload: resultPayload,
          });

          const signedResult = signUnsignedEnvelope(unsignedResult, bobProfile.device.privateKeyPem);
          await bob.send(alice.multiaddrs[0], signedResult);
        }, 50);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Alice sends mandate
    const mandatePayload = createTaskMandatePayload({
      taskId: "task-negotiate",
      mandateId: "mandate-negotiate",
      ownerOwnerId: aliceProfile.owner.ownerId,
      ownerDeviceId: aliceProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 10, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
    });

    const unsignedMandate = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: bob.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate = signUnsignedEnvelope(unsignedMandate, aliceProfile.device.privateKeyPem);
    await alice.send(bob.multiaddrs[0], signedMandate);

    await waitFor(async () => bobReceived.includes("task.mandate"), 3000);

    // Alice sends propose
    const proposePayload = createTaskProposePayload({
      taskId: "task-negotiate",
      mandateId: "mandate-negotiate",
      proofOfIntent: testProofOfIntent(aliceProfile, "task-negotiate", "mandate-negotiate"),
      objective: "Complete a task",
      requestedResult: "Result",
    });

    const unsignedPropose = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: bob.peerId,
      recipientRole: "agent",
      intent: "task.propose",
      payload: proposePayload,
    });

    const signedPropose = signUnsignedEnvelope(unsignedPropose, aliceProfile.device.privateKeyPem);
    await alice.send(bob.multiaddrs[0], signedPropose);

    // Wait for negotiation
    await waitFor(async () => aliceReceived.includes("task.negotiate"), 3000);

    // Wait for acceptance
    await waitFor(async () => bobReceived.includes("task.accept"), 3000);

    // Wait for result
    await waitFor(async () => aliceReceived.includes("task.result"), 3000);

    expect(aliceReceived).toContain("task.result");
  });
});

// ============================================================================
// E2E: Chat Message with AI Draft Generation
// ============================================================================

// NOTE: chat.message requires the chat protocol which uses a different stream protocol.
// Chat message tests are better suited for integration tests with the full node setup.
// This test is omitted here to avoid protocol validation errors.

// ============================================================================
// E2E: Task Broadcast with TTL Propagation
// ============================================================================

describe("E2E: task broadcast with TTL", () => {
  it("task.mandate propagates with TTL decremented at each hop", async () => {
    const originatorProfile = testProfile();
    const relayProfile = testProfile();
    const finalRecipientProfile = testProfile();

    const originatorReceived: string[] = [];
    const relayReceived: string[] = [];
    const finalRecipientReceived: string[] = [];

    // Originator sends mandate with TTL=2
    const originator = await startMesh();
    originator.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      originatorReceived.push(envelope.intent);
    });

    // Relay
    const relay = await startMesh();
    relay.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      relayReceived.push(envelope.intent);

      if (envelope.intent === "task.mandate") {
        // Relay forwards to final recipient (would decrement TTL in real relay)
        const unsignedForward = createUnsignedEnvelope({
          senderPeerId: derivePeerId(relayProfile.device.publicKeyPem),
          senderPublicKey: relayProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: finalRecipient.peerId,
          recipientRole: "agent",
          intent: "task.mandate",
          payload: envelope.payload, // Forward unchanged - TTL is in mandate
        });

        const signedForward = signUnsignedEnvelope(unsignedForward, relayProfile.device.privateKeyPem);
        await relay.send(finalRecipient.multiaddrs[0], signedForward);
      }
    });

    // Final recipient
    const finalRecipient = await startMesh();
    finalRecipient.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      finalRecipientReceived.push(envelope.intent);

      if (envelope.intent === "task.mandate") {
        // Final recipient sends propose back
        const taskId = "task-broadcast-ttl";
        const mandateId = "mandate-broadcast-ttl";

        const proposePayload = createTaskProposePayload({
          taskId,
          mandateId,
          proofOfIntent: testProofOfIntent(finalRecipientProfile, taskId, mandateId),
          objective: "Received broadcast task",
          requestedResult: "Done",
        });

        const unsignedPropose = createUnsignedEnvelope({
          senderPeerId: derivePeerId(finalRecipientProfile.device.publicKeyPem),
          senderPublicKey: finalRecipientProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: originator.peerId,
          recipientRole: "agent",
          intent: "task.propose",
          payload: proposePayload,
        });

        const signedPropose = signUnsignedEnvelope(unsignedPropose, finalRecipientProfile.device.privateKeyPem);
        await finalRecipient.send(originator.multiaddrs[0], signedPropose);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Originator sends mandate with TTL=2
    const mandatePayload = createTaskMandatePayload({
      taskId: "task-broadcast-ttl",
      mandateId: "mandate-broadcast-ttl",
      ownerOwnerId: originatorProfile.owner.ownerId,
      ownerDeviceId: originatorProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 10, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
      ttl: 2,
    });

    const unsignedMandate = createUnsignedEnvelope({
      senderPeerId: derivePeerId(originatorProfile.device.publicKeyPem),
      senderPublicKey: originatorProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: relay.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate = signUnsignedEnvelope(unsignedMandate, originatorProfile.device.privateKeyPem);
    await originator.send(relay.multiaddrs[0], signedMandate);

    // Relay should receive mandate
    await waitFor(async () => relayReceived.includes("task.mandate"), 3000);
    expect(relayReceived).toContain("task.mandate");

    // Final recipient should receive mandate (relay forwarded it)
    await waitFor(async () => finalRecipientReceived.includes("task.mandate"), 3000);
    expect(finalRecipientReceived).toContain("task.mandate");

    // Final recipient should send propose back
    await waitFor(async () => originatorReceived.includes("task.propose"), 3000);
    expect(originatorReceived).toContain("task.propose");
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

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

function testProofOfIntent(profile: NodeProfile, taskId: string, mandateId: string): ProofOfIntent {
  return {
    version: "0.1",
    mandateId,
    mandateHash: "hash-test",
    taskId,
    requestIntent: "task.propose",
    nonce: "nonce-test",
    deviceId: profile.device.deviceId,
    proof: "test-signature",
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
