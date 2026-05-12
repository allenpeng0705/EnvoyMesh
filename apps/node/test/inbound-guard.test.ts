import {
  createAgentCredential,
  generateAgentIdentity,
  generateIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import { createChatMessagePayload, createSystemPingPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { createInboundMessageGuard } from "../src/inbound-guard.js";

describe("inbound message guard", () => {
  it("allows a valid signed envelope", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedPingEnvelope();

    const decision = guard.inspect(envelope);

    expect(decision.action).toBe("allow");
    if (decision.action === "allow") {
      expect(decision.envelope.messageId).toBe(envelope.messageId);
    }
  });

  it("rejects malformed or unsigned envelopes", () => {
    const guard = createInboundMessageGuard();
    const identity = generateIdentity();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: identity.peerId,
      senderPublicKey: identity.publicKeyPem,
      intent: "system.ping",
      payload: createSystemPingPayload("hello"),
    });

    expect(guard.inspect({ not: "an envelope" })).toEqual({
      action: "reject",
      reason: "malformed or unsigned envelope",
    });
    expect(guard.inspect(unsigned)).toEqual({
      action: "reject",
      reason: "malformed or unsigned envelope",
    });
  });

  it("rejects oversized envelopes before signature verification", () => {
    const guard = createInboundMessageGuard({ maxEnvelopeBytes: 32 });

    expect(guard.inspect(signedPingEnvelope())).toEqual({
      action: "reject",
      reason: "envelope exceeds maximum size",
    });
  });

  it("rejects invalid signatures", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedPingEnvelope();

    const decision = guard.inspect({
      ...envelope,
      payload: createSystemPingPayload("tampered"),
    });

    expect(decision).toEqual({
      action: "reject",
      reason: "invalid signature",
      messageId: envelope.messageId,
    });
  });

  it("rejects replayed message IDs after accepting the first message", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedPingEnvelope();

    expect(guard.inspect(envelope).action).toBe("allow");
    expect(guard.inspect(envelope)).toEqual({
      action: "reject",
      reason: "replayed message",
      messageId: envelope.messageId,
    });
  });

  it("allows an agent chat envelope with a valid owner-signed credential", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedAgentChatEnvelope();

    const decision = guard.inspect(envelope);

    expect(decision.action).toBe("allow");
  });

  it("rejects an agent chat envelope with a tampered credential", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedAgentChatEnvelope();

    const decision = guard.inspect({
      ...envelope,
      agentCredential: {
        ...envelope.agentCredential,
        scope: ["knowledge.query"],
      },
    });

    expect(decision).toEqual({
      action: "reject",
      reason: "invalid agent credential or signature",
      messageId: envelope.messageId,
    });
  });

  it("drops oldest replay entries when maxReplayEntries is exceeded", () => {
    const guard = createInboundMessageGuard({ maxReplayEntries: 2 });
    expect(guard.inspect(signedPingEnvelope("id-a")).action).toBe("allow");
    expect(guard.inspect(signedPingEnvelope("id-b")).action).toBe("allow");
    expect(guard.inspect(signedPingEnvelope("id-c")).action).toBe("allow");
    expect(guard.inspect(signedPingEnvelope("id-a")).action).toBe("allow");
    const reb = signedPingEnvelope("id-b");
    expect(guard.inspect(reb).action).toBe("allow");
    expect(guard.inspect(reb)).toEqual({
      action: "reject",
      reason: "replayed message",
      messageId: reb.messageId,
    });
  });
});

function signedPingEnvelope(messageId: string = "message-1") {
  const identity = generateIdentity();
  const unsigned = createUnsignedEnvelope({
    senderPeerId: identity.peerId,
    senderPublicKey: identity.publicKeyPem,
    intent: "system.ping",
    payload: createSystemPingPayload("hello"),
    messageId,
    createdAt: "2026-04-27T10:00:00.000Z",
  });

  return signUnsignedEnvelope(unsigned, identity.privateKeyPem);
}

function signedAgentChatEnvelope(messageId: string = "agent-message-1") {
  const owner = generateOwnerIdentity();
  const agent = generateAgentIdentity(owner.ownerId);
  const credential = createAgentCredential({
    owner,
    agent,
    scope: ["chat.message"],
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: agent.agentPeerId,
    senderPublicKey: agent.publicKeyPem,
    senderRole: "agent",
    recipientPeerId: "envoy_recipient",
    recipientRole: "human",
    intent: "chat.message",
    payload: createChatMessagePayload({
      senderOwnerId: owner.ownerId,
      text: "hello from agent",
    }),
    agentCredential: credential,
    messageId,
    createdAt: "2026-04-27T10:00:00.000Z",
  });

  return signUnsignedEnvelope(unsigned, agent.privateKeyPem);
}
