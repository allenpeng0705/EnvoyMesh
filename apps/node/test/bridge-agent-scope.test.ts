import { describe, expect, it } from "vitest";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createAgentCard,
  createAgentCardResponsePayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import {
  BRIDGE_AGENT_SCOPE,
  bridgeAgentScopeNeedsRefresh,
} from "../src/bridge/agent-scope.js";

describe("bridge agent scope", () => {
  it("needs refresh when agent.card intents are missing", () => {
    expect(bridgeAgentScopeNeedsRefresh(["chat.message"])).toBe(true);
    expect(bridgeAgentScopeNeedsRefresh([...BRIDGE_AGENT_SCOPE])).toBe(false);
  });

  it("verifyInboundEnvelope accepts agent.card.response with bridge scope", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const card = createAgentCard({
      ownerId: owner.ownerId,
      displayName: "Worker",
      nodeProfile: "full",
      membership: ["task.execute", "agent-network-worker"],
    });
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: agent.agentPeerId,
        senderPublicKey: agent.publicKeyPem,
        senderRole: "agent",
        recipientRole: "agent",
        intent: "agent.card.response",
        payload: createAgentCardResponsePayload(card),
        agentCredential: createAgentCredential({
          owner,
          agent,
          scope: [...BRIDGE_AGENT_SCOPE],
        }),
      }),
      agent.privateKeyPem,
    );
    expect(verifyInboundEnvelope(envelope)).toBe(true);
  });

  it("verifyInboundEnvelope accepts task.chain.status with bridge scope + credential", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: agent.agentPeerId,
        senderPublicKey: agent.publicKeyPem,
        senderRole: "agent",
        recipientRole: "agent",
        intent: "task.chain.status",
        payload: {
          version: "0.1",
          chainId: "chain_test",
          phase: "running",
          awardMode: "direct",
          subtaskCount: 1,
          awardedCount: 0,
          partialCount: 0,
          bidCount: 0,
          steps: [],
          createdAt: new Date().toISOString(),
        },
        agentCredential: createAgentCredential({
          owner,
          agent,
          scope: [...BRIDGE_AGENT_SCOPE],
        }),
      }),
      agent.privateKeyPem,
    );
    expect(verifyInboundEnvelope(envelope)).toBe(true);
  });

  it("verifyInboundEnvelope rejects task.chain.status without agentCredential", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: agent.agentPeerId,
        senderPublicKey: agent.publicKeyPem,
        senderRole: "agent",
        recipientRole: "agent",
        intent: "task.chain.status",
        payload: {
          version: "0.1",
          chainId: "chain_test",
          phase: "running",
          awardMode: "direct",
          subtaskCount: 1,
          awardedCount: 0,
          partialCount: 0,
          bidCount: 0,
          steps: [],
          createdAt: new Date().toISOString(),
        },
      }),
      agent.privateKeyPem,
    );
    // envoy_agent_* peer id ≠ derivePeerId(pubkey) → classic "invalid signature" path
    expect(verifyInboundEnvelope(envelope)).toBe(false);
  });

  it("verifyInboundEnvelope rejects agent.card.response scoped to chat.message only", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const card = createAgentCard({
      ownerId: owner.ownerId,
      displayName: "Worker",
      nodeProfile: "full",
      membership: ["task.execute"],
    });
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: agent.agentPeerId,
        senderPublicKey: agent.publicKeyPem,
        senderRole: "agent",
        recipientRole: "agent",
        intent: "agent.card.response",
        payload: createAgentCardResponsePayload(card),
        agentCredential: createAgentCredential({
          owner,
          agent,
          scope: ["chat.message"],
        }),
      }),
      agent.privateKeyPem,
    );
    expect(verifyInboundEnvelope(envelope)).toBe(false);
  });
});
