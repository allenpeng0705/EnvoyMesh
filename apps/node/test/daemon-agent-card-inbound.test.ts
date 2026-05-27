import { describe, expect, it, vi } from "vitest";
import { createAgentCardStore, createHumanProfileStore, createLocalTaskStore, createLocalTrustStore } from "@envoymesh/local-store";
import {
  createAgentCard,
  createAgentCardResponsePayload,
  createAgentCardRequestPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDaemonAgentCardInbound } from "../src/daemon-agent-card-inbound.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";

describe("handleDaemonAgentCardInbound", () => {
  it("returns handled:false for non agent.card intents", async () => {
    const result = await handleDaemonAgentCardInbound({
      envelope: createUnsignedEnvelope({
        intent: "chat.message",
        senderPeerId: "peer",
        senderPublicKey: "pk",
        senderRole: "human",
        payload: {},
      }) as never,
      profile: {} as never,
      remotePeerId: "remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore: {} as never,
      trustStore: {} as never,
      agentCardStore: {} as never,
      humanProfileStore: {} as never,
      bridgeIdentity: null,
      mesh: { send: vi.fn() } as never,
    });
    expect(result).toEqual({ handled: false });
  });

  it("caches inbound agent.card.response and calls recordAgentCardCached hook", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-daemon-card-"));
    try {
      const owner = generateOwnerIdentity();
      const peerOwner = generateOwnerIdentity();
      const peerAgent = generateAgentIdentity(peerOwner.ownerId);
      const bridgeIdentity: BridgeIdentity = {
        agentPeerId: peerAgent.agentPeerId,
        agentPublicKeyPem: peerAgent.publicKeyPem,
        agentPrivateKeyPem: peerAgent.privateKeyPem,
        ownerId: owner.ownerId,
        agentCredential: createAgentCredential({
          owner: peerOwner,
          agent: peerAgent,
          scope: ["agent.card.response"],
        }),
      };
      const trustStore = createLocalTrustStore(profileDir);
      await trustStore.setTrustRecord({
        peerOwnerId: peerOwner.ownerId,
        level: "direct",
        displayName: "Peer",
      });
      const agentCardStore = createAgentCardStore(profileDir);
      const card = createAgentCard({
        ownerId: peerOwner.ownerId,
        displayName: "Peer Agent",
        nodeProfile: "primary",
        capabilities: ["task.execute"],
      });
      const unsigned = createUnsignedEnvelope({
        senderPeerId: peerAgent.agentPeerId,
        senderPublicKey: peerAgent.publicKeyPem,
        senderRole: "agent",
        intent: "agent.card.response",
        payload: createAgentCardResponsePayload(card),
        agentCredential: bridgeIdentity.agentCredential,
      });
      const envelope = signUnsignedEnvelope(unsigned, peerAgent.privateKeyPem);
      const recordAgentCardCached = vi.fn().mockResolvedValue(undefined);

      const result = await handleDaemonAgentCardInbound({
        envelope,
        profile: {
          owner,
          device: { deviceId: "envoy:device:test", publicKeyPem: "pk", privateKeyPem: "sk" },
          deviceCertificate: {
            version: "0.1",
            deviceId: "envoy:device:test",
            ownerPublicKey: owner.publicKeyPem,
            deviceProfile: "primary",
            capabilities: ["task.execute"],
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            signature: "sig",
          },
        },
        remotePeerId: peerAgent.agentPeerId,
        receivedAt: Date.now(),
        correlationId: undefined,
        taskStore: createLocalTaskStore(profileDir),
        trustStore,
        agentCardStore,
        humanProfileStore: createHumanProfileStore(profileDir),
        bridgeIdentity,
        mesh: { send: vi.fn() } as never,
        nodeService: { recordAgentCardCached } as never,
      });

      expect(result).toMatchObject({ handled: true, outcome: "cached", ownerId: peerOwner.ownerId });
      expect(recordAgentCardCached).toHaveBeenCalledWith(peerOwner.ownerId, card);
      expect(await agentCardStore.get(peerOwner.ownerId)).toBeDefined();
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("responds to agent.card.request with signed response envelope", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-daemon-card-req-"));
    try {
      const owner = generateOwnerIdentity();
      const requesterOwner = generateOwnerIdentity();
      const requesterAgent = generateAgentIdentity(requesterOwner.ownerId);
      const localAgent = generateAgentIdentity(owner.ownerId);
      const bridgeIdentity: BridgeIdentity = {
        agentPeerId: localAgent.agentPeerId,
        agentPublicKeyPem: localAgent.publicKeyPem,
        agentPrivateKeyPem: localAgent.privateKeyPem,
        ownerId: owner.ownerId,
        agentCredential: createAgentCredential({
          owner,
          agent: localAgent,
          scope: ["agent.card.request", "agent.card.response"],
        }),
      };
      const trustStore = createLocalTrustStore(profileDir);
      await trustStore.setTrustRecord({
        peerOwnerId: requesterOwner.ownerId,
        level: "direct",
        displayName: "Requester",
      });
      const send = vi.fn().mockResolvedValue(12);
      const unsigned = createUnsignedEnvelope({
        senderPeerId: requesterAgent.agentPeerId,
        senderPublicKey: requesterAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: localAgent.agentPeerId,
        recipientRole: "agent",
        intent: "agent.card.request",
        payload: createAgentCardRequestPayload({
          requesterOwnerId: requesterOwner.ownerId,
          requesterDeviceId: "envoy:device:req",
        }),
        agentCredential: createAgentCredential({
          owner: requesterOwner,
          agent: requesterAgent,
          scope: ["agent.card.request"],
        }),
      });
      const envelope = signUnsignedEnvelope(unsigned, requesterAgent.privateKeyPem);

      const result = await handleDaemonAgentCardInbound({
        envelope,
        profile: {
          owner,
          device: { deviceId: "envoy:device:local", publicKeyPem: "pk", privateKeyPem: "sk" },
          deviceCertificate: {
            version: "0.1",
            deviceId: "envoy:device:local",
            ownerPublicKey: owner.publicKeyPem,
            deviceProfile: "primary",
            capabilities: ["task.execute"],
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            signature: "sig",
          },
        },
        remotePeerId: requesterAgent.agentPeerId,
        receivedAt: Date.now(),
        correlationId: "corr-req",
        taskStore: createLocalTaskStore(profileDir),
        trustStore,
        agentCardStore: createAgentCardStore(profileDir),
        humanProfileStore: createHumanProfileStore(profileDir),
        bridgeIdentity,
        mesh: { send } as never,
      });

      expect(result).toEqual({ handled: true, outcome: "responded" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[1]?.intent).toBe("agent.card.response");
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});
