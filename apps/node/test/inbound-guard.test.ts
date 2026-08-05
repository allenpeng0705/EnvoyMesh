import { randomUUID } from "node:crypto";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import {
  createChatMessagePayload,
  createRelayHintsResponsePayload,
  createRelayLookupResponsePayload,
  createSystemPingPayload,
  createUnsignedEnvelope,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
} from "@envoymesh/protocol";
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

  it("allows large profile.sync envelopes above the default 64 KiB cap", () => {
    const guard = createInboundMessageGuard({ maxEnvelopeBytes: 64 * 1024 });
    const identity = generateIdentity();
    const owner = generateOwnerIdentity();
    const bigInline = "A".repeat(80 * 1024);
    const unsigned = createUnsignedEnvelope({
      senderPeerId: identity.peerId,
      senderPublicKey: identity.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload: {
        profile: {
          version: "0.1",
          ownerId: owner.ownerId,
          displayName: "Big",
          username: "big01",
          profileVisibility: "private",
          updatedAt: new Date().toISOString(),
          signature: "sig-placeholder",
        },
        ownerPublicKeyPem: owner.publicKeyPem,
        publicThumbnailInline: {
          contentBase64: bigInline,
          mimeType: "image/jpeg",
          contentSha256: "a".repeat(64),
        },
      },
    });
    const envelope = signUnsignedEnvelope(unsigned, identity.privateKeyPem);
    expect(guard.inspect(envelope).action).toBe("allow");
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

  it("rejects chat.message with senderRole=agent and no agentCredential", () => {
    const guard = createInboundMessageGuard();
    const envelope = signedAgentChatEnvelope();
    const { agentCredential: _removed, ...withoutCredential } = envelope;
    void _removed;

    const decision = guard.inspect(withoutCredential as typeof envelope);

    expect(decision.action).toBe("reject");
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

  it("allows relay.lookup.response with the relay placeholder signature + public key", () => {
    const guard = createInboundMessageGuard();
    const envelope = placeholderRelayLookupResponseEnvelope();

    const decision = guard.inspect(envelope);
    expect(decision.action).toBe("allow");
    if (decision.action === "allow") {
      expect(decision.envelope.intent).toBe("relay.lookup.response");
    }
  });

  it("allows relay.hints.response with the placeholder credentials", () => {
    const guard = createInboundMessageGuard();
    const envelope = {
      ...placeholderRelayLookupResponseEnvelope(),
      messageId: randomUUID(),
      intent: "relay.hints.response" as const,
      payload: createRelayHintsResponsePayload({
        relayHints: [],
        truncated: false,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    };
    expect(guard.inspect(envelope).action).toBe("allow");
  });

  it("still rejects relay.lookup.response with a non-placeholder (forged) signature", () => {
    const guard = createInboundMessageGuard();
    const envelope = placeholderRelayLookupResponseEnvelope();

    const decision = guard.inspect({
      ...envelope,
      signature: "not-the-placeholder-forged-signature",
    });

    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toBe("invalid signature");
    }
  });

  it("rejects placeholder lookup when public key is not the relay placeholder", () => {
    const guard = createInboundMessageGuard();
    const envelope = placeholderRelayLookupResponseEnvelope();
    const decision = guard.inspect({
      ...envelope,
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\nnot-the-placeholder\n-----END PUBLIC KEY-----",
    });
    expect(decision.action).toBe("reject");
  });

  it("rejects placeholder lookup from an untrusted relay peer when trust gate is set", () => {
    const guard = createInboundMessageGuard();
    const envelope = placeholderRelayLookupResponseEnvelope();
    const decision = guard.inspect(envelope, {
      remotePeerId: envelope.senderPeerId,
      trustedRelayPeerIds: ["12D3KooWSomeOtherConfiguredRelayxxxxxxxxxxxxxxxx"],
    });
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.reason).toBe("untrusted relay control source");
    }
  });

  it("allows placeholder lookup when claimant is in trustedRelayPeerIds", () => {
    const guard = createInboundMessageGuard();
    const envelope = placeholderRelayLookupResponseEnvelope();
    const decision = guard.inspect(envelope, {
      remotePeerId: envelope.senderPeerId,
      trustedRelayPeerIds: [envelope.senderPeerId],
    });
    expect(decision.action).toBe("allow");
  });

  it("rejects non-relay-control intents that carry the placeholder signature", () => {
    const guard = createInboundMessageGuard();
    const identity = generateIdentity();
    const envelope = {
      version: "0.1" as const,
      messageId: randomUUID(),
      createdAt: new Date().toISOString(),
      senderPeerId: identity.peerId,
      senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
      senderRole: "human" as const,
      recipientPeerId: "envoy_recipient",
      recipientRole: "human" as const,
      intent: "chat.message",
      payload: createChatMessagePayload({ senderOwnerId: "envoy:owner:forged", text: "hi" }),
      signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
    };

    const decision = guard.inspect(envelope);
    expect(decision.action).toBe("reject");
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

/**
 * A relay.lookup.response envelope signed with the well-known relay
 * placeholder signature — mirrors what `placeholderReply()` in
 * apps/relay/src/standalone-relay-control.ts produces.
 */
function placeholderRelayLookupResponseEnvelope(messageId: string = randomUUID()) {
  const payload = createRelayLookupResponsePayload({
    queryId: "test-query-1",
    peers: [],
    relayHints: [],
    truncated: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  return {
    version: "0.1" as const,
    messageId,
    createdAt: new Date().toISOString(),
    senderPeerId: "12D3KooWRelayPeerIdPlaceholder",
    senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
    senderRole: "agent" as const,
    recipientPeerId: "envoy_recipient",
    recipientRole: "agent" as const,
    intent: "relay.lookup.response",
    payload,
    signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
  };
}
