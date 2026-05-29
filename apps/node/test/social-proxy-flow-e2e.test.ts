/**
 * E2E: social proxy intro → owner commitment → hello → agent chat → human bond accept.
 */
import { derivePeerId, verifyAgentEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import { parseChatMessagePayload } from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  ensureSocialProxyBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireNodeServiceInboundHandlers,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E social proxy flow (two-node libp2p)", () => {
  it("intro → commitment → hello → agent chat → human bond accept", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    const aliceAgent = await ensureSocialProxyBridgeIdentity(alice);
    const bobAgent = await ensureSocialProxyBridgeIdentity(bob);

    await alice.trustStore.setTrustRecord({
      peerOwnerId: bob.profile.owner.ownerId,
      level: "referred",
      displayName: "Bob",
    });
    await bob.trustStore.setTrustRecord({
      peerOwnerId: alice.profile.owner.ownerId,
      level: "referred",
      displayName: "Alice",
    });
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    wireNodeServiceInboundHandlers(alice);
    wireNodeServiceInboundHandlers(bob);

    await alice.service.updateNodeConfig({
      socialProxyEnabled: true,
      trustModeEnabled: true,
      friendAutopilotEnabled: false,
      modelProviders: { mode: "mock" },
    });
    await bob.service.updateNodeConfig({
      trustModeEnabled: true,
      modelProviders: { mode: "mock" },
    });

    let bobAgentChat: import("@envoymesh/protocol").EnvoyEnvelope | null = null;
    bob.mesh.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent === "chat.message" && envelope.senderRole === "agent") {
        bobAgentChat = envelope;
      }
    });

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);
    await bob.mesh.probePeer(alice.mesh.multiaddrs[0]!);

    const pass = await alice.service.runSocialProxyPass({
      targetOwnerId: bob.profile.owner.ownerId,
      targetPeerId: bob.mesh.peerId,
      targetAgentPeerId: bobAgent.agentPeerId,
    });
    expect(pass.ok).toBe(true);

    const sessions = await alice.service.listSocialProxySessions();
    expect(sessions.length).toBeGreaterThan(0);
    const sessionId = sessions[0]!.sessionId;

    await alice.service.advanceSocialProxySession(sessionId);

    await waitForPhase13(async () => (await bob.service.listPendingSocialIntroProposals()).length > 0);
    const proposals = await bob.service.listPendingSocialIntroProposals();
    expect(proposals[0]?.candidateOwnerId).toBe(bob.profile.owner.ownerId);

    await bob.service.approveSocialIntroCommitment(proposals[0]!.messageId);

    await waitForPhase13(async () => {
      const s = (await alice.service.listSocialProxySessions()).find((x) => x.sessionId === sessionId);
      if (!s?.ownerCommitmentRef) return false;
      return (
        s.status === "commitment_ready" ||
        s.status === "hello_pending" ||
        s.status === "hello_sent" ||
        s.status === "chatting" ||
        s.status === "bonded"
      );
    }, 10_000);

    const afterCommitment = (await alice.service.listSocialProxySessions()).find(
      (x) => x.sessionId === sessionId,
    );
    if (afterCommitment?.status === "commitment_ready") {
      await alice.service.advanceSocialProxySession(sessionId);
    }

    await waitForPhase13(async () => {
      const bond = await alice.trustStore.getTrustRecord(bob.profile.owner.ownerId);
      return bond?.level === "direct";
    }, 10_000);

    await alice.service.advanceSocialProxySession(sessionId);

    await waitForPhase13(async () => {
      if (bobAgentChat !== null) return true;
      const history = await bob.service.listChatHistory(alice.profile.owner.ownerId);
      return history.some((m) => m.sender.actorRole === "agent");
    }, 10_000);

    if (!bobAgentChat) {
      const history = await bob.service.listChatHistory(alice.profile.owner.ownerId);
      const agentLine = history.find((m) => m.sender.actorRole === "agent");
      expect(agentLine?.text).toContain("on behalf of my owner");
    } else {
      expect(verifyAgentEnvelope(bobAgentChat!)).toBe(true);
      const chatPayload = parseChatMessagePayload(bobAgentChat!.payload);
      expect(chatPayload.senderOwnerId).toBe(alice.profile.owner.ownerId);
    }

    const finalSession = (await alice.service.listSocialProxySessions()).find((s) => s.sessionId === sessionId);
    expect(finalSession?.status).toBe("chatting");

    const aliceBobBond = await alice.trustStore.getTrustRecord(bob.profile.owner.ownerId);
    expect(aliceBobBond?.level).toBe("direct");
  });
});
