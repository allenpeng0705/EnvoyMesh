/**
 * Phase 33 — Agent-card auto-fetch integration test.
 *
 * Verifies `createAgentCardAutoFetcher` same-stream expect-reply:
 *   1. Bond fires → fetcher sends `agent.card.request` via sendExpectReply.
 *   2. Reply is verified, owner-matched, and cached in the agent card store.
 *   3. Second bond with a fresh cache skips the fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentCardStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  type AgentCredential,
} from "@envoymesh/identity";
import {
  createAgentCard,
  createAgentCardResponsePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { createAgentCardAutoFetcher } from "../src/agent-card-auto-fetcher.js";
import { createOutboundMeshMock } from "./helpers/outbound-mesh-mock.js";

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "agent-card-auto-fetch-"));
  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function makeBridgeIdentity() {
  const owner = generateOwnerIdentity();
  const agent = generateAgentIdentity(owner.ownerId);
  const agentCredential: AgentCredential = createAgentCredential({
    owner,
    agent,
    scope: ["chat.message", "agent.card.request", "agent.card.response"],
  });
  return {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: owner.ownerId,
    agentCredential,
  };
}

/** Build a signed agent.card.response whose card.ownerId matches `peerOwner.ownerId`. */
function makeSignedCardReplyForOwner(
  peerOwner: ReturnType<typeof generateOwnerIdentity>,
  displayName: string,
): EnvoyEnvelope {
  const peerAgent = generateAgentIdentity(peerOwner.ownerId);
  const card = createAgentCard({
    ownerId: peerOwner.ownerId,
    displayName,
    nodeProfile: "full",
    membership: ["chat.message"],
    publicTopics: [],
  });
  return signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: peerAgent.agentPeerId,
      senderPublicKey: peerAgent.publicKeyPem,
      senderRole: "agent",
      recipientRole: "agent",
      intent: "agent.card.response",
      payload: createAgentCardResponsePayload(card),
      agentCredential: createAgentCredential({
        owner: peerOwner,
        agent: peerAgent,
        scope: ["agent.card.response"],
      }),
    }),
    peerAgent.privateKeyPem,
  );
}

describe("AgentCardAutoFetcher — expect-reply caches the card", () => {
  it("fetcher expect-reply caches the card and skips when fresh", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);

      const bridge = makeBridgeIdentity();
      const peerOwner = generateOwnerIdentity();
      await trustStore.setTrustRecord({ peerOwnerId: peerOwner.ownerId, level: "direct" });

      let capturedRequest: EnvoyEnvelope | null = null;
      const reply = makeSignedCardReplyForOwner(peerOwner, "Peer 1");
      const sendExpectReply = vi.fn(async (_peerId: string, envelope: EnvoyEnvelope) => {
        capturedRequest = envelope;
        return reply;
      });

      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply,
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["tp"],
        }),
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: bridge.agentPeerId,
        }),
        fetchTimeoutMs: 200,
      });

      const r = await fetcher.onBondEstablished({
        peerOwnerId: peerOwner.ownerId,
        remotePeerId: "tp",
      });
      expect(r.outcome).toBe("sent");
      expect(capturedRequest?.intent).toBe("agent.card.request");
      expect(sendExpectReply).toHaveBeenCalledTimes(1);

      const cached = await agentCardStore.get(peerOwner.ownerId);
      expect(cached?.card.displayName).toBe("Peer 1");

      const r2 = await fetcher.onBondEstablished({
        peerOwnerId: peerOwner.ownerId,
        remotePeerId: "tp",
      });
      expect(r2.outcome).toBe("skipped-fresh");
      expect(sendExpectReply).toHaveBeenCalledTimes(1);
    } finally {
      await t.cleanup();
    }
  });

  it("silent failure: expect-reply rejection does not throw, audits failure event", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      await trustStore.setTrustRecord({ peerOwnerId: "peer-offline", level: "direct" });

      const bridge = makeBridgeIdentity();
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply: vi.fn().mockRejectedValue(new Error("agent-card-auto-fetch-timeout")),
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["tp"],
        }),
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: bridge.agentPeerId,
        }),
        fetchTimeoutMs: 50,
      });

      const r = await fetcher.onBondEstablished({
        peerOwnerId: "peer-offline",
        remotePeerId: "tp",
      });
      expect(r.outcome).toBe("failed");

      const events = await taskStore.readAuditEvents();
      const failure = events.find((e) => e.type === "agent.card.auto_fetch_failed");
      expect(failure).toBeDefined();
    } finally {
      await t.cleanup();
    }
  });
});

describe("AgentCardAutoFetcher — cooldown + remotePeerId short-circuit (Issue 3)", () => {
  it("cooldown skips the second fetch within the cooldown window", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      await trustStore.setTrustRecord({ peerOwnerId: "peer-flap", level: "direct" });

      const bridge = makeBridgeIdentity();
      // Fail the first expect-reply so nothing is cached; cooldown still records the attempt.
      const sendExpectReply = vi.fn().mockRejectedValue(new Error("flap"));
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply,
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["tp"],
        }),
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: "tp-recipient",
        }),
        fetchTimeoutMs: 200,
        refetchCooldownMs: 5_000,
      });

      const r1 = await fetcher.onBondEstablished({ peerOwnerId: "peer-flap", remotePeerId: "12D3KooWTest1" });
      expect(r1.outcome).toBe("failed");

      const r2 = await fetcher.onBondEstablished({ peerOwnerId: "peer-flap", remotePeerId: "12D3KooWTest1" });
      expect(r2.outcome).toBe("skipped-cooldown");
      expect(sendExpectReply).toHaveBeenCalledTimes(1);
    } finally {
      await t.cleanup();
    }
  });

  it("libp2p remotePeerId short-circuits to transport directly (no resolvePeerTransport call)", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      const peerOwner = generateOwnerIdentity();
      await trustStore.setTrustRecord({ peerOwnerId: peerOwner.ownerId, level: "direct" });

      const bridge = makeBridgeIdentity();
      let resolvedCalled = false;
      const reply = makeSignedCardReplyForOwner(peerOwner, "Direct");

      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply: vi.fn().mockResolvedValue(reply),
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["12D3KooWDirectPeerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"],
        }),
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async () => {
          resolvedCalled = true;
          return { transportPeerId: "should-not-be-used", recipientEnvelopePeerId: "x" };
        },
        fetchTimeoutMs: 200,
      });

      const libp2pId = "12D3KooWDirectPeerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      const r = await fetcher.onBondEstablished({ peerOwnerId: peerOwner.ownerId, remotePeerId: libp2pId });
      expect(r.outcome).toBe("sent");
      expect(resolvedCalled).toBe(false);
    } finally {
      await t.cleanup();
    }
  });

  it("envoy_ remotePeerId falls through to resolvePeerTransport", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      const peerOwner = generateOwnerIdentity();
      await trustStore.setTrustRecord({ peerOwnerId: peerOwner.ownerId, level: "direct" });

      const bridge = makeBridgeIdentity();
      let resolvedOwnerId: string | undefined;
      const reply = makeSignedCardReplyForOwner(peerOwner, "Resolved");

      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply: vi.fn().mockResolvedValue(reply),
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["resolved-tp"],
        }),
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async (ownerId: string) => {
          resolvedOwnerId = ownerId;
          return { transportPeerId: "resolved-tp", recipientEnvelopePeerId: "resolved-recipient" };
        },
        fetchTimeoutMs: 200,
      });

      const r = await fetcher.onBondEstablished({
        peerOwnerId: peerOwner.ownerId,
        remotePeerId: "envoy_device_abc123",
      });
      expect(r.outcome).toBe("sent");
      expect(resolvedOwnerId).toBe(peerOwner.ownerId);
    } finally {
      await t.cleanup();
    }
  });

  it("libp2p short-circuit sets recipientPeerId to undefined (Issue 1 header hygiene)", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      const peerOwner = generateOwnerIdentity();
      await trustStore.setTrustRecord({ peerOwnerId: peerOwner.ownerId, level: "direct" });

      const bridge = makeBridgeIdentity();
      let capturedEnvelope: Record<string, unknown> | null = null;
      const reply = makeSignedCardReplyForOwner(peerOwner, "Header");

      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply: vi.fn(async (_peerId: string, envelope: EnvoyEnvelope) => {
            capturedEnvelope = envelope as unknown as Record<string, unknown>;
            return reply;
          }),
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["12D3KooWHeaderTestXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"],
        }),
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async () => ({ transportPeerId: "x", recipientEnvelopePeerId: "x" }),
        fetchTimeoutMs: 200,
      });

      const libp2pId = "12D3KooWHeaderTestXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      await fetcher.onBondEstablished({ peerOwnerId: peerOwner.ownerId, remotePeerId: libp2pId });

      expect(capturedEnvelope).toBeTruthy();
      expect(capturedEnvelope!.recipientPeerId).toBeUndefined();
    } finally {
      await t.cleanup();
    }
  });
});
