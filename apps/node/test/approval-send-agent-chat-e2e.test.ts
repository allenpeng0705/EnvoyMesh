/**
 * E2E: inbound chat → approval queue → approvePendingApproval → sendAgentChat (US-AV2).
 */
import { verifyAgentEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import { parseChatMessagePayload } from "@envoymesh/protocol";
import { ApprovalQueue } from "@envoymesh/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  chatAssistApprovalConfig,
  cleanupPhase13Harness,
  createPhase13TestNode,
  deliverHumanChat,
  registerBondedPeer,
  waitForPhase13,
  wireNodeServiceInboundHandlers,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

describe("E2E approval → sendAgentChat (Phase 13A)", () => {
  it("queues draft when auto-send denied, then approve sends verifiable agent chat", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    const approvalQueue = new ApprovalQueue();
    wireNodeServiceInboundHandlers(alice, { approvalQueue });
    await alice.service.updateNodeConfig(
      chatAssistApprovalConfig(alice.profile.owner.ownerId, bob.profile.owner.ownerId),
    );

    let bobReceivedAgentChat: import("@envoymesh/protocol").EnvoyEnvelope | null = null;
    bob.mesh.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      if (envelope.intent !== "chat.message") return;
      if (envelope.senderRole === "agent") {
        bobReceivedAgentChat = envelope;
      }
    });

    // Open a direct connection in both directions. `probePeer` populates
    // the local peer store with the remote's loopback multiaddr; the next
    // `sendChat` then resolves the peer ID through the peer store instead
    // of having to re-dial.  The network module's `scrubPeerStoreDialHints`
    // would normally strip 127.0.0.1 as "unroutable" and empty the peer
    // store, but the scrub now keeps the original addresses when the
    // filtered result would be empty.
    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);
    await bob.mesh.probePeer(alice.mesh.multiaddrs[0]!);

    await deliverHumanChat(bob, alice, "Hello Alice, can you help?");

    await waitForPhase13(async () => (await alice.service.listPendingApprovals()).length === 1, 8000);
    const pending = await alice.service.listPendingApprovals();
    expect(pending[0]?.actionType).toBe("send_chat");

    const approved = await alice.service.approvePendingApproval(pending[0]!.id);
    expect(approved.ok).toBe(true);

    await waitForPhase13(async () => bobReceivedAgentChat !== null, 8000);
    expect(bobReceivedAgentChat!.senderRole).toBe("agent");
    expect(verifyAgentEnvelope(bobReceivedAgentChat!)).toBe(true);
    const payload = parseChatMessagePayload(bobReceivedAgentChat!.payload);
    expect(payload.senderOwnerId).toBe(alice.profile.owner.ownerId);
    expect(payload.text.length).toBeGreaterThan(0);
  });
});
