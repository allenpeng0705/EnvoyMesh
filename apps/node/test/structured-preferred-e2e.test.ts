/**
 * E2E: structured_preferred skips chat-assist for verified peer agent (Phase 13C).
 */
import { createAgentCredential, generateAgentIdentity, verifyInboundEnvelope } from "@envoymesh/identity";
import { ApprovalQueue } from "@envoymesh/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  chatAssistApprovalConfig,
  cleanupPhase13Harness,
  createPhase13TestNode,
  deliverAgentChat,
  deliverHumanChat,
  registerBondedPeer,
  waitForPhase13,
  wireNodeServiceInboundHandlers,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

describe("E2E structured_preferred (Phase 13C)", () => {
  it("does not queue approval or auto-reply when verified peer agent sends chat", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    const approvalQueue = new ApprovalQueue();
    wireNodeServiceInboundHandlers(alice, { approvalQueue });
    await alice.service.updateNodeConfig({
      ...chatAssistApprovalConfig(alice.profile.owner.ownerId, bob.profile.owner.ownerId),
      autonomousKillSwitch: false,
      agentInteractionMode: "structured_preferred",
    });

    const bobAgent = generateAgentIdentity(bob.profile.owner.ownerId);
    const credential = createAgentCredential({
      owner: bob.profile.owner,
      agent: bobAgent,
      scope: ["chat.message", "task.execute", "message.send"],
    });

    let bobReceivedAliceAgentChat = 0;
    bob.mesh.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message" && envelope.senderRole === "agent") {
        bobReceivedAliceAgentChat++;
      }
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);
    await deliverAgentChat(
      {
        agentPeerId: bobAgent.agentPeerId,
        publicKeyPem: bobAgent.publicKeyPem,
        privateKeyPem: bobAgent.privateKeyPem,
        ownerId: bob.profile.owner.ownerId,
        credential,
      },
      bob.mesh,
      alice,
      "Agent-to-agent chat should not trigger assist",
      "msg-agent-chat-skip",
    );

    await waitForPhase13(async () => (await alice.service.listPendingApprovals()).length === 0, 3000);
    await new Promise((r) => setTimeout(r, 1500));

    expect(await alice.service.listPendingApprovals()).toHaveLength(0);
    expect(approvalQueue.listPending()).toHaveLength(0);
    expect(bobReceivedAliceAgentChat).toBe(0);
  });

  it("still queues approval for human chat when structured_preferred", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");

    wireNodeServiceInboundHandlers(alice, { approvalQueue: new ApprovalQueue() });
    await alice.service.updateNodeConfig({
      ...chatAssistApprovalConfig(alice.profile.owner.ownerId, bob.profile.owner.ownerId),
      agentInteractionMode: "structured_preferred",
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);
    await deliverHumanChat(bob, alice, "Hi Alice");

    await waitForPhase13(async () => (await alice.service.listPendingApprovals()).length === 1, 8000);
  });
});
