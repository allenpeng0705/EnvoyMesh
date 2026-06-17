/**
 * Phase 33 — Agent-card auto-fetch integration test.
 *
 * Verifies the integration between `createAgentCardAutoFetcher` and the inbound
 * `handleInboundAgentCardIntent`:
 *   1. Bond fires → fetcher builds & sends `agent.card.request`.
 *   2. The envelope round-trips through the inbound handler, which returns a `respond`
 *      action with a card payload.
 *   3. Sending that response envelope through the inbound handler caches the card.
 *
 * For the second bond event the auto-fetcher should skip (cache-fresh).
 * For an offline / send-failing peer, the auto-fetcher should silently audit failure and
 * NOT retry.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentCardStore,
  createHumanProfileStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  type AgentCredential,
} from "@envoymesh/identity";
import {
  createAgentCard,
  parseAgentCardResponsePayload,
} from "@envoymesh/protocol";
import { handleInboundAgentCardIntent } from "../src/agent-card-inbound.js";
import { createAgentCardAutoFetcher } from "../src/agent-card-auto-fetcher.js";

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
    scope: ["chat.message"],
  });
  return {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: owner.ownerId,
    agentCredential,
  };
}

function makeProfile() {
  const owner = generateOwnerIdentity();
  return {
    owner,
    device: {
      deviceId: "envoy:device:test",
      publicKeyPem: owner.publicKeyPem,
      privateKeyPem: owner.privateKeyPem,
    },
    deviceCertificate: {
      version: "0.1" as const,
      deviceId: "envoy:device:test",
      ownerPublicKey: owner.publicKeyPem,
      deviceProfile: "full" as const,
      capabilities: ["chat.message"],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      signature: "sig",
    },
  };
}

describe("AgentCardAutoFetcher — integration with inbound handler", () => {
  it("fetcher + inbound round-trip caches the card", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      const humanProfileStore = createHumanProfileStore(t.dir);

      const bridge = makeBridgeIdentity();
      const profile = makeProfile();
      const peerOwner = generateOwnerIdentity();
      const peerAgent = generateAgentIdentity(peerOwner.ownerId);
      const peerCredential = createAgentCredential({
        owner: peerOwner,
        agent: peerAgent,
        scope: ["chat.message"],
      });

      await trustStore.setTrustRecord({ peerOwnerId: peerOwner.ownerId, level: "direct" });

      let capturedEnvelope: unknown = null;
      const sendFn = async (_peerId: string, envelope: unknown) => {
        capturedEnvelope = envelope;
      };

      const fetcher = createAgentCardAutoFetcher({
        mesh: { send: sendFn },
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
      expect(capturedEnvelope).toBeDefined();
      // @ts-expect-error dynamic
      expect(capturedEnvelope.intent).toBe("agent.card.request");

      const card = createAgentCard({
        ownerId: peerOwner.ownerId,
        displayName: "Peer 1",
        nodeProfile: "full",
        capabilities: ["chat.message"],
        publicTopics: [],
      });

      const inbound = await handleInboundAgentCardIntent({
        envelope: {
          version: "0.1",
          messageId: "m1",
          senderPeerId: peerAgent.agentPeerId,
          senderPublicKey: peerAgent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: bridge.agentPeerId,
          recipientRole: "agent",
          intent: "agent.card.response",
          payload: { card },
          correlationId: "c1",
          createdAt: new Date().toISOString(),
          agentCredential: peerCredential,
          signature: "sig",
        },
        profile,
        bridgeIdentity: bridge,
        trustStore,
        agentCardStore,
        humanProfileStore,
        taskStore,
        remotePeerId: peerAgent.agentPeerId,
        receivedAt: Date.now(),
        correlationId: "c1",
      });
      expect(inbound.ok).toBe(true);
      expect(inbound.action).toBe("cached");

      const cached = await agentCardStore.get(peerOwner.ownerId);
      expect(cached).toBeDefined();
      expect(cached?.card.displayName).toBe("Peer 1");

      // Re-fire the bond event. The cache is fresh → no second fetch.
      const send2 = async () => {
        throw new Error("should not be called");
      };
      const fetcher2 = createAgentCardAutoFetcher({
        mesh: { send: send2 },
        bridgeIdentity: bridge,
        agentCardStore,
        trustStore,
        taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: bridge.agentPeerId,
        }),
      });
      const r2 = await fetcher2.onBondEstablished({
        peerOwnerId: peerOwner.ownerId,
        remotePeerId: "tp",
      });
      expect(r2.outcome).toBe("skipped-fresh");

      // Parse the captured envelope to confirm the structure (smoke check).
      const parsed = parseAgentCardResponsePayload({ card });
      expect(parsed.card.ownerId).toBe(peerOwner.ownerId);
    } finally {
      await t.cleanup();
    }
  });

  it("silent failure: mesh.send rejection does not throw, audits failure event", async () => {
    const t = await tempDir();
    try {
      const taskStore = createLocalTaskStore(t.dir);
      const trustStore = createLocalTrustStore(t.dir);
      const agentCardStore = createAgentCardStore(t.dir);
      await trustStore.setTrustRecord({ peerOwnerId: "peer-offline", level: "direct" });

      const bridge = makeBridgeIdentity();
      const fetcher = createAgentCardAutoFetcher({
        mesh: {
          send: async () => {
            throw new Error("agent-card-auto-fetch-timeout");
          },
        },
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
